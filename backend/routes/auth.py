from fastapi import APIRouter, HTTPException, Response, Request, status
from backend import schemas, config, auth
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/admin-login", response_model=schemas.StatusResponse)
@limiter.limit("15/minute")
async def admin_login(request: Request, payload: schemas.AdminLoginRequest, response: Response):
    """
    Authenticates admin against credentials directly from .env and sets dynamic secret session cookie.
    """
    if not config.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Admin credentials are not configured on the server."
        )
        
    if payload.username != config.ADMIN_USERNAME or payload.password != config.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials."
        )
    
    # Issue dynamic, unguessable session token
    session_token = auth.get_current_session_token()
    
    for cookie_key in (config.SESSION_COOKIE_NAME, "access_token"):
        response.set_cookie(
            key=cookie_key,
            value=session_token,
            httponly=True,
            secure=config.COOKIE_SECURE,
            samesite=config.COOKIE_SAMESITE,
            max_age=config.SESSION_EXPIRY_SECONDS
        )
    
    return schemas.StatusResponse(
        status="success",
        message="Admin logged in successfully."
    )

@router.post("/logout", response_model=schemas.StatusResponse)
async def logout(response: Response):
    """
    Clears the admin session cookie.
    """
    for cookie_key in (config.SESSION_COOKIE_NAME, "access_token"):
        response.delete_cookie(
            key=cookie_key,
            secure=config.COOKIE_SECURE,
            samesite=config.COOKIE_SAMESITE
        )
    return schemas.StatusResponse(
        status="success",
        message="Logged out successfully."
    )
