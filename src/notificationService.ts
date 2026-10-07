import { dbManager } from './db';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookDestination {
    id: string;
    groupId: string;
    url: string;
    payloadTemplate: string;
    provider: string;
    isActive: boolean;
}

export class NotificationService {
    private db = dbManager.getDb();

    async createWebhook(groupId: string, url: string, template: string, provider: string): Promise<string> {
        const id = uuidv4();
        const stmt = this.db.prepare(`
            INSERT INTO webhook_destinations (id, group_id, url, payload_template, provider, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
        `);
        stmt.run(id, groupId, url, template, provider);
        return id;
    }

    async getWebhooksForGroup(groupId: string): Promise<WebhookDestination[]> {
        const rows = this.db.prepare('SELECT * FROM webhook_destinations WHERE group_id = ? AND is_active = 1').all(groupId) as any[];
        return rows.map(r => ({
            id: r.id,
            groupId: r.group_id,
            url: r.url,
            payloadTemplate: r.payload_template,
            provider: r.provider,
            isActive: r.is_active === 1
        }));
    }

    async deleteWebhook(id: string) {
        this.db.prepare('DELETE FROM webhook_destinations WHERE id = ?').run(id);
    }

    async notifyStatusChange(groupId: string, streamerLogin: string, displayName: string, isLive: boolean) {
        const webhooks = await this.getWebhooksForGroup(groupId);
        const statusText = isLive ? 'LIVE' : 'Offline';
        
        const notifications = webhooks.map(async (webhook) => {
            try {
                const payload = this.formatPayload(webhook, {
                    streamer: displayName,
                    login: streamerLogin,
                    status: statusText,
                    url: `https://twitch.tv/${streamerLogin}`
                });
                
                if (webhook.url.startsWith('mailto:')) {
                    // Email integration simulation
                    console.log(`[Email Notification] Sending to ${webhook.url}: ${payload.message || JSON.stringify(payload)}`);
                } else {
                    await axios.post(webhook.url, payload);
                }
            } catch (e) {
                console.error(`Failed to send notification ${webhook.id} to ${webhook.url}:`, e);
            }
        });
        
        await Promise.allSettled(notifications);
    }

    async notifyGroup(groupId: string, streamerName: string, status: 'live' | 'offline', login?: string) {
        // If login is not provided, we'd typically need to look it up. 
        // For this helper, we'll assume the login is part of the context or a generic notification.
        const loginName = login || streamerName.toLowerCase();
        await this.notifyStatusChange(groupId, loginName, streamerName, status === 'live');
    }

    private formatPayload(webhook: WebhookDestination, data: any) {
        const message = webhook.payloadTemplate
            .replace('{{streamer}}', data.streamer)
            .replace('{{login}}', data.login)
            .replace('{{status}}', data.status)
            .replace('{{url}}', data.url);

        switch (webhook.provider) {
            case 'discord':
                return { content: message };
            case 'slack':
                return { text: message };
            case 'generic':
            default:
                return { message: message, ...data };
        }
    }
}

export const notificationService = new NotificationService();
