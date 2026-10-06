import request from 'supertest';
import { ApiServer } from '../src/server';
import { dbManager } from '../src/db';
import { groupService } from '../src/groupService';
import { v4 as uuidv4 } from 'uuid';

describe('SaaS Platform Integration Tests', () => {
    let server: ApiServer;
    let app: any;

    beforeAll(async () => {
        server = new ApiServer();
        app = server.app; // Accessing the express app
    });

    afterAll(async () => {
        await server.stop();
    });

    test('Group Creation - Free User forced Washodo members', async () => {
        const db = dbManager.getDb();
        const userId = uuidv4();
        const twitchId = `free_twitch_${uuidv4()}`;
        
        // Create a free user
        db.prepare('INSERT INTO users (id, twitch_id, username, display_name, is_paid) VALUES (?, ?, ?, ?, 0)').run(userId, twitchId, 'testuser', 'Test User');
        
        const groupName = 'My Free Group';
        const members = ['some_random_streamer'];
        
        const groupId = await groupService.createGroup(userId, groupName, members);
        const group = await groupService.getGroup(groupId);
        
        expect(group).not.toBeNull();
        expect(group?.members).toContain('somewatson');
        expect(group?.members).toContain('shodesu');
        expect(group?.members).toContain('puddotv');
        expect(group?.members).toContain('sedurrr');
        expect(group?.members).toContain('omegamixed');
        expect(group?.members).toContain('some_random_streamer');
    });

    test('Group Creation - Paid User custom members', async () => {
        const db = dbManager.getDb();
        const userId = uuidv4();
        const twitchId = `paid_twitch_${uuidv4()}`;
        
        // Create a paid user
        db.prepare('INSERT INTO users (id, twitch_id, username, display_name, is_paid) VALUES (?, ?, ?, ?, 1)').run(userId, twitchId, 'paiduser', 'Paid User');
        
        const groupName = 'My Premium Group';
        const members = ['only_one_streamer'];
        
        const groupId = await groupService.createGroup(userId, groupName, members);
        const group = await groupService.getGroup(groupId);
        
        expect(group).not.toBeNull();
        expect(group?.members).not.toContain('somewatson');
        expect(group?.members).toEqual(['only_one_streamer']);
    });

    test('Analytics - Tracking impressions and clicks', async () => {
        const db = dbManager.getDb();
        const userId = uuidv4();
        const twitchId = `analytics_twitch_${uuidv4()}`;
        db.prepare('INSERT INTO users (id, twitch_id, username, display_name, is_paid) VALUES (?, ?, ?, ?, 0)').run(userId, twitchId, 'analytics_user', 'Analytics User');
        
        const groupId = uuidv4();
        db.prepare('INSERT INTO groups (id, owner_id, name) VALUES (?, ?, ?)').run(groupId, userId, 'Analytics Group');

        const { analyticsService } = require('../src/analyticsService');
        const mockReq = { headers: { 'user-agent': 'Jest' }, ip: '127.0.0.1' };
        
        await analyticsService.trackEvent(groupId, 'impression', mockReq);
        await analyticsService.trackEvent(groupId, 'click', mockReq, 'streamer1');
        
        const stats = await analyticsService.getGroupStats(groupId);
        expect(stats.impressions).toBe(1);
        expect(stats.clicks).toBe(1);
        expect(stats.ctr).toBe(100);
    });
});
