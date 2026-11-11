/*
  Landing page interactions (UI-only simulation)
  - Loader animation + fade-out
  - Mobile navbar toggle + active link highlight
  - Animated counters on scroll
  - Canvas FX particles + chart placeholders
  - Interactive dashboard placeholders (filters, refresh, insight generator)
  - Smooth micro-animations for a premium analytics feel
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Loader ----------
  const loader = $("#pageLoader");
  const hideLoader = () => {
    if (!loader) return;
    loader.classList.add("is-hidden");
    setTimeout(() => loader.remove(), 650);
  };

  // A short delay makes the loading animation feel intentional for presentations.
  window.addEventListener("load", () => setTimeout(hideLoader, 650), { once: true });

  // ---------- Navbar (mobile) ----------
  const navToggle = $("#navToggle");
  const navMenu = $("#navMenu");

  const setNavExpanded = (isOpen) => {
    if (!navToggle || !navMenu) return;
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navMenu.classList.toggle("is-open", isOpen);
  };

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const isOpen = navMenu.classList.contains("is-open");
      setNavExpanded(!isOpen);
    });

    // Close menu when clicking a link (mobile UX)
    $$(".nav__link, .nav__cta", navMenu).forEach((a) => {
      a.addEventListener("click", () => setNavExpanded(false));
    });

    // Close on escape for accessibility
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setNavExpanded(false);
    });
  }

  // ---------- Active nav link highlight on scroll ----------
  const sections = ["home", "trending", "creators", "analytics", "insights", "dashboard"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = $$(".nav__link");

  const setActiveLink = (hash) => {
    navLinks.forEach((l) => l.classList.toggle("is-active", l.getAttribute("href") === hash));
  };

  const updateActiveOnScroll = () => {
    if (!sections.length || !navLinks.length) return;
    const y = window.scrollY + 120;
    let active = "#home";
    for (const s of sections) {
      if (s.offsetTop <= y) active = `#${s.id}`;
    }
    setActiveLink(active);
  };
  window.addEventListener("scroll", updateActiveOnScroll, { passive: true });
  updateActiveOnScroll();

  // ---------- Animated counters (IntersectionObserver) ----------
  const counters = $$(".counter");
  const animateCounter = (el) => {
    const target = Number(el.dataset.target || "0");
    const duration = 950;
    const start = performance.now();
    const from = 0;

    const step = (t) => {
      const p = clamp((t - start) / duration, 0, 1);
      // Ease-out cubic for premium feel
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(from + (target - from) * eased);
      el.textContent = String(value);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if ("IntersectionObserver" in window && counters.length) {
    const seen = new WeakSet();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !seen.has(e.target)) {
            seen.add(e.target);
            animateCounter(e.target);
          }
        });
      },
      { threshold: 0.35 }
    );
    counters.forEach((c) => io.observe(c));
  } else {
    counters.forEach((c) => animateCounter(c));
  }

  // ---------- Footer year ----------
  const yearNow = $("#yearNow");
  if (yearNow) yearNow.textContent = String(new Date().getFullYear());

  // ---------- Background particle FX (canvas) ----------
  const fxCanvas = $("#fxCanvas");
  const fx = fxCanvas?.getContext?.("2d");
  const particles = [];

  const sizeFx = () => {
    if (!fxCanvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    fxCanvas.width = Math.floor(window.innerWidth * dpr);
    fxCanvas.height = Math.floor(window.innerHeight * dpr);
    fxCanvas.style.width = `${window.innerWidth}px`;
    fxCanvas.style.height = `${window.innerHeight}px`;
    if (fx) fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawnParticle = () => {
    particles.push({
      x: rand(0, window.innerWidth),
      y: rand(0, window.innerHeight),
      r: rand(0.6, 2.1),
      vx: rand(-0.25, 0.25),
      vy: rand(-0.25, 0.25),
      a: rand(0.08, 0.22),
      red: Math.random() < 0.35,
    });
  };

  const drawFx = () => {
    if (!fx || !fxCanvas) return;
    fx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Connect lines for that “data network” look.
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = window.innerWidth + 10;
      if (p.x > window.innerWidth + 10) p.x = -10;
      if (p.y < -10) p.y = window.innerHeight + 10;
      if (p.y > window.innerHeight + 10) p.y = -10;

      fx.beginPath();
      fx.fillStyle = p.red ? `rgba(255,0,60,${p.a})` : `rgba(255,255,255,${p.a})`;
      fx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.hypot(dx, dy);
        if (d < 120) {
          const alpha = (1 - d / 120) * 0.08;
          fx.beginPath();
          fx.strokeStyle = `rgba(255,255,255,${alpha})`;
          fx.moveTo(p.x, p.y);
          fx.lineTo(q.x, q.y);
          fx.stroke();
        }
      }
    }

    requestAnimationFrame(drawFx);
  };

  if (fxCanvas && fx) {
    sizeFx();
    window.addEventListener("resize", sizeFx);
    const desired = Math.min(90, Math.max(45, Math.floor(window.innerWidth / 24)));
    for (let i = 0; i < desired; i++) spawnParticle();
    drawFx();
  }

  // ---------- Chart placeholders (canvas drawings) ----------
  const charts = $$(".chart__canvas");

  const drawGrid = (ctx, w, h) => {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, h - 14);
      ctx.stroke();
    }
    for (let y = 28; y < h; y += 44) {
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(w - 14, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawLine = (ctx, w, h, points, colorA, colorB) => {
    ctx.save();
    const pad = 18;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad + (w - pad * 2) * (i / (points.length - 1));
      const y = pad + (h - pad * 2) * (1 - p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = colorA;
    ctx.lineWidth = 2.3;
    ctx.shadowColor = colorB;
    ctx.shadowBlur = 18;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,0,60,0.20)");
    grad.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  };

  const drawBars = (ctx, w, h, bars) => {
    ctx.save();
    const pad = 18;
    const bw = (w - pad * 2) / bars.length;
    bars.forEach((v, i) => {
      const x = pad + i * bw + bw * 0.16;
      const height = (h - pad * 2) * v;
      const y = h - pad - height;
      const r = 10;
      const grad = ctx.createLinearGradient(0, y, 0, y + height);
      grad.addColorStop(0, "rgba(255,0,60,0.92)");
      grad.addColorStop(1, "rgba(255,255,255,0.12)");
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, bw * 0.68, height, r);
      ctx.fill();
    });
    ctx.restore();
  };

  const roundRect = (ctx, x, y, w, h, r) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  const drawDonut = (ctx, w, h, ratio) => {
    ctx.save();
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.33;
    const thick = r * 0.45;

    // Base ring
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = thick;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Active ring
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * ratio;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,0,60,0.92)";
    ctx.shadowColor = "rgba(255,0,60,0.35)";
    ctx.shadowBlur = 18;
    ctx.lineCap = "round";
    ctx.lineWidth = thick;
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();

    // Center label
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "700 20px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(ratio * 100)}%`, cx, cy + 6);
    ctx.restore();
  };

  const renderChart = (canvas) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Respect devicePixelRatio for sharp canvases
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || 640;
    const cssH = canvas.clientHeight || 240;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW;
    const h = cssH;

    // Background
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "rgba(255,255,255,0.03)");
    bg.addColorStop(1, "rgba(255,0,60,0.03)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h);

    const type = canvas.dataset.chart || "growth";
    if (type === "categories") {
      drawBars(ctx, w, h, [0.56, 0.72, 0.44, 0.62, 0.38, 0.52]);
    } else if (type === "channels") {
      drawLine(
        ctx,
        w,
        h,
        [0.22, 0.30, 0.28, 0.44, 0.41, 0.54, 0.63, 0.58, 0.74, 0.70],
        "rgba(255,255,255,0.88)",
        "rgba(255,255,255,0.20)"
      );
    } else if (type === "growth") {
      drawLine(
        ctx,
        w,
        h,
        [0.12, 0.18, 0.26, 0.22, 0.35, 0.42, 0.38, 0.55, 0.60, 0.72, 0.68],
        "rgba(255,0,60,0.95)",
        "rgba(255,0,60,0.32)"
      );
    } else if (type === "ratio") {
      drawDonut(ctx, w, h, rand(0.62, 0.86));
    }
  };

  const renderAllCharts = () => charts.forEach(renderChart);
  if (charts.length) {
    renderAllCharts();
    window.addEventListener("resize", () => {
      // Debounce resize redraw to keep it smooth
      clearTimeout(window.__chartT);
      window.__chartT = setTimeout(renderAllCharts, 150);
    });
  }

  // Refresh button in the first chart
  $$(".chipBtn[data-action='refresh']").forEach((btn) => {
    btn.addEventListener("click", () => {
      // For a demo: just re-render charts with slight randomness
      renderAllCharts();
    });
  });

  // Segment buttons (channels chart range)
  $$(".seg__btn").forEach((b) => {
    b.addEventListener("click", () => {
      const wrap = b.closest(".seg");
      if (!wrap) return;
      $$(".seg__btn", wrap).forEach((x) => x.classList.toggle("is-on", x === b));
      renderAllCharts();
    });
  });

  // ---------- Region grid tiles ----------
  const regionGrid = $("#regionGrid");
  const buildRegionGrid = () => {
    if (!regionGrid) return;
    regionGrid.innerHTML = "";
    const tiles = 96; // 12x8 grid look
    for (let i = 0; i < tiles; i++) {
      const d = document.createElement("div");
      d.className = "tile";
      const r = Math.random();
      if (r > 0.82) d.classList.add("hot");
      else if (r > 0.55) d.classList.add("mid");
      else d.classList.add("cool");
      d.title = "Region signal intensity";
      regionGrid.appendChild(d);
    }
  };
  buildRegionGrid();
  setInterval(buildRegionGrid, 6000);

  // ---------- Creators + Viral lists ----------
  const creatorsList = $("#creatorsList");
  const viralList = $("#viralList");
  const creators = [
    { name: "NovaByte", sub: "Tech • +18% weekly growth", score: "92" },
    { name: "PixelPulse", sub: "Gaming • High retention", score: "89" },
    { name: "VibeVerse", sub: "Music • Viral shorts", score: "87" },
    { name: "LearnSprint", sub: "Education • Fast comments", score: "84" },
  ];
  const videos = [
    { name: "48 Hours to Viral", sub: "Shorts • view velocity spike", score: "9.3" },
    { name: "AI Edits Like Magic", sub: "Tech • share rate ↑", score: "9.1" },
    { name: "Insane Gaming Clip", sub: "Gaming • retention ↑", score: "8.9" },
    { name: "1 Minute Music Hook", sub: "Music • replay rate ↑", score: "8.7" },
  ];

  const renderRows = (root, items, icon) => {
    if (!root) return;
    root.innerHTML = "";
    items.forEach((it) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="avatar"><i class="fa-solid ${icon}"></i></div>
        <div>
          <div class="row__title">${it.name}</div>
          <div class="row__sub">${it.sub}</div>
        </div>
        <div class="pill2">Score ${it.score}</div>
      `;
      root.appendChild(row);
    });
  };
  renderRows(creatorsList, creators, "fa-user-astronaut");
  renderRows(viralList, videos, "fa-film");

  // ---------- Hero pulses (small live feel) ----------
  const ratioPulse = $("#ratioPulse");
  const subsPulse = $("#subsPulse");
  const trendScoreEl = $("#trendScore");
  const trendBar = $("#trendBar");
  const kpiTrending = $("#kpiTrending");
  const liveLabel = $("#liveLabel");

  const updateHeroPulse = () => {
    if (ratioPulse) ratioPulse.textContent = String(Math.floor(rand(22, 36)));
    if (subsPulse) subsPulse.textContent = rand(2.2, 4.8).toFixed(1);

    const score = rand(8.1, 9.4);
    const pct = clamp(score * 10, 70, 95);
    if (trendScoreEl) trendScoreEl.textContent = score.toFixed(1);
    if (kpiTrending) kpiTrending.textContent = score.toFixed(1);
    if (trendBar) trendBar.style.width = `${pct}%`;

    if (liveLabel) {
      liveLabel.textContent = pick(["Streaming metrics", "Syncing signals", "Updating trends", "Refreshing insights"]);
    }
  };
  updateHeroPulse();
  setInterval(updateHeroPulse, 2600);

  // ---------- Sparkline (real-time panel) ----------
  const sparkCanvas = $("#sparkCanvas");
  const sctx = sparkCanvas?.getContext?.("2d");
  const spark = {
    values: Array.from({ length: 42 }, () => rand(0.25, 0.75)),
  };

  const sizeSpark = () => {
    if (!sparkCanvas || !sctx) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = sparkCanvas.clientWidth || 640;
    const h = sparkCanvas.clientHeight || 160;
    sparkCanvas.width = Math.floor(w * dpr);
    sparkCanvas.height = Math.floor(h * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const drawSpark = () => {
    if (!sparkCanvas || !sctx) return;
    const w = sparkCanvas.clientWidth || 640;
    const h = sparkCanvas.clientHeight || 160;
    sctx.clearRect(0, 0, w, h);

    // Background fade
    const bg = sctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "rgba(255,255,255,0.03)");
    bg.addColorStop(1, "rgba(255,0,60,0.03)");
    sctx.fillStyle = bg;
    sctx.fillRect(0, 0, w, h);

    // Line
    const pad = 14;
    sctx.beginPath();
    spark.values.forEach((v, i) => {
      const x = pad + (w - pad * 2) * (i / (spark.values.length - 1));
      const y = pad + (h - pad * 2) * (1 - v);
      if (i === 0) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
    });
    sctx.strokeStyle = "rgba(255,0,60,0.92)";
    sctx.lineWidth = 2.4;
    sctx.shadowColor = "rgba(255,0,60,0.30)";
    sctx.shadowBlur = 18;
    sctx.stroke();

    requestAnimationFrame(drawSpark);
  };

  const rtVelocity = $("#rtVelocity");
  const rtPulse = $("#rtPulse");
  const rtRetention = $("#rtRetention");

  const tickRealtime = () => {
    if (rtVelocity) rtVelocity.textContent = rand(8.5, 18.8).toFixed(1);
    if (rtPulse) rtPulse.textContent = String(Math.floor(rand(72, 96)));
    if (rtRetention) rtRetention.textContent = String(Math.floor(rand(58, 84)));

    // Shift spark data
    spark.values.shift();
    const last = spark.values[spark.values.length - 1] ?? 0.55;
    const next = clamp(last + rand(-0.12, 0.14), 0.15, 0.92);
    spark.values.push(next);
  };

  if (sparkCanvas && sctx) {
    sizeSpark();
    window.addEventListener("resize", () => {
      clearTimeout(window.__sparkT);
      window.__sparkT = setTimeout(sizeSpark, 120);
    });
    drawSpark();
    tickRealtime();
    setInterval(tickRealtime, 1200);
  }

  // ---------- Dashboard placeholders ----------
  const toggleTheme = $("#toggleTheme");
  if (toggleTheme) {
    toggleTheme.addEventListener("click", () => {
      document.body.classList.toggle("glow-mode");
    });
  }

  const aiSensitivity = $("#aiSensitivity");
  const aiSensitivityVal = $("#aiSensitivityVal");
  if (aiSensitivity && aiSensitivityVal) {
    const sync = () => (aiSensitivityVal.textContent = aiSensitivity.value);
    aiSensitivity.addEventListener("input", sync);
    sync();
  }

  const heatBar = $("#heatBar");
  const momBar = $("#momBar");
  const audBar = $("#audBar");
  const heatVal = $("#heatVal");
  const momVal = $("#momVal");
  const audVal = $("#audVal");
  const updatedAgo = $("#updatedAgo");

  const setMeters = (heat, mom, aud) => {
    const h = clamp(Math.round(heat), 0, 100);
    const m = clamp(Math.round(mom), 0, 100);
    const a = clamp(Math.round(aud), 0, 100);
    if (heatVal) heatVal.textContent = String(h);
    if (momVal) momVal.textContent = String(m);
    if (audVal) audVal.textContent = String(a);
    if (heatBar) heatBar.style.width = `${h}%`;
    if (momBar) momBar.style.width = `${m}%`;
    if (audBar) audBar.style.width = `${a}%`;
  };

  const filters = $$(".filter");
  let currentFilter = "all";
  filters.forEach((f) => {
    f.addEventListener("click", () => {
      currentFilter = f.dataset.filter || "all";
      filters.forEach((x) => x.classList.toggle("is-on", x === f));
      // Simulated effect of changing filters:
      setMeters(rand(60, 92), rand(52, 86), rand(55, 90));
      pushStreamSignal(`Filter applied: ${currentFilter.toUpperCase()}`);
    });
  });

  const feed = $("#trendingFeed");
  const insightBtn = $("#newInsight");
  const insightText = $("#aiInsightText");
  const dashRefresh = $("#dashRefresh");
  const dashSearch = $("#dashSearch");

  const feedItems = [
    { title: "Shorts spike detected in Gaming", meta: "Velocity + retention rising", score: "9.1" },
    { title: "Music hooks outperforming baseline", meta: "Replay rate + share rate up", score: "8.8" },
    { title: "Tech explainers gaining comments", meta: "Depth of discussion increasing", score: "8.6" },
    { title: "Education content stable growth", meta: "Long-term momentum building", score: "8.3" },
  ];

  const renderFeed = (q = "") => {
    if (!feed) return;
    feed.innerHTML = "";
    const needle = q.trim().toLowerCase();
    const items = needle
      ? feedItems.filter((x) => (x.title + " " + x.meta).toLowerCase().includes(needle))
      : feedItems;

    items.forEach((it) => {
      const row = document.createElement("div");
      row.className = "feed__row";
      row.innerHTML = `
        <div>
          <div class="feed__title">${it.title}</div>
          <div class="feed__meta">${it.meta}</div>
        </div>
        <div class="score">${it.score}</div>
      `;
      feed.appendChild(row);
    });
  };
  renderFeed();

  if (dashSearch) {
    dashSearch.addEventListener("input", () => renderFeed(dashSearch.value));
  }

  const insights = [
    "Shorts in <strong>Gaming</strong> show high velocity + strong retention. Prioritize creators with rising comment depth.",
    "Channels with <strong>consistent cadence</strong> have higher subscriber lift. Focus on weekly series formats.",
    "<strong>Music</strong> hooks trend faster when like/comment ratio stays above 1:25. Optimize intros for replay rate.",
    "Region signals indicate growth in <strong>South Asia</strong>. Schedule uploads for evening peak hours.",
    "High engagement with low views suggests <strong>undervalued content</strong>. Promote via Shorts + community posts.",
  ];

  const generateInsight = () => {
    if (!insightText) return;
    insightText.innerHTML = pick(insights);
    pushStreamSignal("AI insight refreshed");
  };
  if (insightBtn) insightBtn.addEventListener("click", generateInsight);

  const refreshDashboard = () => {
    setMeters(rand(62, 92), rand(50, 88), rand(55, 90));
    renderAllCharts();
    if (updatedAgo) updatedAgo.textContent = "just now";
    pushStreamSignal("Dashboard refreshed");
  };
  if (dashRefresh) dashRefresh.addEventListener("click", refreshDashboard);

  // Updated time ticker (UX polish)
  let updatedSeconds = 0;
  setInterval(() => {
    updatedSeconds += 1;
    if (!updatedAgo) return;
    if (updatedSeconds < 10) updatedAgo.textContent = "just now";
    else if (updatedSeconds < 60) updatedAgo.textContent = `${updatedSeconds}s ago`;
    else updatedAgo.textContent = `${Math.floor(updatedSeconds / 60)}m ago`;
  }, 1000);

  // Signal stream in preview card
  const signalStream = $("#signalStream");
  const pushStreamSignal = (label) => {
    if (!signalStream) return;
    const row = document.createElement("div");
    row.className = "stream__row";
    const val = Math.floor(rand(62, 96));
    row.innerHTML = `<span>${label}</span><strong>${val}</strong>`;
    signalStream.prepend(row);
    const rows = $$(".stream__row", signalStream);
    rows.slice(6).forEach((x) => x.remove());
  };

  // Seed some signals
  ["Signal stream ready", "Models warmed up", "Realtime feed synced"].forEach(pushStreamSignal);
  setInterval(() => pushStreamSignal(pick(["New spike detected", "Region signal updated", "Creator momentum rising"])), 3800);

  // Preview values
  const previewScore = $("#previewScore");
  const previewCat = $("#previewCat");
  const cats = ["Gaming", "Music", "Tech", "News", "Education", "Sports"];
  setInterval(() => {
    if (previewScore) previewScore.textContent = String(Math.floor(rand(78, 94)));
    if (previewCat) previewCat.textContent = pick(cats);
  }, 3200);

  // ---------- AI prediction button ----------
  const predictBtn = $(".chipBtn[data-action='predict']");
  const aiProb = $("#aiProb");
  const aiLift = $("#aiLift");
  const aiCategory = $("#aiCategory");
  const aiBar = $("#aiBar");

  const runPrediction = () => {
    const prob = Math.floor(rand(62, 96));
    const lift = Math.floor(rand(18, 64));
    const cat = pick(["Gaming Shorts", "Music Hooks", "Tech AI", "Education Quick Tips", "News Highlights"]);
    if (aiProb) aiProb.textContent = String(prob);
    if (aiLift) aiLift.textContent = String(lift);
    if (aiCategory) aiCategory.textContent = cat;
    if (aiBar) aiBar.style.width = `${prob}%`;
    pushStreamSignal("AI trend prediction updated");
  };
  if (predictBtn) predictBtn.addEventListener("click", runPrediction);
  runPrediction();

  // ---------- Initial meter widths + small polish ----------
  setMeters(78, 64, 71);

  // Respect reduced motion: if enabled, stop periodic flashy updates (but keep functionality)
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion) {
    // Keep the site stable; users who prefer reduced motion shouldn’t get constant UI changes.
    // We won't attempt to disable every interval, but we avoid adding new motion patterns here.
  }
})();

