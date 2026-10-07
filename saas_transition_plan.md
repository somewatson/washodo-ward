# SaaS Transition and Bug Fix Plan

This document outlines the plan to transition the current tool into a SaaS product and resolve a critical session store initialization error.

## 🛠️ Critical Bug Fixes
### SQLite Session Store Error
**Issue:** `TypeError: Cannot read properties of undefined (reading 'prototype')` during `SQLiteStore` initialization in `src/session.ts`.
**Plan:**
1. Inspect `src/session.ts` to verify the `connect-sqlite3` import and instantiation logic.
2. Check `package.json` for version compatibility between `express-session` and `connect-sqlite3`.
3. Fix the import/instantiation to match the package's expected API.

---

## 🚀 SaaS Product Transition

### 1. Routing & Page Structure
The application will move from a direct-to-dashboard model to a public-facing marketing model.

| Route | Page/Action | Description |
| :--- | :--- | :--- |
| `/` | `public/index.html` | **Landing Page**: Marketing, features, and pricing. |
| `/status` | `public/status.html` | **Public Status Page**: High-level status board for Washodo members. |
| `/dashboard` | `public/dashboard.html` | **User Dashboard**: Protected area for authenticated users. |
| `/auth/login` | Logic in `src/server.ts` | **Authentication**: Twitch OAuth entry point. |

### 2. Frontend Development
**Landing Page (`public/index.html`)**
- **Hero Section**: Clear value proposition for the tool.
- **Features Section**: Showcase capabilities (tracking, analytics, notifications).
- **Pricing Table**: Display different subscription tiers.
- **Auth CTAs**: "Sign Up" and "Log In" buttons leading to the Twitch OAuth flow.

**Public Status Page (`public/status.html`)**
- A read-only, aesthetically pleasing board showing the current live status of Washodo community members.
- Pulls data from a new public API endpoint.

### 3. Backend Implementation
- **Server Routes**: Update `src/server.ts` to serve the new `index.html` and `status.html`.
- **Public API**: Create a new endpoint (e.g., `/api/public/status`) that provides data for the public status page without exposing private user/group information.
- **Auth Flow**: Refine the onboarding process so that first-time Twitch logins automatically trigger account creation in the database.

## ✅ Success Criteria
- [ ] `SQLiteStore` initializes without errors.
- [ ] Root URL `/` renders a marketing landing page instead of redirecting.
- [ ] `/status` renders a public status board.
- [ ] Landing page contains pricing, features, and working login/signup links.
- [ ] Authenticated users can still access the dashboard.
