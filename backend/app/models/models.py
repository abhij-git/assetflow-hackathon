import enum
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy import Table, Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base

# Enums as python str enums for clean JSON serialization
class UserRole(str, enum.Enum):
    Admin = "Admin"
    AssetManager = "AssetManager"
    DeptHead = "DeptHead"
    Employee = "Employee"

class UserStatus(str, enum.Enum):
    Active = "Active"
    Inactive = "Inactive"

class AssetCondition(str, enum.Enum):
    New = "New"
    Good = "Good"
    Fair = "Fair"
    Poor = "Poor"

class AssetStatus(str, enum.Enum):
    Available = "Available"
    Allocated = "Allocated"
    Reserved = "Reserved"
    UnderMaintenance = "UnderMaintenance"
    Lost = "Lost"
    Retired = "Retired"
    Disposed = "Disposed"

class AllocationStatus(str, enum.Enum):
    Active = "Active"
    Returned = "Returned"
    Overdue = "Overdue"

class TransferRequestStatus(str, enum.Enum):
    Requested = "Requested"
    Approved = "Approved"
    Rejected = "Rejected"
    Completed = "Completed"

class BookingStatus(str, enum.Enum):
    Upcoming = "Upcoming"
    Ongoing = "Ongoing"
    Completed = "Completed"
    Cancelled = "Cancelled"

class MaintenancePriority(str, enum.Enum):
    Low = "Low"
    Medium = "Medium"
    High = "High"
    Critical = "Critical"

class MaintenanceStatus(str, enum.Enum):
    Pending = "Pending"
    Approved = "Approved"
    Rejected = "Rejected"
    TechnicianAssigned = "TechnicianAssigned"
    InProgress = "InProgress"
    Resolved = "Resolved"

class AuditCycleStatus(str, enum.Enum):
    Open = "Open"
    Closed = "Closed"

class VerificationStatus(str, enum.Enum):
    Verified = "Verified"
    Missing = "Missing"
    Damaged = "Damaged"
    Pending = "Pending"

# Association table for AuditCycle and Auditors (Users)
audit_cycle_auditors = Table(
    "audit_cycle_auditors",
    Base.metadata,
    Column("audit_cycle_id", Integer, ForeignKey("audit_cycles.id", ondelete="CASCADE"), primary_key=True),
    Column("auditor_user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id", name="fk_users_department_id", ondelete="SET NULL"), nullable=True)
    role: Mapped[str] = mapped_column(String, default=UserRole.Employee, nullable=False)
    status: Mapped[str] = mapped_column(String, default=UserStatus.Active, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id], back_populates="employees")
    managed_department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys="[Department.head_user_id]", back_populates="head")

class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    head_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", name="fk_departments_head_user_id", use_alter=True, ondelete="SET NULL"), nullable=True)
    parent_department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="Active", nullable=False)

    employees: Mapped[List["User"]] = relationship("User", foreign_keys=[User.department_id], back_populates="department")
    head: Mapped[Optional["User"]] = relationship("User", foreign_keys=[head_user_id], back_populates="managed_department")
    parent: Mapped[Optional["Department"]] = relationship("Department", remote_side=[id], backref="sub_departments")

class AssetCategory(Base):
    __tablename__ = "asset_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    custom_fields: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    assets: Mapped[List["Asset"]] = relationship("Asset", back_populates="category")

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tag: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("asset_categories.id", ondelete="RESTRICT"), nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    acquisition_date: Mapped[date] = mapped_column(Date, nullable=False)
    acquisition_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    condition: Mapped[str] = mapped_column(String, default=AssetCondition.Good, nullable=False)
    location: Mapped[str] = mapped_column(String, nullable=False)
    is_bookable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String, default=AssetStatus.Available, nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    document_urls: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    category: Mapped["AssetCategory"] = relationship("AssetCategory", back_populates="assets")
    allocations: Mapped[List["Allocation"]] = relationship("Allocation", back_populates="asset")
    maintenance_requests: Mapped[List["MaintenanceRequest"]] = relationship("MaintenanceRequest", back_populates="asset")
    bookable_resource: Mapped[Optional["BookableResource"]] = relationship("BookableResource", back_populates="asset", uselist=False)

class Allocation(Base):
    __tablename__ = "allocations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id", ondelete="RESTRICT"), nullable=False)
    holder_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    holder_department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    allocated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expected_return_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    return_condition_notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default=AllocationStatus.Active, nullable=False)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="allocations")
    holder_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[holder_user_id])
    holder_department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[holder_department_id])

class TransferRequest(Base):
    __tablename__ = "transfer_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id", ondelete="RESTRICT"), nullable=False)
    from_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    to_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default=TransferRequestStatus.Requested, nullable=False)
    requested_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    approved_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    asset: Mapped["Asset"] = relationship("Asset")
    from_user: Mapped["User"] = relationship("User", foreign_keys=[from_user_id])
    to_user: Mapped["User"] = relationship("User", foreign_keys=[to_user_id])
    requester: Mapped["User"] = relationship("User", foreign_keys=[requested_by])
    approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by])

class BookableResource(Base):
    __tablename__ = "bookable_resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id", ondelete="CASCADE"), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="bookable_resource")
    bookings: Mapped[List["Booking"]] = relationship("Booking", back_populates="resource")

class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    resource_id: Mapped[int] = mapped_column(Integer, ForeignKey("bookable_resources.id", ondelete="CASCADE"), nullable=False)
    booked_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String, default=BookingStatus.Upcoming, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    resource: Mapped["BookableResource"] = relationship("BookableResource", back_populates="bookings")
    user: Mapped["User"] = relationship("User")

class MaintenanceRequest(Base):
    __tablename__ = "maintenance_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id", ondelete="RESTRICT"), nullable=False)
    raised_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    issue_description: Mapped[str] = mapped_column(String, nullable=False)
    priority: Mapped[str] = mapped_column(String, default=MaintenancePriority.Medium, nullable=False)
    photo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default=MaintenanceStatus.Pending, nullable=False)
    technician_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    approved_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="maintenance_requests")
    raiser: Mapped["User"] = relationship("User", foreign_keys=[raised_by])
    approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by])

class AuditCycle(Base):
    __tablename__ = "audit_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scope_department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    scope_location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_range_start: Mapped[date] = mapped_column(Date, nullable=False)
    date_range_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, default=AuditCycleStatus.Open, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    scope_department: Mapped[Optional["Department"]] = relationship("Department")
    auditors: Mapped[List["User"]] = relationship("User", secondary=audit_cycle_auditors)
    items: Mapped[List["AuditItem"]] = relationship("AuditItem", back_populates="cycle", cascade="all, delete-orphan")

class AuditItem(Base):
    __tablename__ = "audit_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    audit_cycle_id: Mapped[int] = mapped_column(Integer, ForeignKey("audit_cycles.id", ondelete="CASCADE"), nullable=False)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id", ondelete="RESTRICT"), nullable=False)
    expected_location: Mapped[str] = mapped_column(String, nullable=False)
    verification_status: Mapped[str] = mapped_column(String, default=VerificationStatus.Pending, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    cycle: Mapped["AuditCycle"] = relationship("AuditCycle", back_populates="items")
    asset: Mapped["Asset"] = relationship("Asset")

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    related_entity_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    related_entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship("User")

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    actor: Mapped[Optional["User"]] = relationship("User")
