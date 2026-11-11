"""Deterministic analytics for public YouTube channel data."""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from statistics import mean


NA = "N/A"


def _numbers(videos: list[dict], key: str) -> list[float]:
    return [float(video[key]) for video in videos if isinstance(video.get(key), (int, float))]


def _average(values: list[float]) -> float | str:
    return round(mean(values), 2) if values else NA


def _engagement(video: dict) -> float | str:
    views, likes, comments = video.get("views"), video.get("likes"), video.get("comments")
    if not all(isinstance(value, (int, float)) for value in (views, likes, comments)) or not views:
        return NA
    return round(((likes + comments) / views) * 100, 3)


def _period(video: dict) -> str | None:
    try:
        return datetime.fromisoformat(video["published_at"].replace("Z", "+00:00")).strftime("%Y-%m")
    except (KeyError, TypeError, ValueError):
        return None


def analyze_videos(videos: list[dict]) -> dict:
    valid_views = _numbers(videos, "views")
    valid_likes = _numbers(videos, "likes")
    valid_comments = _numbers(videos, "comments")
    total_views = sum(valid_views)
    total_likes = sum(valid_likes)
    total_comments = sum(valid_comments)

    for video in videos:
        video["engagement_rate"] = _engagement(video)

    by_views = sorted(videos, key=lambda item: item.get("views") or -1, reverse=True)
    by_engagement = sorted(
        [video for video in videos if isinstance(video.get("engagement_rate"), (int, float))],
        key=lambda item: item["engagement_rate"],
        reverse=True,
    )
    dated = sorted(videos, key=lambda item: item.get("published_at") or "")
    monthly = Counter(period for video in videos if (period := _period(video)))
    recent = sorted(videos, key=lambda item: item.get("published_at") or "", reverse=True)[:10]
    recent_views = _numbers(recent, "views")
    older_views = _numbers(dated[:-10], "views") if len(dated) > 10 else []

    return {
        "total_views": int(total_views) if valid_views else NA,
        "total_likes": int(total_likes) if valid_likes else NA,
        "total_comments": int(total_comments) if valid_comments else NA,
        "average_views": _average(valid_views),
        "average_likes": _average(valid_likes),
        "average_comments": _average(valid_comments),
        "engagement_rate": round(((total_likes + total_comments) / total_views) * 100, 3) if total_views and valid_likes and valid_comments else NA,
        "view_to_like_ratio": round(total_views / total_likes, 2) if total_views and total_likes else NA,
        "view_to_comment_ratio": round(total_views / total_comments, 2) if total_views and total_comments else NA,
        "upload_frequency": {"period": "month", "items": [{"label": key, "value": count} for key, count in sorted(monthly.items())]},
        "top_videos": by_views[:10],
        "recent_videos": recent,
        "best_engagement_video": by_engagement[0] if by_engagement else None,
        "recent_average_views": round(mean(recent_views), 2) if recent_views else NA,
        "older_average_views": round(mean(older_views), 2) if older_views else NA,
    }


def performance_score(analytics: dict) -> dict:
    components: list[float] = []
    average_views = analytics.get("average_views")
    if isinstance(average_views, (int, float)):
        components.append(min(100, average_views / 1_000_000 * 100))
    engagement = analytics.get("engagement_rate")
    if isinstance(engagement, (int, float)):
        components.append(min(100, engagement / 8 * 100))
    recent = analytics.get("recent_average_views")
    older = analytics.get("older_average_views")
    if isinstance(recent, (int, float)) and isinstance(older, (int, float)) and older:
        components.append(max(0, min(100, (recent / older) * 50)))
    score = round(sum(components) / len(components)) if components else None
    explanation = "Insufficient public data for a channel performance score."
    if score is not None:
        if score >= 75:
            explanation = "Strong public performance based on available views, engagement, and recent uploads."
        elif score >= 50:
            explanation = "Solid public performance with room to improve reach or engagement."
        else:
            explanation = "Public performance is developing across the available videos."
    return {"score": score, "explanation": explanation}


def build_insights(analytics: dict) -> list[str]:
    insights: list[str] = []
    top = analytics.get("top_videos", [])
    if top:
        views = top[0].get("views")
        view_text = f"{views:,}" if isinstance(views, (int, float)) else NA
        insights.append(f'Highest performing video: "{top[0]["title"]}" with {view_text} views.')
    best = analytics.get("best_engagement_video")
    if best:
        insights.append(f'Best engagement: "{best["title"]}" at {best["engagement_rate"]}% engagement.')
    recent = analytics.get("recent_average_views")
    older = analytics.get("older_average_views")
    if isinstance(recent, (int, float)) and isinstance(older, (int, float)) and older:
        direction = "higher" if recent >= older else "lower"
        insights.append(f"The latest videos average {direction} views than the older videos in this sample.")
    months = analytics.get("upload_frequency", {}).get("items", [])
    if months:
        peak = max(months, key=lambda item: item["value"])
        insights.append(f"The most active upload month in this sample was {peak['label']} with {peak['value']} videos.")
    return insights
