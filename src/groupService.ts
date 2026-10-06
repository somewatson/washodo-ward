import { v4 as uuidv4 } from 'uuid';
import { dbManager } from './db';

export class GroupService {
    private db = dbManager.getDb();
    private washodoMembers = ['somewatson', 'shodesu', 'puddotv', 'sedurrr', 'omegamixed'];

    async createGroup(ownerId: string, name: string, streamers: string[]): Promise<string> {
        // Check if user is paid
        const user = this.db.prepare('SELECT is_paid FROM users WHERE id = ?').get(ownerId) as { is_paid: number };
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
        
        const insertGroup = this.db.prepare('INSERT INTO groups (id, owner_id, name) VALUES (?, ?, ?)');
        insertGroup.run(groupId, ownerId, name);

        const insertMember = this.db.prepare('INSERT INTO group_members (group_id, streamer_login) VALUES (?, ?)');
        
        const transaction = this.db.transaction((members: string[]) => {
            for (const member of members) {
                insertMember.run(groupId, member);
            }
        });

        transaction(finalStreamers);
        return groupId;
    }

    async getGroup(groupId: string) {
        const group = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId) as any;
        if (!group) return null;

        const members = this.db.prepare('SELECT streamer_login FROM group_members WHERE group_id = ?').all(groupId) as any[];
        return {
            ...group,
            members: members.map(m => m.streamer_login)
        };
    }

    async addMember(groupId: string, streamerLogin: string) {
        const user = this.db.prepare('SELECT id FROM users JOIN groups ON users.id = groups.owner_id WHERE groups.id = ?').get(groupId) as any;
        const ownerId = user?.id;
        const owner = this.db.prepare('SELECT is_paid FROM users WHERE id = ?').get(ownerId) as { is_paid: number };

        if (owner?.is_paid !== 1) {
            // Free users cannot remove Washodo members. 
            // Logic for adding is fine, but we must ensure they don't try to "clean up" the required members.
        }

        const insertMember = this.db.prepare('INSERT OR IGNORE INTO group_members (group_id, streamer_login) VALUES (?, ?)');
        insertMember.run(groupId, streamerLogin.toLowerCase());
    }

    async removeMember(groupId: string, streamerLogin: string) {
        const user = this.db.prepare('SELECT id FROM users JOIN groups ON users.id = groups.owner_id WHERE groups.id = ?').get(groupId) as any;
        const ownerId = user?.id;
        const owner = this.db.prepare('SELECT is_paid FROM users WHERE id = ?').get(ownerId) as { is_paid: number };

        if (owner?.is_paid !== 1) {
            if (this.washodoMembers.includes(streamerLogin.toLowerCase())) {
                throw new Error('Free users cannot remove Washodo members from their groups.');
            }
        }

        const removeMember = this.db.prepare('DELETE FROM group_members WHERE group_id = ? AND streamer_login = ?');
        removeMember.run(groupId, streamerLogin.toLowerCase());
    }

    async getMembers(groupId: string): Promise<string[]> {
        const members = this.db.prepare('SELECT streamer_login FROM group_members WHERE group_id = ?').all() as any[];
        return members.map(m => m.streamer_login);
    }
}

export const groupService = new GroupService();
