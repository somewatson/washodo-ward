# Friends.Washodo.tv - Streamer Friend Group Tracker

A SaaS platform for tracking streamer friend groups via dashboards, embeddable widgets, and a notification gateway.

## 🚀 Quick Start

### Installation
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Configure your `.env` file (see [Admin Docs](/docs/admin.md)).
4. Start the server: `npm run start`.

### Deployment
For production, use `pm2` or a similar process manager to keep the server running.

## 🔑 API Key Flexibility (SaaS vs. Self-Hosted)

This platform is designed to be used both as a managed SaaS and as a self-hosted instance.

- **SaaS Mode**: Uses global `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` from the environment.
- **Self-Hosted Mode**: Instance administrators can override global keys via the **Admin** panel in the dashboard. This allows self-hosters to use their own Twitch Developer App credentials to avoid quota issues and comply with their own developer agreements.

## 🛠️ Tech Stack
- **Backend**: Node.js / Express
- **Database**: SQLite (`better-sqlite3`)
- **Authentication**: Twitch OAuth2
- **Worker**: Background polling every 5 minutes

## 📖 Documentation
- **[Administrator Guide](/docs/admin.md)**: Deployment, Twitch App registration, and instance configuration.
- **[User Guide](/docs/user.md)**: Group management, widget setup, and notifications.

## ⚖️ License
This project is licensed under a custom non-commercial license. Self-hosting for personal or non-commercial case is permitted. Commercial sale or redistribution is prohibited.
