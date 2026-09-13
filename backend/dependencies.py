from fastapi import Request, HTTPException, status
from backend.auth import is_admin_authenticated

def admin_required(request: Request) -> str:
    """
    Validates admin session cookie against configured credentials.
    Raises 401 if unauthenticated.
    """
    if not is_admin_authenticated(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin login required."
        )
    return "admin"

def get_current_user_phone(request: Request) -> str:
    """Fallback phone helper for local single-user operation."""
    phone = request.cookies.get("user_phone")
    if not phone:
        return "9999999999"
    return phone
