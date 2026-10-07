import { v4 as uuidv4 } from 'uuid';
import { dbManager } from './db';

export class GroupService {
    private async getDb() {
        return await dbManager.getDb();
    }
    private washodoMembers = ['somewatson', 'shodesu', 'puddotv', 'sedurrr', 'omegamixed'];

    async createGroup(ownerId: string, name: string, streamers: string[]): Promise<string> {
        const db = await this.getDb();
        // Check if user is paid
        const user = await db.get('SELECT is_paid FROM users WHERE id = ?', ownerId) as { is_paid: number };
        const isPaid = user?.is_paid === 1;

        let finalStreamers = streamers.map(s => s.toLowerCase());

        if (!isPaid) {
            // Free users MUST include all Washodo members
            const hasAllWashodo = this.washodoMembers.every(member => finalStreamers.includes(member));
            if (!hasAllWashodo) {
                // Automatically inject missing Washodo members for free users
                finalStreamers = [...new Set([...finalStreamers, ...this.washodoMembers])];
            }
        }

        const groupId = uuidv4();
        
        await db.run('INSERT INTO groups (id, owner_id, name) VALUES (?, ?, ?)', groupId, ownerId, name);

        for (const member of finalStreamers) {
            await db.run('INSERT INTO group_members (group_id, streamer_login) VALUES (?, ?)', groupId, member);
        }
        
        return groupId;
    }

    async getGroup(groupId: string) {
        const db = await this.getDb();
        const group = await db.get('SELECT * FROM groups WHERE id = ?', groupId) as any;
        if (!group) return null;

        const members = await db.all('SELECT streamer_login FROM group_members WHERE group_id = ?', groupId) as any[];
        return {
            ...group,
            members: members.map(m => m.streamer_login)
        };
    }

    async addMember(groupId: string, streamerLogin: string) {
        const db = await this.getDb();
        const user = await db.get('SELECT id FROM users JOIN groups ON users.id = groups.owner_id WHERE groups.id = ?', groupId) as any;
        const ownerId = user?.id;
        const owner = await db.get('SELECT is_paid FROM users WHERE id = ?', ownerId) as { is_paid: number };

        if (owner?.is_paid !== 1) {
            // Free users cannot remove Washodo members. 
            // Logic for adding is fine, but we must ensure they don't try to "clean up" the required members.
        }

        await db.run('INSERT OR IGNORE INTO group_members (group_id, streamer_login) VALUES (?, ?)', groupId, streamerLogin.toLowerCase());
    }

    async removeMember(groupId: string, streamerLogin: string) {
        const db = await this.getDb();
        const user = await db.get('SELECT id FROM users JOIN groups ON users.id = groups.owner_id WHERE groups.id = ?', groupId) as any;
        const ownerId = user?.id;
        const owner = await db.get('SELECT is_paid FROM users WHERE id = ?', ownerId) as { is_paid: number };

        if (owner?.is_paid !== 1) {
            if (this.washodoMembers.includes(streamerLogin.toLowerCase())) {
                throw new Error('Free users cannot remove Washodo members from their groups.');
            }
        }

        await db.run('DELETE FROM group_members WHERE group_id = ? AND streamer_login = ?', groupId, streamerLogin.toLowerCase());
    }

    async getMembers(groupId: string): Promise<string[]> {
        const db = await this.getDb();
        const members = await db.all('SELECT streamer_login FROM group_members WHERE group_id = ?', groupId) as any[];
        return members.map(m => m.streamer_login);
    }
}

export const groupService = new GroupService();
