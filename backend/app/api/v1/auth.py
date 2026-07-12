from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.deps import get_current_user
from app.models.models import User, UserRole, UserStatus
from app.schemas.schemas import UserCreate, UserLogin, Token, UserOut
from datetime import timedelta

router = APIRouter()

@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    res = await db.execute(select(User).where(User.email == user_in.email))
    existing_user = res.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="A user with this email address already exists."
        )

    # Force role to Employee (no self-elevation)
    new_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
        department_id=user_in.department_id,
        role=UserRole.Employee,
        status=UserStatus.Active
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == credentials.email))
    user = res.scalars().first()
    
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if user.status == UserStatus.Inactive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is deactivated. Contact an administrator."
        )

    access_token = create_access_token(
        subject=user.email,
        role=user.role,
        expires_delta=timedelta(hours=24)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "name": user.name,
        "email": user.email
    }

@router.get("/me", response_model=UserOut)
async def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
