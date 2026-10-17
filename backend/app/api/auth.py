from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas import ForgotPassword, ResetPassword, Token, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: UserCreate, db: Session = Depends(get_db)):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, hashed_password=hash_password(data.password), lang=data.lang)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return Token(access_token=create_token(user.id, settings.access_token_minutes, "access"))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password", status_code=202)
def forgot_password(data: ForgotPassword, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user:
        token = create_token(user.id, settings.reset_token_minutes, "reset")
        print(f"[RESET TOKEN for {user.email}] {token}")  # TODO: send by email
    return {"detail": "If the account exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(data: ResetPassword, db: Session = Depends(get_db)):
    user_id = decode_token(data.token, "reset")
    user = db.get(User, user_id) if user_id else None
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired token")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"detail": "Password updated"}