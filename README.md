# AssetFlow

> A centralized ERP platform to track, allocate, and maintain physical assets and shared resources.

![Next.js](https://img.shields.io/badge/Next.js-14-blue?style=flat-square&logo=nextdotjs)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green?style=flat-square&logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue?style=flat-square&logo=postgresql)
![MinIO](https://img.shields.io/badge/MinIO-S3-red?style=flat-square&logo=minio)
![Celery](https://img.shields.io/badge/Celery-5.3-green?style=flat-square&logo=celery)
![Docker](https://img.shields.io/badge/Docker-Compose-blue?style=flat-square&logo=docker)

---

## 2. Overview

AssetFlow is a centralized, enterprise-grade resource planning (ERP) platform designed to digitize and manage corporate physical assets and shared resources throughout their entire lifecycle. Moving away from untrackable spreadsheets and paper logs, AssetFlow establishes structured, transparent workflows for corporate equipment, spaces, and vehicles.

The system focuses strictly on asset tracking, booking validation, custody transfers, physical audit verification, and maintenance workflows. **Accounting concerns, invoice generation, purchasing, and billing logic are explicitly out of scope.**

---

## 3. Key Features

### Core Modules
* **Organization Setup**: Create hierarchical corporate departments, define asset categories, assign department heads, and promote employee roles.
* **Asset Registration**: Register corporate assets with tags, serial numbers, locations, and category-specific custom attributes (e.g. storage capacity for laptops, mileage for cars).
* **Allocation & Transfer**: Allocate assets directly to employees or departments with strict double-allocation checks. Initiate and route custody transfer requests between team members.
* **Resource Booking**: Schedule and reserve shared office spaces, vehicles, or equipment on an interactive calendar/timeline with automatic overlap prevention.
* **Maintenance Kanban Pipeline**: Track maintenance requests from ticket creation through approval, assignment, and resolution using a kanban interface.
* **Audit Cycles**: Launch targeted audit cycles by department/location. Assigned auditors verify assets in an optimized list showing status updates (Verified, Missing, Damaged).
* **Activity Logs & Notifications**: Review role-aware notification panels and inspect immutable audit trail logs tracking all system events.
* **Reports & Analytics**: Monitor utilization percentages, monthly maintenance trends, asset age indicators, and room booking heatmaps.

### Standout Business Rules
> [!IMPORTANT]
> **Double-Allocation Block**: An asset cannot be allocated to a new user if it is currently held by someone else. A direct re-allocation is rejected; the current holder must return the asset first, or the new user must request an official **Custody Transfer** which requires approval.
>
> **Booking Overlap Validation**: Shared resources cannot have overlapping reservations. The system allows back-to-back bookings (e.g., meeting ends at 10:00, next starts at 10:00) but strictly rejects overlapping requests.
>
> **Maintenance Availability Gate**: When an asset is marked with an active maintenance ticket, its status transitions to `Maintenance`, immediately rendering it unavailable for new allocations or bookings until the ticket is resolved.

---

## 4. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 14 | React framework with App Router, TypeScript, and Vanilla CSS/Tailwind CSS |
| **Backend** | FastAPI | Async Python framework providing high-performance REST APIs |
| **Database** | PostgreSQL 15 | Relational database enforcing ACID constraints and relational mappings |
| **Storage** | MinIO | S3-compatible object storage to manage uploaded asset photos |
| **Task Queue** | Celery + Redis | Asynchronous task execution and scheduling with Redis acting as message broker |
| **Authentication** | JWT | Secure, stateless role-based token authentication |
| **ORM & Migrations** | SQLAlchemy + Alembic | Object-relational mapping (asyncpg driver) and database schemas migrations |

---

## 5. Architecture

```mermaid
graph TD
    User([Web Client]) -->|Port 3000| Frontend[Next.js App Router]
    Frontend -->|REST APIs Port 8000| Backend[FastAPI Application]
    Backend -->|Async Engine Port 5432| DB[(PostgreSQL Database)]
    Backend -->|Message Broker Port 6379| Redis[(Redis Queue)]
    Backend -->|S3 API Port 9000| S3[(MinIO Object Storage)]
    
    CeleryWorker[Celery Task Workers] -->|Pulls Tasks| Redis
    CeleryWorker -->|Read/Write| DB
    CeleryWorker -->|Read/Write| S3
    
    CeleryBeat[Celery Beat Scheduler] -->|Enqueues Cron Jobs| Redis
```

### Folder Structure
AssetFlow is structured as a clean monorepo:
* **`backend/`**: Contains the FastAPI codebase, Alembic migrations, database models, schemas, routers, and background jobs.
* **`frontend/`**: Contains the Next.js pages, shared components, styling, API client wrappers, and interactive pages.
* **`docker-compose.yml`**: Defines the orchestration settings for the complete multi-service stack.

---

## 6. User Roles

| Role | Key Permissions |
|---|---|
| **Admin** | Full access to Organization Setup (departments, categories, employee directory), role promotion, organization-wide analytics, and trace audit logs. |
| **Asset Manager** | Registers assets, allocates assets, processes returns, updates maintenance tickets, and starts/closes physical audits. |
| **Department Head** | Views assets allocated to their department, approves allocation/transfer requests within their department, and books resources on behalf of the department. |
| **Employee** | Views assets allocated directly to them, books shared resources, raises maintenance tickets, and initiates return or transfer requests. |

> [!NOTE]
> New user registration (Sign Up) always creates accounts with the **Employee** role. Role promotions must be explicitly performed by an **Admin** through the Organization Setup directory page.

---

## 7. Getting Started / Quickstart

### Prerequisites
Make sure you have [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) installed.

### Setup Steps
1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/abhij-git/assetflow-hackathon.git
   cd assetflow-hackathon
   ```
2. Launch the application stack using Docker Compose:
   ```bash
   docker-compose up --build
   ```
   *This command spins up all components, configures MinIO storage, runs Alembic migrations, and triggers the seed script to pre-populate mock data.*

### Services & Ports
Once the containers are running, the services are mapped as follows:
- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API Server**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **PostgreSQL Database**: Port `5432`
- **Redis Queue**: Port `6379`
- **MinIO Console**: [http://localhost:9001](http://localhost:9001) (User: `minioadmin` / Pass: `minioadmin123`)

### Seed Login Credentials
The following accounts are created by the seed script for quick evaluation:
- **Admin**: `admin@assetflow.com` / `adminpassword`
- **Asset Manager**: `manager@assetflow.com` / `password123`
- **Department Head (Engineering)**: `eng.head@assetflow.com` / `password123`
- **Employee (IT)**: `priya@assetflow.com` / `password123`

### Environment Variables
Environment configurations are managed directly inside the `docker-compose.yml` file. No manual `.env` file is required. The primary variables include:

| Variable | Description | Default Docker Value |
|---|---|---|
| `DATABASE_URL` | Async SQL connection string | `postgresql+asyncpg://assetflow:assetflow123@postgres:5432/assetflow` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379/0` |
| `SECRET_KEY` | Secret key used for JWT signing | `supersecretkeyforassetflowjwt` |
| `BOOTSTRAP_ADMIN_EMAIL` | Bootstrap admin account email | `admin@assetflow.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Bootstrap admin account password | `adminpassword` |

---

## 8. Project Structure

```
assetflow/
├── backend/
│   ├── alembic/                 # Alembic migration files
│   ├── app/
│   │   ├── api/                 # API controllers and routers (v1 endpoints)
│   │   ├── core/                # Database engine, dependencies, configuration, and security settings
│   │   ├── models/              # SQLAlchemy model definitions
│   │   ├── schemas/             # Pydantic schemas for request/response serialization
│   │   ├── services/            # Business logic (allocation, bookings, maintenance, audits, s3)
│   │   ├── tasks/               # Celery worker configuration and cron jobs
│   │   ├── main.py              # Backend app initialization and entry point
│   │   └── seed.py              # Database seeding script
│   └── requirements.txt         # Backend Python dependencies list
├── frontend/
│   ├── app/                     # Next.js App Router routing layouts and page views
│   ├── components/              # Shared components (Sidebar, layout wrappers)
│   ├── lib/                     # API client endpoints wrapper and fetch utilities
│   └── package.json             # Frontend package configuration
└── docker-compose.yml           # Monorepo container deployment config
```

---

## 9. Screens Overview

| Screen # | Screen Name | Purpose | Image Placeholder |
|---|---|---|---|
| **Screen 1** | Login & Signup | Account access and creation with department mapping | <!-- docs/screenshots/login.png --> |
| **Screen 2** | Dashboard | Overview of active assets, maintenance, bookings, and logs | <!-- docs/screenshots/dashboard.png --> |
| **Screen 3** | Organization Setup | Configure departments, categories, and manage employee roles | <!-- docs/screenshots/organization.png --> |
| **Screen 4** | Assets Catalog | List available/allocated assets and register new equipment | <!-- docs/screenshots/assets.png --> |
| **Screen 5** | Allocation & Transfer | Manage direct asset custody assignments and process transfers | <!-- docs/screenshots/allocation.png --> |
| **Screen 6** | Resource Booking | Timeline schedule to reserve conference rooms and vehicles | <!-- docs/screenshots/booking.png --> |
| **Screen 7** | Maintenance Pipeline | Kanban board for maintenance approval, progress, and updates | <!-- docs/screenshots/maintenance.png --> |
| **Screen 8** | Asset Audit | Auditor lists to log verification checks with discrepancy flags | <!-- docs/screenshots/audit.png --> |
| **Screen 9** | Reports & Analytics | Charts illustrating utilization rate, history, and status | <!-- docs/screenshots/reports.png --> |
| **Screen 10**| Trace Activity Logs | Immutable event trail log showing full actor logs | <!-- docs/screenshots/notifications.png --> |

---

## 10. API Overview

All API endpoints are prefixed with `/api/v1` and return JSON payloads. Full interactive documentation is available at `/docs` (Swagger UI) or `/redoc` (ReDoc).

- `/api/v1/auth`: Sign up, log in, retrieve active user profile tokens.
- `/api/v1/departments`: Create, modify, and list corporate departments.
- `/api/v1/assets`: Manage asset lifecycle registry, search filters, and detail records.
- `/api/v1/allocations`: Handle allocation handovers, returns, and transfer routing.
- `/api/v1/bookings`: Reserve shared resources, check availability, and cancel bookings.
- `/api/v1/maintenance`: Log maintenance requests, assign technician names, and close tickets.
- `/api/v1/audits`: Create audit cycles, log item verifications, and download reports.
- `/api/v1/reports`: Retrieve aggregate statistics and utilization metrics for charts.
- `/api/v1/notifications`: List user notifications and read immutable trace logs.

---

## 11. Background Jobs

Asynchronous processes are scheduled and executed via **Celery workers** and coordinated by **Celery Beat**:

- **Overdue Return Scanner**: Scans active allocations daily at midnight. Generates `OverdueReturnAlert` notifications for users whose expected return date has passed.
- **Booking Reminders**: Scans upcoming bookings every 10 minutes and sends alerts to users whose reservation starts shortly.
- **Auto-generated Discrepancy Reports**: Tracks cycle verification updates and generates audit CSV exports.

---

## 12. Testing

Unit tests for backend business rules are located under the test directories.
To run the backend test suite:
```bash
docker-compose exec backend pytest
```

### Coverage
- **Double-Allocation checks**: Validates that trying to allocate an already allocated asset throws an HTTP 400 error.
- **Overlap validations**: Confirms that trying to book a resource during an existing booking window returns an HTTP 400, while back-to-back bookings succeed.
- **Maintenance status updates**: Verifies that when an asset enters maintenance, it blocks new bookings and allocations.

---

## 13. Known Limitations & Future Scope

- **Polling Notifications**: Notifications are updated via API polling rather than real-time WebSockets.
- **Auditor Assignment**: Currently requires manual auditor assignment during cycle creation; future scope includes automated round-robin assignment based on location.
- **Offline Audits**: The physical audit checklist requires active network connection; future scope includes offline audit collection syncing via IndexedDB.

---



---

