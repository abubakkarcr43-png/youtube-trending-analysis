"""
Flask backend for the YouTube Trending Analytics landing page.

Run (PowerShell):
  $env:FLASK_APP="app.py"
  $env:FLASK_ENV="development"
  flask run
"""

from __future__ import annotations

import os
import sqlite3
import time
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse

import jwt
from flask import Flask, redirect, render_template, request, make_response, url_for, jsonify
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from dotenv import load_dotenv
except ImportError as exc:  # requirements.txt installs this in normal environments.
    raise RuntimeError("python-dotenv is required to load .env configuration.") from exc

load_dotenv()

from services.youtube_service import YouTubeService, YouTubeServiceError
from utils.analytics import analyze_videos, build_insights, performance_score

# Fixed demo account (for testing / presentations). Change via env in production.
DEMO_USERNAME = os.environ.get("DEMO_USERNAME", "abubakkar").strip().lower()
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "123456789")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()
# JWT "sub" value that is not a numeric DB id — handled in current_user().
DEMO_JWT_SUB = "static"


def create_app() -> Flask:
    """
    App factory pattern keeps the project scalable (easy to add routes/blueprints later).
    """
    app = Flask(__name__)

    # Secret used to sign JWT tokens (change this in production).
    # For a college demo, this is fine; for real deployments, use environment variables.
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    # JWT cookie configuration (7 days)
    app.config["JWT_COOKIE_NAME"] = "auth_token"
    app.config["JWT_EXPIRES_SECONDS"] = 60 * 60 * 24 * 7  # 7 days
    youtube_service = YouTubeService(YOUTUBE_API_KEY)

    # Project base directory (folder containing app.py).
    base_dir = Path(app.root_path)

    # Simple SQLite DB + dataset file inside project folder (easy demo setup).
    db_path = base_dir / "users.db"
    dataset_path = base_dir / "yta.xlsx"

    # Cache dataset in-memory (reload only if file changed).
    dataset_cache: dict[str, object] = {"mtime": None, "df": None}

    def get_db() -> sqlite3.Connection:
        """
        Returns a SQLite connection with row access by column name.
        """
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def init_db() -> None:
        """
        Creates the users table if it doesn't exist.
        """
        with get_db() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  email TEXT NOT NULL UNIQUE,
                  password_hash TEXT NOT NULL,
                  created_at INTEGER NOT NULL
                );
                """
            )
            conn.commit()

    init_db()

    def load_dataset():
        """
        Load yta.xlsx into a pandas DataFrame (cached by file mtime).
        Dashboard depends on this dataset.
        """
        try:
            import pandas as pd  # lazy import so app can start even if pandas missing
        except Exception as e:  # pragma: no cover
            raise RuntimeError("pandas is required to load yta.xlsx. Install pandas + openpyxl.") from e

        if not dataset_path.exists():
            raise FileNotFoundError(f"Dataset not found: {dataset_path}")

        mtime = dataset_path.stat().st_mtime
        if dataset_cache["df"] is not None and dataset_cache["mtime"] == mtime:
            return dataset_cache["df"]

        df = pd.read_excel(str(dataset_path))
        dataset_cache["df"] = df
        dataset_cache["mtime"] = mtime
        return df

    def create_jwt(*, sub: str, email: str) -> str:
        """
        Create a signed JWT with 7 day expiry.
        `sub` is either a database user id (stringified int) or DEMO_JWT_SUB for the demo user.
        """
        now = int(time.time())
        payload = {
            "sub": sub,
            "email": email,
            "iat": now,
            "exp": now + int(app.config["JWT_EXPIRES_SECONDS"]),
        }
        return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")

    def read_jwt(token: str) -> dict | None:
        """
        Validate JWT and return payload, else None.
        """
        try:
            return jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
        except Exception:
            return None

    def current_user() -> sqlite3.Row | SimpleNamespace | None:
        """
        Resolve logged-in user from JWT cookie (if present).
        Demo account uses sub=DEMO_JWT_SUB (no DB row required).
        """
        token = request.cookies.get(app.config["JWT_COOKIE_NAME"])
        if not token:
            return None
        payload = read_jwt(token)
        if not payload:
            return None
        sub = payload.get("sub")
        if not sub:
            return None
        if sub == DEMO_JWT_SUB:
            return SimpleNamespace(
                id=0,
                name=DEMO_USERNAME,
                email=payload.get("email") or DEMO_USERNAME,
            )
        with get_db() as conn:
            return conn.execute("SELECT id, name, email FROM users WHERE id = ?", (sub,)).fetchone()

    def login_required(view):
        """
        Route guard: redirect to /login if not authenticated.
        """

        @wraps(view)
        def wrapper(*args, **kwargs):
            if not current_user():
                return redirect(url_for("login", next=request.path))
            return view(*args, **kwargs)

        return wrapper

    @app.context_processor
    def inject_user():
        """
        Makes `user` available in all templates for navbar UI.
        """
        return {"user": current_user()}

    @app.get("/")
    def index():
        # Public landing page (no login required).
        # Uses dataset aggregates for hero stat cards when available.
        stats = {
            "total_views": 2394465947,
            "total_likes": 80975418,
            "trending_videos": 1000,
            "engagement_rate": 4.36,
        }
        try:
            df = load_dataset()
            total_views = int(df["Views"].fillna(0).sum()) if "Views" in df.columns else stats["total_views"]
            total_likes = int(df["Likes"].fillna(0).sum()) if "Likes" in df.columns else stats["total_likes"]
            trending_videos = int(len(df))
            total_comments = int(df["Comments"].fillna(0).sum()) if "Comments" in df.columns else 0
            engagement = ((total_likes + total_comments) / total_views * 100) if total_views else 0
            stats = {
                "total_views": total_views,
                "total_likes": total_likes,
                "trending_videos": trending_videos,
                "engagement_rate": round(engagement, 2),
            }
        except Exception:
            # Fallback values ensure landing still loads if dataset unavailable.
            pass

        return render_template("landing.html", stats=stats)

    @app.route("/register", methods=["GET", "POST"])
    def register():
        """
        Register a user with name, email, password (hashed).
        """
        if request.method == "GET":
            if current_user():
                return redirect(url_for("dashboard"))
            return render_template("register.html")

        name = (request.form.get("name") or "").strip()
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        confirm = request.form.get("confirm_password") or ""

        # Server-side validation (never rely only on JS).
        if not name or len(name) < 2:
            return render_template("register.html", error="Please enter your full name."), 400
        if "@" not in email or "." not in email or len(email) < 6:
            return render_template("register.html", error="Please enter a valid email address."), 400
        if len(password) < 6:
            return render_template("register.html", error="Password must be at least 6 characters."), 400
        if password != confirm:
            return render_template("register.html", error="Passwords do not match."), 400

        password_hash = generate_password_hash(password)
        try:
            with get_db() as conn:
                cur = conn.execute(
                    "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (name, email, password_hash, int(time.time())),
                )
                conn.commit()
                user_id = int(cur.lastrowid)
        except sqlite3.IntegrityError:
            return render_template("register.html", error="An account with this email already exists."), 400

        token = create_jwt(sub=str(user_id), email=email)
        resp = make_response(redirect(url_for("dashboard")))
        resp.set_cookie(
            app.config["JWT_COOKIE_NAME"],
            token,
            max_age=int(app.config["JWT_EXPIRES_SECONDS"]),
            httponly=True,
            samesite="Lax",
            secure=False,  # set True behind HTTPS
        )
        return resp

    def safe_next_url(candidate: str) -> str:
        """
        Avoid open redirects: only allow same-site relative paths.
        """
        default = url_for("dashboard")
        if not candidate:
            return default
        parsed = urlparse(candidate)
        if parsed.scheme or parsed.netloc:
            return default
        if not candidate.startswith("/"):
            return default
        return candidate

    @app.route("/login", methods=["GET", "POST"])
    def login():
        """
        Login with username (demo) or email (registered users) + password; set JWT cookie.
        """
        if request.method == "GET":
            if current_user():
                return redirect(url_for("dashboard"))
            return render_template("login.html", next=request.args.get("next", ""))

        # Prefer `username` from the form; fall back to `email` for older templates.
        login_id = (request.form.get("username") or request.form.get("email") or "").strip()
        login_id_lower = login_id.lower()
        password = request.form.get("password") or ""
        next_path = safe_next_url((request.form.get("next") or "").strip())

        if not login_id:
            return render_template("login.html", error="Please enter your username.", next=next_path), 400
        if not password:
            return render_template("login.html", error="Please enter your password.", next=next_path), 400

        # --- Demo account (username, no email shape required) ---
        if login_id_lower == DEMO_USERNAME and password == DEMO_PASSWORD:
            token = create_jwt(sub=DEMO_JWT_SUB, email=DEMO_USERNAME)
            resp = make_response(redirect(next_path))
            resp.set_cookie(
                app.config["JWT_COOKIE_NAME"],
                token,
                max_age=int(app.config["JWT_EXPIRES_SECONDS"]),
                httponly=True,
                samesite="Lax",
                secure=False,  # set True behind HTTPS
            )
            return resp

        # --- Registered users: login_id must look like an email ---
        if "@" not in login_id_lower or "." not in login_id_lower:
            return render_template(
                "login.html",
                error="Invalid credentials. Use the demo username or a registered email.",
                next=next_path,
            ), 401

        with get_db() as conn:
            user = conn.execute(
                "SELECT id, name, email, password_hash FROM users WHERE email = ?",
                (login_id_lower,),
            ).fetchone()

        if not user or not check_password_hash(user["password_hash"], password):
            return render_template("login.html", error="Invalid credentials. Please try again.", next=next_path), 401

        token = create_jwt(sub=str(int(user["id"])), email=user["email"])
        resp = make_response(redirect(next_path))
        resp.set_cookie(
            app.config["JWT_COOKIE_NAME"],
            token,
            max_age=int(app.config["JWT_EXPIRES_SECONDS"]),
            httponly=True,
            samesite="Lax",
            secure=False,  # set True behind HTTPS
        )
        return resp

    @app.get("/logout")
    def logout():
        """
        Clear auth cookie and return to home.
        """
        resp = make_response(redirect(url_for("index")))
        resp.set_cookie(app.config["JWT_COOKIE_NAME"], "", expires=0, httponly=True, samesite="Lax")
        return resp

    @app.get("/dashboard")
    @login_required
    def dashboard():
        """
        Protected dashboard page.
        """
        return render_template("dashboard.html")

    @app.get("/api/dashboard-data")
    @login_required
    def dashboard_data():
        """
        Protected JSON endpoint used by the dashboard UI.
        Loads yta.xlsx and returns summary metrics + chart-friendly series + table preview.
        """
        df = load_dataset()

        # Normalize expected columns (dataset uses these names).
        # We keep this defensive so small dataset changes don't crash the UI.
        cols = set(str(c) for c in df.columns)
        required = {
            "Title",
            "Channel_Name",
            "Category",
            "Trending_Date",
            "Views",
            "Likes",
            "Comments",
            "Country",
        }
        missing = sorted(required - cols)
        if missing:
            return jsonify({"error": f"Dataset missing columns: {', '.join(missing)}"}), 400

        # Coerce numeric columns
        for c in ["Views", "Likes", "Comments"]:
            df[c] = df[c].fillna(0)
        # Date parsing for trending date
        try:
            import pandas as pd

            df["Trending_Date"] = pd.to_datetime(df["Trending_Date"], errors="coerce")
        except Exception:
            pass

        total_rows = int(len(df))
        total_views = int(df["Views"].sum())
        total_likes = int(df["Likes"].sum())
        total_comments = int(df["Comments"].sum())

        # Top category and top channel by total views
        top_category = (
            df.groupby("Category", dropna=False)["Views"].sum().sort_values(ascending=False).head(1).index.tolist()
        )
        top_category = str(top_category[0]) if top_category else "—"

        top_channel = (
            df.groupby("Channel_Name", dropna=False)["Views"].sum().sort_values(ascending=False).head(1).index.tolist()
        )
        top_channel = str(top_channel[0]) if top_channel else "—"

        # Top categories (bar)
        cat_views = df.groupby("Category")["Views"].sum().sort_values(ascending=False).head(7)
        categories = [{"label": str(k), "value": int(v)} for k, v in cat_views.items()]

        # Top channels (bar)
        ch_views = df.groupby("Channel_Name")["Views"].sum().sort_values(ascending=False).head(7)
        channels = [{"label": str(k), "value": int(v)} for k, v in ch_views.items()]

        # Daily growth by Trending_Date (line)
        if "Trending_Date" in df.columns:
            growth = (
                df.dropna(subset=["Trending_Date"])
                .groupby(df["Trending_Date"].dt.date)["Views"]
                .sum()
                .sort_index()
                .tail(21)
            )
            daily_growth = [{"label": str(k), "value": int(v)} for k, v in growth.items()]
        else:
            daily_growth = []

        # Like vs Comment ratio (scatter points limited)
        sample = df.sample(min(220, len(df)), random_state=7)
        ratio_points = [
            {"x": int(row["Likes"]), "y": int(row["Comments"])} for _, row in sample[["Likes", "Comments"]].iterrows()
        ]

        # Region-wise trends (top countries by views)
        country_views = df.groupby("Country")["Views"].sum().sort_values(ascending=False).head(12)
        regions = [{"label": str(k), "value": int(v)} for k, v in country_views.items()]

        # Table preview (first 80 rows)
        preview_cols = [
            "Video_ID",
            "Title",
            "Channel_Name",
            "Category",
            "Trending_Date",
            "Views",
            "Likes",
            "Comments",
            "Country",
        ]
        preview_cols = [c for c in preview_cols if c in df.columns]
        preview = df[preview_cols].head(80).fillna("").to_dict(orient="records")

        return jsonify(
            {
                "kpis": {
                    "rows": total_rows,
                    "views": total_views,
                    "likes": total_likes,
                    "comments": total_comments,
                    "topCategory": top_category,
                    "topChannel": top_channel,
                },
                "charts": {
                    "topCategories": categories,
                    "topChannels": channels,
                    "dailyViewGrowth": daily_growth,
                    "likeCommentScatter": ratio_points,
                    "regionViews": regions,
                },
                "table": {"columns": preview_cols, "rows": preview},
            }
        )

    @app.post("/api/analyze-channel")
    @login_required
    def analyze_channel():
        """Resolve and analyze a public YouTube channel using YouTube Data API v3."""
        payload = request.get_json(silent=True) or {}
        query = str(payload.get("channel", "")).strip()
        if not query:
            return jsonify({"error": "Enter a channel name, @handle, or channel ID."}), 400

        try:
            channel = youtube_service.resolve_channel(query)
            videos = youtube_service.fetch_videos(channel["uploads_playlist_id"])
            analytics = analyze_videos(videos)
            result = {
                "success": True,
                "channel": channel,
                "videos": videos,
                "analytics": analytics,
                "score": performance_score(analytics),
                "insights": build_insights(analytics),
                "updated_at": int(time.time()),
            }
            return jsonify(result)
        except YouTubeServiceError as exc:
            return jsonify({"success": False, "error_type": exc.error_type, "message": exc.message, "error": exc.message}), exc.status_code
        except Exception:
            app.logger.exception("Unexpected channel analysis failure")
            return jsonify({"success": False, "error_type": "internal_error", "message": "Channel analysis failed unexpectedly. Please try again."}), 502

    @app.get("/api/youtube-health")
    def youtube_health():
        """Return safe configuration diagnostics without revealing the API key."""
        return jsonify(youtube_service.health())

    @app.get("/api/download-csv")
    @login_required
    def download_csv():
        """
        Download the full dataset as CSV.
        """
        df = load_dataset()
        from io import StringIO
        import pandas as pd

        csv_buffer = StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)
        
        response = make_response(csv_buffer.getvalue())
        response.headers["Content-Disposition"] = "attachment; filename=yta_dataset.csv"
        response.headers["Content-Type"] = "text/csv"
        return response

    return app


# Flask will discover `app` for `flask run`.
app = create_app()


if __name__ == "__main__":
    # Helpful for direct execution: python app.py
    app.run(debug=True,host="0.0.0.0")
    