import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

export class DbManager {
    private db: any = null;
    private promiseDb: any = null;

    constructor() {
        const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
        
        this.promiseDb = open({
            filename: dbPath,
            driver: sqlite3.Database
        }).catch(err => {
            console.error('Failed to open database:', err);
            throw err;
        });
    }

    async initialize() {
        const db = await this.promiseDb;
        this.db = db;
        console.log('[DbManager] Initializing database schema...');
        await this.init(db);
        console.log('[DbManager] Database schema initialized.');
        
        await this.seedDefaults(db);
    }

    private async seedDefaults(db: any) {
        // Check if we already have groups to avoid double seeding
        const groupCount = await db.get('SELECT count(*) as count FROM groups');
        if (groupCount.count > 0) return;

        console.log('[DbManager] Seeding default Washodo groups...');
        
        const membersGroupId = 'group-washodo-members';
        const friendsGroupId = 'group-washodo-friends';

        await db.run(`
            INSERT OR IGNORE INTO groups (id, owner_id, name, status_message, is_public)
            VALUES (?, 'system', 'Washodo Members', 'The core Washodo team', 1)
        `, [membersGroupId]);

        await db.run(`
            INSERT OR IGNORE INTO groups (id, owner_id, name, status_message, is_public)
            VALUES (?, 'system', 'Washodo Friends', 'Friends of the house', 1)
        `, [friendsGroupId]);

        const members = (process.env.WASHODO_MEMBERS || '').split(',').filter(Boolean);
        const friends = (process.env.WASHODO_FRIENDS || '').split(',').filter(Boolean);

        for (const login of members) {
            await db.run(`INSERT OR IGNORE INTO group_members (group_id, streamer_login) VALUES (?, ?)`, [membersGroupId, login]);
            await db.run(`INSERT OR IGNORE INTO streamer_cache (streamer_login, display_name) VALUES (?, ?)`, [login, login]);
        }

        for (const login of friends) {
            await db.run(`INSERT OR IGNORE INTO group_members (group_id, streamer_login) VALUES (?, ?)`, [friendsGroupId, login]);
            await db.run(`INSERT OR IGNORE INTO streamer_cache (streamer_login, display_name) VALUES (?, ?)`, [login, login]);
        }
        console.log('[DbManager] Default seeding completed.');
    }

    private async init(db: any) {
        // Users table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                twitch_id TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                display_name TEXT NOT NULL,
                email TEXT,
                is_paid INTEGER DEFAULT 0,
                client_id TEXT,
                client_secret TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Groups table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status_message TEXT,
                is_public INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(id)
            )
        `);

        // Group Members table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS group_members (
                group_id TEXT NOT NULL,
                streamer_login TEXT NOT NULL,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, streamer_login),
                FOREIGN KEY (group_id) REFERENCES groups(id)
            )
        `);

        // Streamer Cache table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS streamer_cache (
                streamer_login TEXT PRIMARY KEY,
                display_name TEXT,
                profile_image_url TEXT,
                is_live INTEGER DEFAULT 0,
                stream_title TEXT,
                thumbnail_url TEXT,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Analytics table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id TEXT,
                event_type TEXT NOT NULL, -- 'impression' or 'click'
                streamer_login TEXT,
                user_agent TEXT,
                ip_hash TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id)
            )
        `);

        // Webhook Destinations table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS webhook_destinations (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                url TEXT NOT NULL,
                payload_template TEXT DEFAULT '{{streamer}} is now {{status}}!',
                provider TEXT DEFAULT 'generic', -- 'discord', 'slack', etc.
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id)
            )
        `);

        // Notification State table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS notification_state (
                group_id TEXT NOT NULL,
                streamer_login TEXT NOT NULL,
                last_status INTEGER,
                last_notified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, streamer_login),
                FOREIGN KEY (group_id) REFERENCES groups(id)
            )
        `);
    }

    async getDb() {
        return this.promiseDb;
    }
}

export const dbManager = new DbManager();
