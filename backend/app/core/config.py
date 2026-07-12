import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AssetFlow"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "supersecretkeyforassetflowjwt"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # DB
    DATABASE_URL: str = "postgresql+asyncpg://assetflow:assetflow123@postgres:5432/assetflow"
    
    # Redis & Celery
    REDIS_URL: str = "redis://redis:6379/0"
    
    # MinIO
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET_NAME: str = "assetflow"
    MINIO_SECURE: bool = False
    
    # Bootstrapping
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@assetflow.com"
    BOOTSTRAP_ADMIN_PASSWORD: str = "adminpassword"

    class Config:
        case_sensitive = True

settings = Settings()
