"""Small, defensive YouTube Data API v3 client for public channel analysis."""

from __future__ import annotations

import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen


class YouTubeServiceError(Exception):
    """An expected, safe-to-display YouTube service failure."""

    def __init__(self, message: str, status_code: int = 502, error_type: str = "youtube_upstream_error"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_type = error_type


class YouTubeService:
    base_url = "https://www.googleapis.com/youtube/v3"
    retryable_statuses = {500, 502, 503, 504}

    def __init__(self, api_key: str | None = None):
        self.api_key = (api_key if api_key is not None else os.getenv("YOUTUBE_API_KEY", "")).strip()

    def health(self) -> dict:
        return {"configured": bool(self.api_key), "key_length": len(self.api_key), "service": "youtube_data_api_v3"}

    @staticmethod
    def _api_error(exc: HTTPError) -> tuple[str, str]:
        try:
            payload = json.loads(exc.read().decode("utf-8"))
            error = payload.get("error", {})
            reasons = error.get("errors", [])
            reason = reasons[0].get("reason", "") if reasons else ""
            return reason, error.get("message", "")
        except (UnicodeDecodeError, ValueError, AttributeError, IndexError, TypeError):
            return "", ""

    def _request(self, resource: str, params: dict[str, str | int]) -> dict:
        if not self.api_key:
            raise YouTubeServiceError("YOUTUBE_API_KEY is missing from .env.", 503, "api_key_missing")

        query = urlencode({**params, "key": self.api_key})
        url = f"{self.base_url}/{resource}?{query}"
        for attempt in range(4):
            try:
                with urlopen(url, timeout=20) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                if "error" in payload:
                    raise YouTubeServiceError("YouTube returned an invalid response.", 502, "invalid_response")
                return payload
            except HTTPError as exc:
                reason, _ = self._api_error(exc)
                if exc.code in self.retryable_statuses and attempt < 3:
                    time.sleep(0.35 * (2**attempt))
                    continue
                if exc.code == 400:
                    raise YouTubeServiceError("YouTube rejected the request. Check the channel name, handle, or URL.", 400, "invalid_request") from exc
                if exc.code == 401 or reason in {"keyInvalid", "badRequest"}:
                    raise YouTubeServiceError("Your YouTube API key is invalid. Check Google Cloud Credentials.", 401, "invalid_api_key") from exc
                if exc.code == 403:
                    if reason in {"quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded"}:
                        raise YouTubeServiceError("YouTube API quota has been exceeded.", 429, "quota_exceeded") from exc
                    raise YouTubeServiceError("YouTube API access was forbidden. Enable YouTube Data API v3 and check API key restrictions.", 403, "forbidden") from exc
                if exc.code == 404:
                    raise YouTubeServiceError("Channel not found. Try the channel name, @handle, or channel URL.", 404, "channel_not_found") from exc
                if exc.code in self.retryable_statuses:
                    raise YouTubeServiceError(f"YouTube API temporarily returned HTTP {exc.code}. Please try again.", 502, "youtube_upstream_error") from exc
                raise YouTubeServiceError("YouTube returned an unexpected HTTP error.", 502, "youtube_upstream_error") from exc
            except (TimeoutError, URLError) as exc:
                if attempt < 3:
                    time.sleep(0.35 * (2**attempt))
                    continue
                error_type = "youtube_timeout" if isinstance(exc, TimeoutError) else "youtube_network_error"
                message = "YouTube request timed out. Please try again." if error_type == "youtube_timeout" else "Could not connect to YouTube. Check your internet connection."
                raise YouTubeServiceError(message, 504 if error_type == "youtube_timeout" else 502, error_type) from exc
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                raise YouTubeServiceError("YouTube returned an invalid response.", 502, "invalid_response") from exc
        raise YouTubeServiceError("YouTube API temporarily returned an upstream error. Please try again.", 502)

    @staticmethod
    def _channel_from_item(item: dict) -> dict:
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
        details = item.get("contentDetails", {})
        thumbnails = snippet.get("thumbnails", {})
        image = thumbnails.get("high", thumbnails.get("default", {}))
        return {
            "id": item.get("id", ""), "name": snippet.get("title") or "Unknown channel",
            "handle": snippet.get("customUrl") or "Not available through the current API.",
            "description": snippet.get("description") or "", "thumbnail": image.get("url", ""),
            "subscribers": int(statistics["subscriberCount"]) if "subscriberCount" in statistics else None,
            "views": int(statistics["viewCount"]) if "viewCount" in statistics else None,
            "video_count": int(statistics["videoCount"]) if "videoCount" in statistics else None,
            "created_at": snippet.get("publishedAt") or "",
            "country": snippet.get("country") or "Not available through the current API.",
            "uploads_playlist_id": details.get("relatedPlaylists", {}).get("uploads", ""),
            "url": f"https://www.youtube.com/channel/{item.get('id', '')}",
        }

    @staticmethod
    def _channel_reference(value: str) -> tuple[str, str] | None:
        parsed = urlparse(value)
        if parsed.scheme and parsed.netloc and parsed.netloc.lower().endswith("youtube.com"):
            parts = [part for part in parsed.path.split("/") if part]
            if len(parts) >= 2 and parts[0].lower() == "channel":
                return "id", parts[1]
            if parts and parts[0].startswith("@"):
                return "handle", parts[0]
            query_id = parse_qs(parsed.query).get("channel_id", [""])[0]
            if query_id:
                return "id", query_id
        if value.startswith("UC") and len(value) >= 20:
            return "id", value
        if value.startswith("@"):
            return "handle", value
        return None

    def resolve_channel(self, query: str) -> dict:
        value = query.strip()
        reference = self._channel_reference(value)
        if reference:
            field, identifier = reference
            data = self._request("channels", {"part": "snippet,statistics,contentDetails", field: identifier})
        else:
            search = self._request("search", {"part": "snippet", "q": value, "type": "channel", "maxResults": 5})
            items = search.get("items", [])
            if not items:
                raise YouTubeServiceError("Channel not found. Try the channel name, @handle, or channel URL.", 404, "channel_not_found")
            normalized = value.casefold().lstrip("@")
            selected = next((item for item in items if item.get("snippet", {}).get("title", "").casefold() == normalized), items[0])
            channel_id = selected.get("snippet", {}).get("channelId")
            data = self._request("channels", {"part": "snippet,statistics,contentDetails", "id": channel_id})
        items = data.get("items", [])
        if not items:
            raise YouTubeServiceError("Channel not found. Try the channel name, @handle, or channel URL.", 404, "channel_not_found")
        return self._channel_from_item(items[0])

    def fetch_videos(self, uploads_playlist_id: str, max_videos: int = 100) -> list[dict]:
        if not uploads_playlist_id:
            return []
        playlist_items: list[dict] = []
        page_token = ""
        while len(playlist_items) < max_videos:
            params: dict[str, str | int] = {"part": "snippet,contentDetails", "playlistId": uploads_playlist_id, "maxResults": min(50, max_videos - len(playlist_items))}
            if page_token:
                params["pageToken"] = page_token
            payload = self._request("playlistItems", params)
            playlist_items.extend(payload.get("items", []))
            page_token = payload.get("nextPageToken", "")
            if not page_token or not payload.get("items"):
                break
        ids = [item.get("contentDetails", {}).get("videoId") for item in playlist_items]
        ids = [video_id for video_id in ids if video_id]
        videos: list[dict] = []
        for offset in range(0, len(ids), 50):
            payload = self._request("videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(ids[offset : offset + 50])})
            videos.extend(self._video_from_item(item) for item in payload.get("items", []))
        return videos

    @staticmethod
    def _video_from_item(item: dict) -> dict:
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
        details = item.get("contentDetails", {})
        thumbnails = snippet.get("thumbnails", {})
        image = thumbnails.get("high", thumbnails.get("default", {}))
        return {
            "id": item.get("id", ""), "title": snippet.get("title") or "Untitled video", "thumbnail": image.get("url", ""),
            "published_at": snippet.get("publishedAt") or "", "views": int(statistics["viewCount"]) if "viewCount" in statistics else None,
            "likes": int(statistics["likeCount"]) if "likeCount" in statistics else None, "comments": int(statistics["commentCount"]) if "commentCount" in statistics else None,
            "duration": details.get("duration") or "Not available through the current API.", "url": f"https://www.youtube.com/watch?v={item.get('id', '')}",
        }
