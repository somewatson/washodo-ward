import { dbManager } from './db';

export class AnalyticsService {
    private db = dbManager.getDb();

    async trackEvent(groupId: string, eventType: 'impression' | 'click', req: any, streamerLogin?: string) {
        const userAgent = req.headers['user-agent'] || 'unknown';
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        
        // Simple IP hash to protect privacy while allowing unique counting
        const ipHash = this.hashIp(ip);
        
        const stmt = this.db.prepare(`
            INSERT INTO analytics (group_id, event_type, streamer_login, user_agent, ip_hash)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(groupId, eventType, streamerLogin, userAgent, ipHash);
    }

    private hashIp(ip: string): string {
        // Basic hash for demo purposes; in production use a proper crypto hash
        let hash = 0;
        for (let i = 0; i < ip.length; i++) {
            hash = ((hash << 5) - hash) + ip.charCodeAt(i);
            hash |= 0; 
        }
        return hash.toString();
    }

    async getGroupStats(groupId: string) {
        const impressions = this.db.prepare("SELECT COUNT(*) as count FROM analytics WHERE group_id = ? AND event_type = 'impression'").get(groupId) as { count: number };
        const clicks = this.db.prepare("SELECT COUNT(*) as count FROM analytics WHERE group_id = ? AND event_type = 'click'").get(groupId) as { count: number };
        
        return {
            impressions: impressions.count,
            clicks: clicks.count,
            ctr: impressions.count > 0 ? (clicks.count / impressions.count) * 100 : 0
        };
    }
}

export const analyticsService = new AnalyticsService();
