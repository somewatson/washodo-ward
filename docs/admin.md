# Administrator & Host Documentation

This guide is intended for the person deploying and managing the friends.washodo.tv instance.

## 🚀 Deployment Guide

### Environment Variables
Create a `.env` file in the root directory with the following variables:

| Variable | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `PORT` | Port the server runs on | No | `3001` |
| `TWITCH_CLIENT_ID` | Your Twitch App Client ID | Yes (SaaS) | - |
| `TWITCH_CLIENT_SECRET` | Your Twitch App Client Secret | Yes (SaaS) | - |
| `TWITCH_REDIRECT_URI` | OAuth Redirect URI | Yes | `http://localhost:3001/auth/callback` |
| `SESSION_SECRET` | Secret for session signing | Yes | - |

### Registering a Twitch Developer App
1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console).
2. Register a new Application.
3. Set the **OAuth Redirect URL** to match your `TWITCH_REDIRECT_URI`.
4. Copy the **Client ID** and generate a **Client Secret**.
5. Add these to your `.env` file.

## 🛠️ Self-Hosting & API Key Flexibility

The platform supports two modes of operation:

### 1. SaaS Mode (Global)
By default, the instance uses the keys provided in the `.env` file. All users authenticate and make requests using these global credentials.

### 2. Custom Key Mode (Self-Hosted)
Self-hosted administrators can override the global keys without restarting the server:
- Navigate to the **Dashboard** $\rightarrow$ **Admin** section.
- Enter your own `Twitch Client ID` and `Twitch Client Secret`.
- These keys are stored in the database and will be used for API requests when applicable.

## 📦 Database Management
The system uses `better-sqlite3` and stores data in `database.sqlite` in the root folder.

- **Backups**: Simply copy the `database.sqlite` file to a secure location.
- **Migrations**: The system uses `CREATE TABLE IF NOT EXISTS`, meaning new tables are added on startup. For column additions (like `client_id`), you may need to manually update the table using a SQLite browser or `ALTER TABLE` commands if you are updating from an older version.

## 🔍 Troubleshooting
- **Auth Failures**: Ensure your `TWITCH_REDIRECT_URI` matches exactly what is registered in the Twitch Console.
- **Rate Limits**: If you experience `429 Too Many Requests`, consider implementing a proxy or checking the polling interval in the background worker.
- **Permissions**: Ensure the user running the process has write access to the root directory to create the SQLite database.
