import secrets
from typing import Optional
from fastapi import Request
from backend import config

# Dynamic cryptographically secure session token generated in memory on startup.
# Impossible to guess, forge, or reuse across restarts.
CURRENT_ADMIN_SESSION_TOKEN = secrets.token_urlsafe(32)

def get_current_session_token() -> str:
    """Returns the active server session token."""
    return CURRENT_ADMIN_SESSION_TOKEN

def is_admin_authenticated(request: Request) -> bool:
    """
    Validates that the incoming request cookie matches the active secret session token.
    Uses constant-time comparison to prevent timing attacks.
    """
    cookie_val = request.cookies.get(config.SESSION_COOKIE_NAME) or request.cookies.get("access_token")
    if not cookie_val:
        return False
    return secrets.compare_digest(cookie_val, CURRENT_ADMIN_SESSION_TOKEN)

def get_token_from_cookie(request: Request) -> Optional[str]:
    """Compatibility helper to retrieve session cookie."""
    return request.cookies.get(config.SESSION_COOKIE_NAME) or request.cookies.get("access_token")
