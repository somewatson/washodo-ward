# Documentation & API Key Flexibility Plan

## 1. API Key Architecture Update
The goal is to support two modes of operation to accommodate both the official SaaS offering and independent self-hosters.

- **SaaS Mode (Default)**: Users authenticate via OAuth2 using the platform's global `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. This ensures a seamless onboarding experience.
- **Self-Hosted Mode**: Allows the instance administrator to provide their own API keys. This ensures that self-hosters are not dependent on the SaaS provider's API quota and comply with their own developer agreements.

### Technical Implementation:
- **Database Schema**: 
    - Add `client_id` and `client_secret` columns to the `users` table (nullable).
    - This allows the system to check if a specific user (like the admin) has overridden the global credentials.
- **TwitchClient Logic**: 
    - Update the `TwitchClient` class to accept optional credentials per request.
    - Logic: `Use User-Specific Keys` $\rightarrow$ `Fallback to Global Environment Keys`.
- **Admin Interface**: 
    - Add a restricted settings section in the Dashboard (accessible only to the first user/admin) to update these keys without needing to restart the server.

## 2. Comprehensive Documentation

### Tier A: Administrator/Host Documentation
**Target**: The person deploying the software.
**Files**: `README.md` (updated), `docs/admin.md`
- **Deployment Guide**: 
    - Detailed environment variable map.
    - Step-by-step walkthrough for registering a Twitch Developer App.
    - Configuration for the Redirect URI.
- **Self-Hosting Guide**:
    - How to configure the instance to use personal API keys.
    - Managing the SQLite database (backups and migrations).
- **Maintenance**: 
    - Updating the software.
    - Troubleshooting common OAuth and Connection errors.

### Tier B: End-User Documentation
**Target**: Streamers and group creators.
**Files**: `public/help.html` (In-app), `docs/user.md`
- **Onboarding**: Signing in with Twitch and understanding the Free vs. Paid (Washodo) tiers.
- **Group Management**: 
    - Creating groups and adding members.
    - Setting the dynamic "Status Message" for widgets.
- **Widget Deployment**:
    - **OBS**: Detailed guide on adding a "Browser Source".
    - **Web**: How to embed via Iframe or link in social bios.
- **Notification Gateway**: 
    - How to create Discord/Slack webhooks.
    - Guide to the payload template variables (`{{streamer}}`, `{{status}}`, etc.).
- **FAQ**: Polling intervals, privacy (IP hashing), and troubleshooting.

## 3. Success Criteria
- [ ] Users can continue to sign up via the standard OAuth flow.
- [ ] Self-hosted admins can successfully override global API keys via the DB or UI.
- [ ] `docs/admin.md` is a complete technical manual for deployment.
- [ ] `public/help.html` is an intuitive, user-friendly guide integrated into the dashboard.
- [ ] `README.md` clearly explains the dual-mode API key support.
