import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { TwitchClient } from './twitchClient';
import { dbManager } from './db';
import { twitchAuth } from './auth';
import { groupService } from './groupService';
import { statusService } from './statusService';
import { analyticsService } from './analyticsService';
import { notificationService } from './notificationService';
import { sessionConfig } from './session';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// We'll use a type cast in the routes for simplicity and compatibility with express types
type AuthenticatedRequest = Request & { session: any };

export class ApiServer {
    private app = express();
    private port = process.env.PORT || 3001;
    private twitch = new TwitchClient();
    private server: any;

    constructor() {
        this.setupMiddleware();
        this.setupRoutes();
    }

    private async setupDatabase() {
        const db = await dbManager.getDb();
        try {
            await db.exec('ALTER TABLE groups ADD COLUMN last_refresh_at DATETIME');
        } catch (e) {
            // Column might already exist
        }
    }

    private setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(sessionConfig);
    }

    private setupRoutes() {
        const router = express.Router();

        // --- ADMIN ROUTES ---
        router.patch('/api/admin/keys', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const db = await dbManager.getDb();
            const user = await db.get('SELECT id FROM users WHERE id = ?', sessionUser) as any;
            
            // Simple admin check: the first user in the DB is the admin
            const firstUser = await db.get('SELECT id FROM users ORDER BY created_at ASC LIMIT 1') as any;
            if (!firstUser || firstUser.id !== sessionUser) return res.status(403).send('Forbidden');

            const { clientId, clientSecret } = req.body;
            try {
                await db.run('UPDATE users SET client_id = ?, client_secret = ? WHERE id = ?', clientId, clientSecret, sessionUser);
                res.json({ success: true });
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        // --- AUTH ROUTES ---
        router.get('/auth/login', (req, res) => {
            res.redirect(twitchAuth.getAuthUrl());
        });

        router.get('/auth/callback', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const { code } = req.query;
            if (!code) return res.status(400).send('Missing code');

            try {
                const { accessToken, refreshToken } = await twitchAuth.getAccessToken(code as string);
                const user = await twitchAuth.getUserInfo(accessToken);
                const email = await twitchAuth.getUserEmail(accessToken);

                const db = await dbManager.getDb();
                const userId = uuidv4();
                await db.run(`
                    INSERT INTO users (id, twitch_id, username, display_name, email)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(twitch_id) DO UPDATE SET
                        display_name = excluded.display_name,
                        email = excluded.email
                `, userId, user.id, user.login, user.display_name, email);

                // Set session
                authenticatedReq.session.userId = userId;
                authenticatedReq.session.username = user.display_name;

                res.redirect('/dashboard');
            } catch (e: any) {
                console.error('Auth error:', e);
                res.status(500).send('Authentication failed');
            }
        });

        router.get('/auth/logout', (req, res) => {
            const authenticatedReq = req as AuthenticatedRequest;
            authenticatedReq.session.destroy(() => {
                res.redirect('/');
            });
        });

        // --- GROUP ROUTES ---
        router.post('/api/groups', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { name, streamers } = req.body;
            if (!name || !streamers) return res.status(400).send('Missing parameters');

            try {
                const groupId = await groupService.createGroup(sessionUser, name, streamers);
                res.json({ groupId });
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        router.patch('/api/groups/:id', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { id } = req.params;
            const { statusMessage } = req.body;

            const db = await dbManager.getDb();
            const group = await db.get('SELECT owner_id FROM groups WHERE id = ?', id) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                await db.run('UPDATE groups SET status_message = ? WHERE id = ?', statusMessage, id);
                res.json({ success: true });
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        router.get('/api/groups/:id', async (req, res) => {
            const group = await groupService.getGroup(req.params.id);
            if (!group) return res.status(404).send('Group not found');
            res.json(group);
        });

        router.get('/api/groups/all', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const db = await dbManager.getDb();
            const groups = await db.all('SELECT * FROM groups WHERE owner_id = ?', sessionUser) as any[];
            
            const detailedGroups = await Promise.all(groups.map(async g => {
                const members = await groupService.getMembers(g.id);
                const stats = await analyticsService.getGroupStats(g.id);
                return { ...g, members, stats };
            }));

            res.json(detailedGroups);
        });

        // --- STATUS & WIDGET ROUTES ---
        router.get('/api/status/all', async (req, res) => {
            const db = await dbManager.getDb();
            const allCached = await db.all('SELECT * FROM streamer_cache') as any[];
            
            const statusMap: Record<string, any> = {};
            allCached.forEach(s => {
                statusMap[s.streamer_login] = {
                    isLive: s.is_live === 1,
                };
            });
            
            res.json(statusMap);
        });

        router.get('/api/status/:groupId', async (req, res) => {
            const id = req.params.groupId;

            // Try to see if it's a groupId or a streamer login
            const db = await dbManager.getDb();
            const group = await db.get('SELECT id FROM groups WHERE id = ?', id);
            
            if (group) {
                const statuses = await statusService.getStatusForGroup(id);
                res.json(statuses);
            } else {
                // It might be a streamer login, let's return their status if found in cache
                const cached = await db.get('SELECT * FROM streamer_cache WHERE streamer_login = ?', id) as any;
                if (cached) {
                    res.json([cached]);
                } else {
                    res.json([]);
                }
            }
        });

        router.post('/api/status/:groupId/refresh', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            const groupId = req.params.groupId as string;
            const apiKey = req.headers['x-api-key'] as string;

            const db = await dbManager.getDb();
            const group = await db.get('SELECT owner_id, last_refresh_at FROM groups WHERE id = ?', groupId) as any;

            if (!group) return res.status(404).send('Group not found');

            // Authorization check: Group owner OR valid API key
            const isAdmin = process.env.API_KEY && apiKey === process.env.API_KEY;
            const isOwner = group.owner_id === sessionUser;

            if (!isOwner && !isAdmin) {
                return res.status(403).send('Unauthorized to refresh this group');
            }

            // Throttling check (1 minute)
            if (group.last_refresh_at) {
                const lastRefresh = new Date(group.last_refresh_at).getTime();
                const now = Date.now();
                const diffSeconds = Math.floor((now - lastRefresh) / 1000);

                if (diffSeconds < 60) {
                    return res.status(429).json({
                        error: 'Throttled',
                        message: `Please wait ${60 - diffSeconds} more seconds.`,
                        retry_after: 60 - diffSeconds
                    });
                }
            }

            try {
                await statusService.updateStatusesForGroup(groupId);
                await db.run('UPDATE groups SET last_refresh_at = ? WHERE id = ?', new Date().toISOString(), groupId);
                
                const updatedStatuses = await statusService.getStatusForGroup(groupId);
                res.json({ success: true, statuses: updatedStatuses });
            } catch (e: any) {
                console.error('Refresh error:', e);
                res.status(500).send('Failed to refresh status');
            }
        });

        router.get('/widget/:groupId', async (req, res) => {
            const groupId = req.params.groupId;
            
            // Fetch group status message
            const db = await dbManager.getDb();
            const group = await db.get('SELECT status_message FROM groups WHERE id = ?', groupId) as any;
            const statusMessage = group?.status_message || '';

            const statuses = await statusService.getStatusForGroup(groupId);
            
            try {
                await analyticsService.trackEvent(groupId, 'impression', req);
            } catch (e) {
                console.error('Analytics error:', e);
            }
            
            const renderItems = statuses.map(s => `
                <a href="https://twitch.tv/${s.streamer_login}" target="_blank" class="widget-item ${s.is_live ? 'live' : 'offline'}" 
                   onclick="fetch('api/analytics/click?groupId=${groupId}&streamer=${s.streamer_login}')">
                    <img src="${s.profile_image_url || 'https://via.placeholder.com/32'}" class="avatar">
                    <span class="name">${s.display_name}</span>
                    <span class="status">${s.is_live ? 'LIVE' : 'Offline'}</span>
                </a>
            `).join('');

            const html = `
                <html>
                <head>
                    <style>
                        body { font-family: 'Inter', sans-serif; background: transparent; color: white; margin: 0; padding: 0; }
                        .widget-container { display: flex; flex-direction: column; gap: 5px; }
                        .status-msg { 
                            text-align: center; 
                            font-size: 12px; 
                            font-weight: 600; 
                            margin-bottom: 8px; 
                            color: #a970ff;
                            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
                        }
                        .widget-item { 
                            display: flex; align-items: center; gap: 10px; 
                            background: rgba(0,0,0,0.6); padding: 5px 10px; 
                            border-radius: 5px; width: fit-content; 
                            text-decoration: none; color: white;
                        }
                        .avatar { width: 24px; height: 24px; border-radius: 50%; }
                        .name { font-weight: 600; font-size: 14px; }
                        .status { font-size: 10px; font-weight: bold; text-transform: uppercase; }
                        .live .status { color: #ff4b4b; }
                        .offline .status { color: #888; }
                    </style>
                </head>
                <body>
                    <div class="widget-container">
                        ${statusMessage ? `<div class="status-msg">${statusMessage}</div>` : ''}
                        ${renderItems}
                    </div>
                </body>
                </html>
            `;
            res.send(html);
        });

        router.get('/api/analytics/click', async (req, res) => {
            const { groupId, streamer } = req.query;
            if (!groupId || !streamer) return res.status(400).send('Missing params');
            
            try {
                await analyticsService.trackEvent(groupId as string, 'click', req, streamer as string);
                res.sendStatus(200);
            } catch (e) {
                res.status(500).send('Error');
            }
        });

        // --- Public Routes ---
        router.get('/', async (req, res) => {
            res.sendFile(path.join(process.cwd(), 'public/index.html'));
        });

        router.get('/status', async (req, res) => {
            res.sendFile(path.join(process.cwd(), 'public/status.html'));
        });

        router.get('/api/public/status', async (req, res) => {
            try {
                const db = await dbManager.getDb();
                const communityGroup = await db.get('SELECT id FROM groups ORDER BY created_at ASC LIMIT 1') as any;
                
                if (!communityGroup) {
                    return res.json([]);
                }

                const statuses = await statusService.getStatusForGroup(communityGroup.id);
                res.json(statuses);
            } catch (e: any) {
                console.error('Public status error:', e);
                res.status(500).send('Internal Server Error');
            }
        });

        // --- Root Page (Existing SSR) ---
        router.get('/dashboard', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) {
                return res.redirect('/auth/login');
            }
            res.sendFile(path.join(process.cwd(), 'public/dashboard.html'));
        });

        router.get('/api/me', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const db = await dbManager.getDb();
            const firstUser = await db.get('SELECT id FROM users ORDER BY created_at ASC LIMIT 1') as any;
            
            res.json({
                userId: sessionUser,
                isAdmin: firstUser?.id === sessionUser
            });
        });

        // --- NOTIFICATION ROUTES ---
        router.get('/api/notifications/:groupId', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const groupId = req.params.groupId as string;
            const db = await dbManager.getDb();
            const group = await db.get('SELECT owner_id FROM groups WHERE id = ?', groupId) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                const webhooks = await notificationService.getWebhooksForGroup(groupId as string);
                res.json(webhooks);
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        router.post('/api/notifications', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { groupId, url, template, provider } = req.body;
            if (!groupId || !url || !template || !provider) return res.status(400).send('Missing parameters');

            const db = await dbManager.getDb();
            const group = await db.get('SELECT owner_id FROM groups WHERE id = ?', groupId) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                const webhookId = await notificationService.createWebhook(groupId, url, template, provider);
                res.json({ webhookId });
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        router.delete('/api/notifications/:webhookId', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { webhookId } = req.params;
            const db = await dbManager.getDb();
            const webhook = await db.get('SELECT group_id FROM webhook_destinations WHERE id = ?', webhookId) as any;
            if (!webhook) return res.status(404).send('Webhook not found');

            const group = await db.get('SELECT owner_id FROM groups WHERE id = ?', webhook.group_id) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                await notificationService.deleteWebhook(webhookId as string);
                res.sendStatus(200);
            } catch (e: any) {
                res.status(500).send('Error deleting webhook');
            }
        });

        this.app.use('/', router);
    }

    async start() {
        await this.setupDatabase();
        this.server = this.app.listen(this.port, () => {
            console.log(`API Server running on port ${this.port}`);
        });
    }

    stop() {
        if (this.server) this.server.close();
    }
}
