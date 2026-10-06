# User Guide: Managing Your Streamer Friend Groups

Welcome to the friends.washodo.tv platform! This guide will help you set up your group, customize your widgets, and configure notifications.

## 🌟 Getting Started

### Signing In
1. Click **Login with Twitch**.
2. Authorize the application to access your basic profile and email.
3. You will be redirected to your personal dashboard.

### Free vs. Paid (Washodo) Tiers
- **Free Tier**: Allows you to create groups, but you must include at least one member from the Washodo core team (`somewatson`, `shodesu`, `puddotv`, `sedurrr`, `omegamixed`).
- **Paid Tier**: Unlock the ability to create fully custom groups without mandatory members.

## 👥 Group Management

### Creating a Group
1. On the Dashboard, click **Create New Group**.
2. Enter a name for your group (e.g., "The Chaos Crew").
3. Enter the Twitch usernames of the streamers you want to track, separated by commas.
4. Click **Save**.

### Setting a Status Message
You can set a custom message (e.g., "Everyone is chilling!") that appears at the top of your widgets.
1. Find your group on the dashboard.
2. Click **Edit Widget Message**.
3. Type your message and save.

## 🖼️ Widget Deployment

### OBS Browser Source (Recommended)
1. Copy the **Widget URL** from your group card.
2. In OBS, add a new **Browser Source**.
3. Paste the URL into the URL field.
4. Set the width/height (typically `400x600` or similar) and click OK.

### Web & Social Embeds
You can link your widget URL in your Twitch "About" panels or social media bios. The widgets are responsive and look great on mobile and desktop.

## 🔔 Notification Gateway

Stay updated whenever someone in your group goes live or changes status.

### Setting Up Webhooks
1. Click **Manage Notifications** on your group card.
2. Select your provider (Discord, Slack, or Microsoft Teams).
3. Paste the **Webhook URL** provided by that platform.
4. Configure your triggers (e.g., "Notify when anyone goes live").

### Payload Templates
You can customize the message sent to your chat using these variables:
- `{{streamer}}`: The display name of the streamer.
- `{{status}}`: Whether they are "Live" or "Offline".
- `{{title}}`: The current stream title (if live).
- `{{url}}`: The direct link to their Twitch channel.

## ❓ FAQ

**How often are statuses updated?**
The system polls the Twitch API every 5 minutes to ensure data is fresh without hitting rate limits.

**Is my data private?**
We only store the public Twitch IDs and usernames of the streamers you track. Engagement data (clicks/views) is aggregated and anonymized.

**Why is my widget not updating?**
Check your internet connection and ensure the Widget URL is correct. If the issue persists, try refreshing the Browser Source in OBS.
