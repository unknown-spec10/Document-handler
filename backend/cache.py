"""
Redis caching helper for admin endpoints.
Uses the async redis client (redis>=5.0.0 has built-in async support).
Falls back gracefully if Redis is unavailable — endpoints still work, just uncached.
"""
import json
import redis.asyncio as aioredis
from backend.config import REDIS_URL, CACHE_TTL_SECONDS

# Module-level client — initialized lazily on first use
_redis_client = None


async def get_redis() -> aioredis.Redis:
    """Return (or create) the module-level async Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,  # TCP handshake timeout
            socket_timeout=2,          # Per-command execution timeout
        )
    return _redis_client


async def _reset_client():
    """Close and clear the singleton so the next call gets a fresh client."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception:
            pass
        _redis_client = None


async def cache_get(key: str):
    """
    Retrieve a cached value by key.
    Returns the deserialized Python object, or None on miss / Redis error.
    """
    try:
        client = await get_redis()
        raw = await client.get(key)
        if raw is not None:
            return json.loads(raw)
    except Exception as e:
        print(f"[Redis] cache_get({key}) failed: {e}")
        await _reset_client()  # Drop dead connection; next call reconnects
    return None


async def cache_set(key: str, value, ttl: int = CACHE_TTL_SECONDS) -> None:
    """
    Store a value in the cache with the given TTL (seconds).
    Silently swallows errors so the main request is never broken by Redis.
    """
    try:
        client = await get_redis()
        await client.set(key, json.dumps(value), ex=ttl)
    except Exception as e:
        print(f"[Redis] cache_set({key}) failed: {e}")
        await _reset_client()


async def cache_invalidate_pattern(pattern: str) -> None:
    """
    Delete all keys matching the given pattern (e.g. 'admin:*').
    Uses SCAN to avoid blocking the server.
    """
    try:
        client = await get_redis()
        cursor = 0
        while True:
            cursor, keys = await client.scan(cursor, match=pattern, count=100)
            if keys:
                await client.delete(*keys)
            if cursor == 0:
                break
    except Exception as e:
        print(f"[Redis] cache_invalidate_pattern({pattern}) failed: {e}")
        await _reset_client()

