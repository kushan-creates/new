# Kushan.Ji — Delivery Management System (PRD)

## Overview
A premium, cloud-based delivery management system for the Kushan.Ji namkeen distribution business. Built as a React Native Expo mobile app (works on iOS, Android, Web — same codebase) backed by FastAPI + MongoDB. The app is operations-focused: log deliveries fast, see daily/monthly performance, send WhatsApp reports to customers in one tap, and keep a full audit trail.

## Roles
- **Administrator** — full access (user management, audit log, business settings, password resets, all CRUD).
- **User** — create/edit/delete delivery entries, manage customers & drivers, view reports, send WhatsApp reports.

Seeded test accounts (see `/app/memory/test_credentials.md`):
- `admin@kushanji.com` / `Admin@123`
- `user@kushanji.com` / `User@123`

All credentials are **editable** from Settings → Edit Profile & Credentials.

## Key Features
### Authentication
- JWT bearer auth (PyJWT + bcrypt), token stored in `expo-secure-store` (mobile) / AsyncStorage (web).
- `token_version` field invalidates old tokens on password change / admin reset.
- **Biometric unlock** (Face ID / Touch ID / Fingerprint) via `expo-local-authentication`, opt-in from Settings; falls back to password if biometric fails.
- Editable login id (email) and password via `/auth/change-email`, `/auth/change-password`, `/auth/change-name`.

### Master Data
- **Customers** — Name, Mobile, WhatsApp (per requirements, no address/route/GST/email).
- **Drivers** — Name only.

### Deliveries
- Fields: Date, Time (auto-captured at server), Customer, Driver, Product, Quantity, Unit (kg/g/packets/boxes/dozen), Remarks.
- **Duplicate detection** — backend warns (`duplicate_warning: true`) on identical same-day entry.
- **Version history** — every edit snapshots the previous values into a `versions` array.
- **Undo delete** — soft-delete; deleted entries live in `/trash` for 30 days then auto-purge.

### Dashboard
- KPI cards: Today Deliveries, Today Quantity, Today Customers, Monthly Deliveries.
- 7-day bar chart of daily quantity.
- Top 5 Customers and Top 5 Products (current month).

### Reports
- Customer Summary, Driver Summary, Product Summary, Date-wise.
- Filterable by date range / customer / driver.
- **PDF export** via `expo-print` + `expo-sharing`.
- **WhatsApp share** via `wa.me` deep link with auto-formatted professional report.

### Search & Filters
- Live search across customer / driver / product / remarks.
- Date chip filters: All / Today / This Week / This Month.

### Admin
- User Management (create, role assignment, reset password, toggle active, delete — cannot delete self).
- Audit Log (all create/update/delete/login/reset events with user, timestamp, device).
- Business Settings (name, default products, default unit).

### Other
- Toast notifications instead of Alert dialogs.
- Pull-to-refresh on dashboard & deliveries.
- Brand color `#2E3F9C` (deep royal blue from logo) with white surfaces and subtle shadows.
- Kushan.Ji logo (background-stripped PNG) on login, dashboard header, and settings profile card.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB) + bcrypt + PyJWT. Single `server.py` mounted at `/api`.
- **Frontend**: Expo Router (file-based routes), `(tabs)` group with Dashboard / Deliveries / Reports / Settings. Sub-routes: `/profile`, `/customers`, `/drivers`, `/users`, `/audit`, `/trash`, `/business`.
- **State**: AuthContext loads JWT on cold start and refreshes user via `/auth/me`.
- **Real-time sync**: refresh-on-focus pattern (every tab reloads when re-entered). Polling-based — every connected device picks up the latest data on screen focus / pull-to-refresh.

## Verified Manually (curl + screenshots)
- Login (admin + user + bad creds)
- /me, change-password, change-email
- RBAC enforcement (user gets 403 on /users, /audit-logs)
- Self-delete blocked (400)
- CRUD customers / drivers / deliveries
- Soft-delete + trash + restore
- Duplicate detection
- Dashboard, reports, audit-logs endpoints return proper JSON
- Frontend login → dashboard → deliveries flow renders with seeded data
