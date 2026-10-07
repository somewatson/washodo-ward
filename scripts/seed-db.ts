import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

async function seed() {
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log('[Seeder] Starting database seeding...');

    // 1. Create Washodo Members Group
    const membersGroupId = 'group-washodo-members';
    await db.run(`
        INSERT OR IGNORE INTO groups (id, owner_id, name, status_message, is_public)
        VALUES (?, 'system', 'Washodo Members', 'The core Washodo team', 1)
    `, [membersGroupId]);

    // 2. Create Washodo Friends Group
    const friendsGroupId = 'group-washodo-friends';
    await db.run(`
        INSERT OR IGNORE INTO groups (id, owner_id, name, status_message, is_public)
        VALUES (?, 'system', 'Washodo Friends', 'Friends of the house', 1)
    `, [friendsGroupId]);

    // Define the streamers
    // Note: Replace these with actual twitch logins if these are placeholders
    const members = process.env.WASHODO_MEMBERS ? process.env.WASHODO_MEMBERS.split(',') : ['washodo'];
    const friends = process.env.WASHODO_FRIENDS ? process.env.WASHODO_FRIENDS.split(',') : ['friend'];

    console.log(`[Seeder] Seeding ${members.length} members and ${friends.length} friends...`);

    for (const login of members) {
        await db.run(`INSERT OR IGNORE INTO group_members (group_id, streamer_login) VALUES (?, ?)`, [membersGroupId, login]);
        await db.run(`INSERT OR IGNORE INTO streamer_cache (streamer_login, display_name) VALUES (?, ?)`, [login, login]);
    }

    for (const login of friends) {
        await db.run(`INSERT OR IGNORE INTO group_members (group_id, streamer_login) VALUES (?, ?)`, [friendsGroupId, login]);
        await db.run(`INSERT OR IGNORE INTO streamer_cache (streamer_login, display_name) VALUES (?, ?)`, [login, login]);
    }

    console.log('[Seeder] Seeding completed successfully.');
}

seed().catch(err => {
    console.error('[Seeder] Error seeding database:', err);
    process.exit(1);
});
