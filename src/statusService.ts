import { dbManager } from './db';
import { TwitchClient } from './twitchClient';
import { notificationService } from './notificationService';
 
export class StatusService {
    private db = dbManager.getDb();
    private twitch = new TwitchClient();
 
    async updateAllStatuses() {
        console.log('[StatusService] Starting bulk status update...');
        
        // 1. Find all unique streamers across all groups
        const allStreamers = this.db.prepare('SELECT DISTINCT streamer_login FROM group_members').all() as { streamer_login: string }[];
        const usernames = allStreamers.map(s => s.streamer_login);

        if (usernames.length === 0) {
            console.log('[StatusService] No streamers to track.');
            return;
        }

        // Twitch API limits: 100 per request for /streams
        const chunkSize = 100;
        for (let i = 0; i < usernames.length; i += chunkSize) {
            const chunk = usernames.slice(i, i + chunkSize);
            
            // Since the background worker updates the global cache, we use the global credentials here.
            // If we wanted to support group-specific credentials for caching, we'd need to loop by group.
            const liveStreamers = await this.twitch.getLiveStreamers(chunk);
            
            const liveLogins = new Set(liveStreamers.map(s => s.user_login.toLowerCase()));

            // Update cache for those who are live
            const updateLive = this.db.prepare(`
                INSERT INTO streamer_cache (streamer_login, display_name, profile_image_url, is_live, stream_title, thumbnail_url, last_updated)
                VALUES (?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(streamer_login) DO UPDATE SET
                    is_live = 1,
                    stream_title = excluded.stream_title,
                    thumbnail_url = excluded.thumbnail_url,
                    last_updated = CURRENT_TIMESTAMP
            `);

            for (const s of liveStreamers) {
                updateLive.run(s.user_login.toLowerCase(), s.displayName, s.profile_image_url, s.title, s.thumbnail_url);
            }

            // Update cache for those in this chunk who are NOT live
            const updateOffline = this.db.prepare(`
                INSERT INTO streamer_cache (streamer_login, is_live, last_updated)
                VALUES (?, 0, CURRENT_TIMESTAMP)
                ON CONFLICT(streamer_login) DO UPDATE SET
                    is_live = 0,
                    last_updated = CURRENT_TIMESTAMP
            `);

            for (const login of chunk) {
                if (!liveLogins.has(login.toLowerCase())) {
                    updateOffline.run(login.toLowerCase());
                }
            }
        }
        console.log('[StatusService] Status update complete.');
        
        // 2. Trigger notifications for status changes
        await this.processNotifications();
    }

    private async processNotifications() {
        // Find all groups and their members
        const groups = this.db.prepare('SELECT id FROM groups').all() as { id: string }[];
        
        for (const group of groups) {
            const members = this.db.prepare('SELECT streamer_login FROM group_members WHERE group_id = ?').all(group.id) as { streamer_login: string }[];
            
            for (const member of members) {
                const login = member.streamer_login;
                const cached = this.db.prepare('SELECT is_live, display_name FROM streamer_cache WHERE streamer_login = ?').get(login) as any;
                
                if (!cached) continue;

                const currentStatus = cached.is_live; // 1 = live, 0 = offline
                const streamerName = cached.display_name || login;

                // Check last notified status for this streamer in this group
                const state = this.db.prepare('SELECT last_status FROM notification_state WHERE group_id = ? AND streamer_login = ?').get(group.id, login) as { last_status: number } | undefined;

                // Only notify if status has changed
                if (state === undefined || state.last_status !== currentStatus) {
                    console.log(`[StatusService] Status change detected for ${streamerName} in group ${group.id}: ${state?.last_status ?? 'unknown'} -> ${currentStatus}`);
                    
                    // Trigger notifications via NotificationService
                    await notificationService.notifyGroup(group.id, streamerName, currentStatus === 1 ? 'live' : 'offline');

                    // Update notification state
                    this.db.prepare(`
                        INSERT INTO notification_state (group_id, streamer_login, last_status, last_notified_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(group_id, streamer_login) DO UPDATE SET
                            last_status = excluded.last_status,
                            last_notified_at = CURRENT_TIMESTAMP
                    `).run(group.id, login, currentStatus);
                }
            }
        }
    }
 
    async getStatusForGroup(groupId: string) {
        const members = this.db.prepare('SELECT streamer_login FROM group_members WHERE group_id = ?').all() as { streamer_login: string }[];
        const logins = members.map(m => m.streamer_login);
 
        if (logins.length === 0) return [];
 
        const placeholders = logins.map(() => '?').join(',');
        const statuses = this.db.prepare(`
            SELECT * FROM streamer_cache 
            WHERE streamer_login IN (${placeholders})
        `).all(...logins) as any[];
 
        return statuses;
    }
}
 
export const statusService = new StatusService();
