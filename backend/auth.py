import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from passlib.context import CryptContext
from jose import JWTError, jwt
from cryptography.fernet import Fernet
import base64

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
import models

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# JWT
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", secrets.token_hex(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "1440"))  # 24h default

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[models.User]:
    """Get current user from JWT token.
    
    Behavior:
    - No users in DB → no auth required, return None (first-time setup)
    - Users exist + valid token → return user
    - Users exist + no/invalid token → raise 401
    """
    # Check if any users exist
    user_count = db.query(models.User).count()
    
    if user_count == 0:
        # No users = first-time setup, no auth required
        return None
    
    # Users exist → auth is required
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录，请先登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    username = payload.get("sub")
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的登录凭证")
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户已被禁用")
    
    return user

async def require_auth(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Require authentication. If no users exist, allow all (first-time setup)."""
    if current_user is None:
        # This only happens when no users exist in DB (first-time setup)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录，请先登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user

# Role hierarchy: admin > operator > viewer
ROLE_HIERARCHY = {"admin": 3, "operator": 2, "viewer": 1}

def require_role(min_role: str):
    """Dependency factory: require user to have at least min_role"""
    async def _check_role(current_user: models.User = Depends(get_current_user)) -> models.User:
        if current_user is None:
            raise HTTPException(status_code=401, detail="未登录")
        user_level = ROLE_HIERARCHY.get(current_user.role, 0)
        required_level = ROLE_HIERARCHY.get(min_role, 99)
        if user_level < required_level:
            raise HTTPException(status_code=403, detail=f"权限不足，需要 {min_role} 及以上角色")
        return current_user
    return _check_role

# API Key encryption (Fernet symmetric encryption)
_encryption_key_env = os.environ.get("ENCRYPTION_KEY", "")
try:
    if _encryption_key_env:
        _fernet = Fernet(_encryption_key_env.encode())
    else:
        _fernet = Fernet(base64.urlsafe_b64encode(secrets.token_bytes(32)))
except (ValueError, Exception):
    _fernet = Fernet(base64.urlsafe_b64encode(secrets.token_bytes(32)))

def encrypt_value(plain_text: str) -> str:
    """Encrypt a sensitive value (API key, secret, etc.)"""
    if not plain_text:
        return plain_text
    return _fernet.encrypt(plain_text.encode()).decode()

def decrypt_value(encrypted_text: str) -> str:
    """Decrypt an encrypted value"""
    if not encrypted_text:
        return encrypted_text
    try:
        return _fernet.decrypt(encrypted_text.encode()).decode()
    except Exception:
        return encrypted_text
