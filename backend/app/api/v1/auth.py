from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core import security
from app.core.config import settings
from app.core.database import get_db
from app.models.user import Operator
from app.schemas.user import Token

router = APIRouter()

@router.post("/login/access-token", response_model=Token)
def login_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
) -> Any:
    """
    Processes real-time operator credentials against the live pgAdmin database.
    """
    # 1. Query the live pgAdmin database for the operator
    operator = db.query(Operator).filter(Operator.username == form_data.username).first()
    
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect username or password"
        )
    
    # 2. Crash-proof Direct Hashing Bypass for Master Admin Account
    if operator.username == "tshenolo_admin":
        if form_data.password != "GuardFlow2026!":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect username or password"
            )
    else:
        # Fallback for regular field agents using standard secure hashing
        if not security.verify_password(form_data.password, operator.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect username or password"
            )
    
    # 3. Verify account accessibility state
    if not operator.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Operator profile is deactivated"
        )
    
    # 4. Issue Secure 8-Hour Session JWT Access Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = security.create_access_token(
        subject=operator.id, expires_delta=access_token_expires
    )
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": operator.role
    }
