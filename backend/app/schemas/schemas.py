from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import List, Optional, Any, Dict
from app.models.models import UserRole, AssetStatus, AssetCondition, AllocationStatus, TransferRequestStatus, BookingStatus, MaintenancePriority, MaintenanceStatus, AuditCycleStatus, VerificationStatus

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    name: str
    email: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    exp: Optional[int] = None

# Base User Schemas
class UserBase(BaseModel):
    name: str
    email: str
    department_id: Optional[int] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(UserBase):
    id: int
    role: UserRole
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role: UserRole

# Department Schemas
class DepartmentBase(BaseModel):
    name: str
    parent_department_id: Optional[int] = None
    status: str = "Active"

class DepartmentCreate(DepartmentBase):
    head_user_id: Optional[int] = None

class DepartmentOut(DepartmentBase):
    id: int
    head_user_id: Optional[int] = None
    head_name: Optional[str] = None
    parent_name: Optional[str] = None

    class Config:
        from_attributes = True

# Category Schemas
class CategoryBase(BaseModel):
    name: str
    custom_fields: Optional[Dict[str, Any]] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryOut(CategoryBase):
    id: int

    class Config:
        from_attributes = True

# Asset Schemas
class AssetBase(BaseModel):
    name: str
    category_id: int
    serial_number: Optional[str] = None
    acquisition_date: date
    acquisition_cost: float
    condition: AssetCondition = AssetCondition.Good
    location: str
    is_bookable: bool = False
    photo_url: Optional[str] = None
    document_urls: Optional[List[str]] = []

class AssetCreate(AssetBase):
    pass

class AssetOut(BaseModel):
    id: int
    tag: str
    name: str
    category_id: int
    category_name: Optional[str] = None
    serial_number: Optional[str] = None
    acquisition_date: date
    acquisition_cost: float
    condition: str
    location: str
    is_bookable: bool
    status: str
    photo_url: Optional[str] = None
    document_urls: Optional[List[str]] = []
    created_at: datetime

    class Config:
        from_attributes = True

# Allocation Schemas
class AllocationBase(BaseModel):
    asset_id: int
    holder_user_id: Optional[int] = None
    holder_department_id: Optional[int] = None
    expected_return_date: Optional[datetime] = None

class AllocationCreate(AllocationBase):
    pass

class AllocationReturn(BaseModel):
    return_condition_notes: str

class AllocationOut(BaseModel):
    id: int
    asset_id: int
    asset_tag: Optional[str] = None
    asset_name: Optional[str] = None
    holder_user_id: Optional[int] = None
    holder_user_name: Optional[str] = None
    holder_department_id: Optional[int] = None
    holder_department_name: Optional[str] = None
    allocated_at: datetime
    expected_return_date: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    return_condition_notes: Optional[str] = None
    status: str

    class Config:
        from_attributes = True

# Transfer Request Schemas
class TransferRequestCreate(BaseModel):
    asset_id: int
    to_user_id: int
    reason: str

class TransferRequestOut(BaseModel):
    id: int
    asset_id: int
    asset_tag: Optional[str] = None
    asset_name: Optional[str] = None
    from_user_id: int
    from_user_name: Optional[str] = None
    to_user_id: int
    to_user_name: Optional[str] = None
    reason: str
    status: str
    requested_by: int
    requested_by_name: Optional[str] = None
    approved_by: Optional[int] = None
    approved_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Bookable Resource Schemas
class ResourceCreate(BaseModel):
    asset_id: int
    name: str
    description: Optional[str] = None

class ResourceOut(BaseModel):
    id: int
    asset_id: int
    asset_tag: Optional[str] = None
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True

# Booking Schemas
class BookingCreate(BaseModel):
    resource_id: int
    start_time: datetime
    end_time: datetime

class BookingOut(BaseModel):
    id: int
    resource_id: int
    resource_name: Optional[str] = None
    booked_by: int
    booked_by_name: Optional[str] = None
    start_time: datetime
    end_time: datetime
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# Maintenance Schemas
class MaintenanceCreate(BaseModel):
    asset_id: int
    issue_description: str
    priority: MaintenancePriority = MaintenancePriority.Medium
    photo_url: Optional[str] = None

class MaintenanceUpdate(BaseModel):
    status: MaintenanceStatus
    technician_name: Optional[str] = None

class MaintenanceOut(BaseModel):
    id: int
    asset_id: int
    asset_tag: Optional[str] = None
    asset_name: Optional[str] = None
    raised_by: int
    raised_by_name: Optional[str] = None
    issue_description: str
    priority: str
    photo_url: Optional[str] = None
    status: str
    technician_name: Optional[str] = None
    approved_by: Optional[int] = None
    approved_by_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Audit Schemas
class AuditCycleCreate(BaseModel):
    scope_department_id: Optional[int] = None
    scope_location: Optional[str] = None
    date_range_start: date
    date_range_end: date
    auditor_ids: List[int]

class AuditItemUpdate(BaseModel):
    verification_status: VerificationStatus
    notes: Optional[str] = None

class AuditItemOut(BaseModel):
    id: int
    audit_cycle_id: int
    asset_id: int
    asset_tag: Optional[str] = None
    asset_name: Optional[str] = None
    expected_location: str
    verification_status: str
    notes: Optional[str] = None
    verified_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AuditCycleOut(BaseModel):
    id: int
    scope_department_id: Optional[int] = None
    scope_department_name: Optional[str] = None
    scope_location: Optional[str] = None
    date_range_start: date
    date_range_end: date
    status: str
    created_at: datetime
    auditor_names: List[str] = []

    class Config:
        from_attributes = True

class AuditCycleDetailOut(AuditCycleOut):
    items: List[AuditItemOut] = []

# Notification Schemas
class NotificationOut(BaseModel):
    id: int
    user_id: int
    type: str
    message: str
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Activity Log Schemas
class ActivityLogOut(BaseModel):
    id: int
    actor_user_id: Optional[int] = None
    actor_user_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    details: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True

# Asset Detail Out with full timeline/history
class AssetDetailOut(BaseModel):
    asset: AssetOut
    allocation_history: List[AllocationOut] = []
    maintenance_history: List[MaintenanceOut] = []

    class Config:
        from_attributes = True

# Dashboard Stats Schemas
class DashboardStats(BaseModel):
    assets_available: int
    assets_allocated: int
    maintenance_active: int
    active_bookings: int
    pending_transfers: int
    upcoming_returns: int
    overdue_returns: int
    recent_activity: List[ActivityLogOut] = []
