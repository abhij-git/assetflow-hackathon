from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1 import auth, organization, assets, allocations, bookings, maintenance, audits, reports, notifications

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS middleware to allow the frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Mount sub-routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(organization.router, prefix=f"{settings.API_V1_STR}/org", tags=["Organization Setup"])
app.include_router(assets.router, prefix=f"{settings.API_V1_STR}/assets", tags=["Asset Directory"])
app.include_router(allocations.router, prefix=f"{settings.API_V1_STR}/allocations", tags=["Allocations & Transfers"])
app.include_router(bookings.router, prefix=f"{settings.API_V1_STR}/bookings", tags=["Resource Bookings"])
app.include_router(maintenance.router, prefix=f"{settings.API_V1_STR}/maintenance", tags=["Maintenance Kanban"])
app.include_router(audits.router, prefix=f"{settings.API_V1_STR}/audits", tags=["Asset Audit"])
app.include_router(reports.router, prefix=f"{settings.API_V1_STR}/reports", tags=["Analytics & Reports"])
app.include_router(notifications.router, prefix=f"{settings.API_V1_STR}/notifications", tags=["Notifications & Activity Logs"])

@app.get("/")
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "status": "healthy",
        "docs_url": "/docs"
    }
