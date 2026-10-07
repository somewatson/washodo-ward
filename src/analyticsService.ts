import { dbManager } from './db';

export class AnalyticsService {
    private async getDb() {
        return await dbManager.getDb();
    }

    async trackEvent(groupId: string, eventType: 'impression' | 'click', req: any, streamerLogin?: string) {
        const db = await this.getDb();
        const userAgent = req.headers['user-agent'] || 'unknown';
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        
        const ipHash = this.hashIp(ip);
        
        await db.run(`
            INSERT INTO analytics (group_id, event_type, streamer_login, user_agent, ip_hash)
            VALUES (?, ?, ?, ?, ?)
        `, groupId, eventType, streamerLogin, userAgent, ipHash);
    }

    private hashIp(ip: string): string {
        let hash = 0;
        for (let i = 0; i < ip.length; i++) {
            hash = ((hash << 5) - hash) + ip.charCodeAt(i);
            hash |= 0; 
        }
        return hash.toString();
    }

    async getGroupStats(groupId: string) {
        const db = await this.getDb();
        const impressions = await db.get("SELECT COUNT(*) as count FROM analytics WHERE group_id = ? AND event_type = 'impression'", groupId) as { count: number };
        const clicks = await db.get("SELECT COUNT(*) as count FROM analytics WHERE group_id = ? AND event_type = 'click'", groupId) as { count: number };
        
        return {
            impressions: impressions.count,
            clicks: clicks.count,
            ctr: impressions.count > 0 ? (clicks.count / impressions.count) * 100 : 0
        };
    }
}

export const analyticsService = new AnalyticsService();
