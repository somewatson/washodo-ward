import { dbManager } from './db';
import { TwitchClient } from './twitchClient';
import { notificationService } from './notificationService';

export class StatusService {
    private async getDb() {
        return await dbManager.getDb();
    }
    private twitch = new TwitchClient();

    async updateAllStatuses() {
        const db = await this.getDb();
        console.log('[StatusService] Starting bulk status update...');
        
        // 1. Find all unique streamers across all groups
        const allStreamers = await db.all('SELECT DISTINCT streamer_login FROM group_members') as { streamer_login: string }[];
        const usernames = allStreamers.map(s => s.streamer_login);

        if (usernames.length === 0) {
            console.log('[StatusService] No streamers to track.');
            return;
        }

        // Twitch API limits: 100 per request for /streams
        const chunkSize = 100;
        for (let i = 0; i < usernames.length; i += chunkSize) {
            const chunk = usernames.slice(i, i + chunkSize);
            const liveStreamers = await this.twitch.getLiveStreamers(chunk);
            const liveLogins = new Set(liveStreamers.map(s => s.user_login.toLowerCase()));

            // Update cache for those who are live
            for (const s of liveStreamers) {
                await db.run(`
                    INSERT INTO streamer_cache (streamer_login, display_name, profile_image_url, is_live, stream_title, thumbnail_url, last_updated)
                    VALUES (?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(streamer_login) DO UPDATE SET
                        is_live = 1,
                        stream_title = excluded.stream_title,
                        thumbnail_url = excluded.thumbnail_url,
                        last_updated = CURRENT_TIMESTAMP
                `, s.user_login.toLowerCase(), s.displayName, s.profile_image_url, s.title, s.thumbnail_url);
            }

            // Update cache for those in this chunk who are NOT live
            for (const login of chunk) {
                if (!liveLogins.has(login.toLowerCase())) {
                    await db.run(`
                        INSERT INTO streamer_cache (streamer_login, is_live, last_updated)
                        VALUES (?, 0, CURRENT_TIMESTAMP)
                        ON CONFLICT(streamer_login) DO UPDATE SET
                            is_live = 0,
                            last_updated = CURRENT_TIMESTAMP
                    `, login.toLowerCase());
                }
            }
        }
        console.log('[StatusService] Status update complete.');
        
        // 2. Trigger notifications for status changes
        await this.processNotifications();
    }

    private async processNotifications() {
        const db = await this.getDb();
        const groups = await db.all('SELECT id FROM groups') as { id: string }[];
        
        for (const group of groups) {
            const members = await db.all('SELECT streamer_login FROM group_members WHERE group_id = ?', group.id) as { streamer_login: string }[];
            
            for (const member of members) {
                const login = member.streamer_login;
                const cached = await db.get('SELECT is_live, display_name FROM streamer_cache WHERE streamer_login = ?', login) as any;
                
                if (!cached) continue;

                const currentStatus = cached.is_live; // 1 = live, 0 = offline
                const streamerName = cached.display_name || login;

                const state = await db.get('SELECT last_status FROM notification_state WHERE group_id = ? AND streamer_login = ?', group.id, login) as { last_status: number } | undefined;

                if (state === undefined || state.last_status !== currentStatus) {
                    console.log(`[StatusService] Status change detected for ${streamerName} in group ${group.id}: ${state?.last_status ?? 'unknown'} -> ${currentStatus}`);
                    
                    await notificationService.notifyGroup(group.id, streamerName, currentStatus === 1 ? 'live' : 'offline');

                    await db.run(`
                        INSERT INTO notification_state (group_id, streamer_login, last_status, last_notified_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(group_id, streamer_login) DO UPDATE SET
                            last_status = excluded.last_status,
                            last_notified_at = CURRENT_TIMESTAMP
                    `, group.id, login, currentStatus);
                }
            }
        }
    }

    async getStatusForGroup(groupId: string) {
        const db = await this.getDb();
        const members = await db.all('SELECT streamer_login FROM group_members WHERE group_id = ?', groupId) as { streamer_login: string }[];
        const logins = members.map(m => m.streamer_login);
        
        if (logins.length === 0) return [];
        
        const placeholders = logins.map(() => '?').join(',');
        const statuses = await db.all(`
            SELECT * FROM streamer_cache 
            WHERE streamer_login IN (${placeholders})
        `, ...logins) as any[];
        
        return statuses;
    }

    async updateStatusesForGroup(groupId: string) {
        const db = await this.getDb();
        const members = await db.all('SELECT streamer_login FROM group_members WHERE group_id = ?', groupId) as { streamer_login: string }[];
        const usernames = members.map(m => m.streamer_login);

        if (usernames.length === 0) return;

        const liveStreamers = await this.twitch.getLiveStreamers(usernames);
        const liveLogins = new Set(liveStreamers.map(s => s.user_login.toLowerCase()));

        for (const s of liveStreamers) {
            await db.run(`
                INSERT INTO streamer_cache (streamer_login, display_name, profile_image_url, is_live, stream_title, thumbnail_url, last_updated)
                VALUES (?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(streamer_login) DO UPDATE SET
                    is_live = 1,
                    stream_title = excluded.stream_title,
                    thumbnail_url = excluded.thumbnail_url,
                    last_updated = CURRENT_TIMESTAMP
            `, s.user_login.toLowerCase(), s.displayName, s.profile_image_url, s.title, s.thumbnail_url);
        }

        for (const login of usernames) {
            if (!liveLogins.has(login.toLowerCase())) {
                await db.run(`
                    INSERT INTO streamer_cache (streamer_login, is_live, last_updated)
                    VALUES (?, 0, CURRENT_TIMESTAMP)
                    ON CONFLICT(streamer_login) DO UPDATE SET
                        is_live = 0,
                        last_updated = CURRENT_TIMESTAMP
                `, login.toLowerCase());
            }
        }
    }
}

export const statusService = new StatusService();
