# Kushan.Ji Delivery Management System — PRD

## Overview
Premium cloud-based delivery management system for Kushan.Ji namkeen (Indian snacks) distribution business. Mobile-first React Native (Expo) app with FastAPI + MongoDB backend.

## Core Features Built (v1)

### Authentication & Roles
- JWT login with editable email/password (self-service from Profile)
- Two seeded roles: **Admin** (admin@kushanji.com / Admin@123) and **User** (user@kushanji.com / User@123)
- Biometric login toggle (Face ID / Touch ID / Fingerprint / Windows Hello) via expo-local-authentication
- Token versioning so password change invalidates old tokens

### Master Data
- **Customer DB**: Name, Mobile, WhatsApp (exactly per spec — no extra fields)
- **Driver DB**: Name only (exactly per spec)
- **Business Settings**: Name, default unit, default products list

### Delivery Entries
- Date, auto-captured time, Customer, Driver, Product, Quantity, Unit (kg/g/packets/boxes/dozen), Remarks
- Duplicate detection (flag on identical date+customer+driver+product+qty)
- Version history (every edit snapshots previous values)
- Soft delete with 30-day restorable Trash, then auto-purge

### Dashboard
- Today: deliveries, quantity, customers
- Monthly: deliveries, quantity
- 7-day quantity bar chart
- Top 5 customers (month) + Top 5 products (month)

### Reports & Export
- Customer / Driver / Product / Date-wise summaries with date range filtering
- PDF export via expo-print + share sheet
- WhatsApp one-tap share to customer's saved number (wa.me deep link)

### Search & Filters
- Live text search across customer / driver / product / remarks
- Time chips (All / Today / Week / Month)

### Admin-Only
- User Management (create / edit role / activate / deactivate / reset password / delete)
- Audit log with user, action, old/new values, timestamp, device
- Business settings editor

### Security & UX
- bcrypt password hashing, JWT in expo-secure-store / AsyncStorage (web)
- Role-gated UI (admin-only sections hidden from regular users)
- Premium UI: brand-blue palette derived from logo, cards with shadows, animated toasts, bottom tabs, FAB, sticky chips
- SafeArea-aware on every screen

## Smart Business Enhancement
**One-tap professional WhatsApp report**: For each customer, app auto-assembles every delivery for the day in a clean format (with driver name, time, product, total qty) and pushes it via wa.me — drives recurring orders by giving customers polished proof-of-delivery summaries with zero typing.

## Backend
- FastAPI + Motor (async MongoDB)
- All routes prefixed `/api`
- Auto-seeded admin + demo user + default settings on startup
- Indexes on email, id, date, customer_id, timestamp for fast queries on tens of thousands of records

## Verified
- 25/25 backend pytest cases passing
- Full frontend flow validated by testing agent (login → dashboard → CRUD → reports → settings → admin sections)
