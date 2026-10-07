import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';


export class DbManager {
    private db: Database.Database;

    constructor() {
        const dbPath = path.join(process.cwd(), 'database.sqlite');
        this.db = new Database(dbPath);
        this.init();
    }

    private init() {
        // Users table
        this.db.exec(`
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
        this.db.exec(`
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
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS group_members (
                group_id TEXT NOT NULL,
                streamer_login TEXT NOT NULL,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, streamer_login),
                FOREIGN KEY (group_id) REFERENCES groups(id)
            )
        `);

        // Streamer Cache table
        this.db.exec(`
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
        this.db.exec(`
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
        this.db.exec(`
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

        // Notification State table (to track when we last notified for a specific streamer in a group)
        this.db.exec(`
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

    getDb(): DatabaseType {
        return this.db;
    }
}

export const dbManager = new DbManager();
