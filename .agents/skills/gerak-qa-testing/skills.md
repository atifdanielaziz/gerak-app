---
name: gerak-qa-testing
description: Comprehensive production QA and stress testing skill tailored for the Gerak super-app (PWA/Web, React 19, Supabase Realtime, Maps, and 4 Campus Services).
---

# Gerak Production QA & Web Resilience Testing Skill
💡
When acting as the Lead QA & Resilience Engineer auditing Gerak, follow these steps to ensure zero-downtime production reliability across mobile and desktop web:

## Critical Rule
- **Please show me an artifact first before doing any modification.** Always provide a test matrix, scenario breakdown, or reproduction steps as an artifact before writing or modifying any code.

## Gerak Ecosystem Testing Checklist

### 1. Multi-Service Workflow Integrity
* **Gerak Car**: Test driver-rider matching, real-time ride acceptance, route recalculation, cancellation penalties, and fare calculation.
* **Jubah Delivery**: Test robe pickup scheduling, bulk address validation, parcel status updates, and courier assignment.
* **Gerak Rental**: Verify calendar availability locks, overlapping booking collision prevention, and security deposit workflows.
* **Gerak Transporter**: Stress-test bulk passenger allocation, scheduled recurring bookings, and capacity limit validations.
* **Admin Console**: Ensure strict Role-Based Access Control (RBAC) so admins, dispatchers, drivers, and campus riders cannot access unauthorized data.

### 2. Realtime & Network Resilience (Supabase + Maps)
* **Realtime Sync**: What happens when a rider/driver drops connection mid-trip? Verify websocket reconnects and state re-hydration.
* **Maps & Geolocation**: Test MapLibre GL rendering across low-end mobile devices, GPS signal drift, Nominatim/Google Places API rate limiting, and OSRM routing fallbacks.
* **Race Conditions & Double Booking**: Verify that concurrent requests (e.g., two drivers accepting the same ride simultaneously) are safely handled via database transactions/RPC.

### 3. Progressive Web App (PWA) & Mobile Web
* **Browser Navigation**: Test `AppContext` popstate handling, browser back/forward buttons, floor-vs-service history rules, and elastic bouncing.
* **Mobile Web Performance**: Test mobile Safari and Chrome responsiveness, PWA install prompts, service worker asset caching, and safe-area-inset padding on notch devices.
* **Touch Interactions**: Validate `onPointerDown` gesture responsiveness to eliminate iOS Safari tap lag and avoid UI freezes.

### 4. UI/UX Standard Compliance
* Verify strict adherence to Gerak UI standards:
  - Active field press states (`bg-slate-50`, `scale-0.99`) and `onPointerDown` toggles.
  - Sheet/Drawer scroll behavior and bottom clearance (`6.5rem` / safe-area).
  - Monospace receipt generation and PDF iframe printing rendering without clipping.

## How to provide the testing solution

- **Artifact Plan**: Output a clear structured table: `Module | Scenario | Failure Mode | Severity | Fix/Test Script`.
- **Edge Case Coverage**: Detail extreme edge cases (e.g., erratic network drops, rapid spam clicks on booking triggers, timezone shifts on scheduled rides).
- **Automated Tests**: Provide robust Playwright/Cypress E2E test specs and Jest/Vitest unit tests for critical edge functions and state transitions.
- **Root Cause & Fixes**: Provide rock-solid, production-ready fixes wrapped in error boundaries and optimistic UI updates.