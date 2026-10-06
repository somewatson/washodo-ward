import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { TwitchClient } from './twitchClient';
import { dbManager } from './db';
import { twitchAuth } from './auth';
import { groupService } from './groupService';
import { statusService } from './statusService';
import { analyticsService } from './analyticsService';
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

    private setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(sessionConfig);
    }

    private setupRoutes() {
        // --- ADMIN ROUTES ---
        this.app.patch('/api/admin/keys', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const db = dbManager.getDb();
            const user = db.prepare('SELECT id FROM users WHERE id = ?').get(sessionUser) as any;
            
            // Simple admin check: the first user in the DB is the admin
            const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get() as any;
            if (!firstUser || firstUser.id !== sessionUser) return res.status(403).send('Forbidden');

            const { clientId, clientSecret } = req.body;
            try {
                db.prepare('UPDATE users SET client_id = ?, client_secret = ? WHERE id = ?').run(clientId, clientSecret, sessionUser);
                res.json({ success: true });
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        // --- AUTH ROUTES ---
        this.app.get('/auth/login', (req, res) => {
            res.redirect(twitchAuth.getAuthUrl());
        });

        this.app.get('/auth/callback', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const { code } = req.query;
            if (!code) return res.status(400).send('Missing code');

            try {
                const { accessToken, refreshToken } = await twitchAuth.getAccessToken(code as string);
                const user = await twitchAuth.getUserInfo(accessToken);
                const email = await twitchAuth.getUserEmail(accessToken);

                const db = dbManager.getDb();
                const upsertUser = db.prepare(`
                    INSERT INTO users (id, twitch_id, username, display_name, email)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(twitch_id) DO UPDATE SET
                        display_name = excluded.display_name,
                        email = excluded.email
                `);
                
                const userId = uuidv4();
                upsertUser.run(userId, user.id, user.login, user.display_name, email);

                // Set session
                authenticatedReq.session.userId = userId;
                authenticatedReq.session.username = user.display_name;

                res.redirect('/dashboard');
            } catch (e: any) {
                console.error('Auth error:', e);
                res.status(500).send('Authentication failed');
            }
        });

        this.app.get('/auth/logout', (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            authenticatedReq.session.destroy(() => {
                res.redirect('/');
            });
        });

        // --- GROUP ROUTES ---
        this.app.post('/api/groups', async (req: Request, res: Response) => {
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

        this.app.patch('/api/groups/:id', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { id } = req.params;
            const { statusMessage } = req.body;

            const db = dbManager.getDb();
            const group = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(id) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                db.prepare('UPDATE groups SET status_message = ? WHERE id = ?').run(statusMessage, id);
                res.json({ success: true });
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        this.app.get('/api/groups/:id', async (req, res) => {
            const group = await groupService.getGroup(req.params.id);
            if (!group) return res.status(404).send('Group not found');
            res.json(group);
        });

        this.app.get('/api/groups/all', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const db = dbManager.getDb();
            const groups = db.prepare('SELECT * FROM groups WHERE owner_id = ?').all(sessionUser) as any[];
            
            const detailedGroups = await Promise.all(groups.map(async g => {
                const members = await groupService.getMembers(g.id);
                const stats = await analyticsService.getGroupStats(g.id);
                return { ...g, members, stats };
            }));

            res.json(detailedGroups);
        });

        // --- STATUS & WIDGET ROUTES ---
        this.app.get('/api/status/:groupId', async (req, res) => {
            const statuses = await statusService.getStatusForGroup(req.params.groupId);
            res.json(statuses);
        });

        this.app.get('/widget/:groupId', async (req, res) => {
            const groupId = req.params.groupId;
            
            // Fetch group status message
            const db = dbManager.getDb();
            const group = db.prepare('SELECT status_message FROM groups WHERE id = ?').get(groupId) as any;
            const statusMessage = group?.status_message || '';

            const statuses = await statusService.getStatusForGroup(groupId);
            
            try {
                await analyticsService.trackEvent(groupId, 'impression', req);
            } catch (e) {
                console.error('Analytics error:', e);
            }
            
            const renderItems = statuses.map(s => `
                <a href="https://twitch.tv/${s.streamer_login}" target="_blank" class="widget-item ${s.is_live ? 'live' : 'offline'}" 
                   onclick="fetch('/api/analytics/click?groupId=${groupId}&streamer=${s.streamer_login}')">
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

        this.app.get('/api/analytics/click', async (req, res) => {
            const { groupId, streamer } = req.query;
            if (!groupId || !streamer) return res.status(400).send('Missing params');
            
            try {
                await analyticsService.trackEvent(groupId as string, 'click', req, streamer as string);
                res.sendStatus(200);
            } catch (e) {
                res.status(500).send('Error');
            }
        });

        // --- Root Page (Existing SSR) ---
        this.app.get('/', async (req, res) => {
            res.redirect('/dashboard');
        });

        this.app.get('/dashboard', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) {
                return res.redirect('/auth/login');
            }
            res.sendFile(path.join(process.cwd(), 'public/dashboard.html'));
        });

        this.app.get('/api/me', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const db = dbManager.getDb();
            const firstUser = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get() as any;
            
            res.json({
                userId: sessionUser,
                isAdmin: firstUser?.id === sessionUser
            });
        });

        // --- NOTIFICATION ROUTES ---
        this.app.get('/api/notifications/:groupId', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { groupId } = req.params;
            // Security check: ensure user owns the group
            const db = dbManager.getDb();
            const group = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(groupId) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                const webhooks = await notificationService.getWebhooksForGroup(groupId);
                res.json(webhooks);
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        this.app.post('/api/notifications', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { groupId, url, template, provider } = req.body;
            if (!groupId || !url || !template || !provider) return res.status(400).send('Missing parameters');

            const db = dbManager.getDb();
            const group = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(groupId) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                const webhookId = await notificationService.createWebhook(groupId, url, template, provider);
                res.json({ webhookId });
            } catch (e: any) {
                res.status(500).json({ error: e.message });
            }
        });

        this.app.delete('/api/notifications/:webhookId', async (req: Request, res: Response) => {
            const authenticatedReq = req as AuthenticatedRequest;
            const sessionUser = authenticatedReq.session.userId;
            if (!sessionUser) return res.status(401).send('Unauthorized');

            const { webhookId } = req.params;
            const db = dbManager.getDb();
            const webhook = db.prepare('SELECT group_id FROM webhook_destinations WHERE id = ?').get(webhookId) as any;
            if (!webhook) return res.status(404).send('Webhook not found');

            const group = db.prepare('SELECT owner_id FROM groups WHERE id = ?').get(webhook.group_id) as any;
            if (!group || group.owner_id !== sessionUser) return res.status(403).send('Forbidden');

            try {
                await notificationService.deleteWebhook(webhookId);
                res.sendStatus(200);
            } catch (e: any) {
                res.status(500).send('Error deleting webhook');
            }
        });
    }

    async start() {
        this.server = this.app.listen(this.port, () => {
            console.log(`API Server running on port ${this.port}`);
        });
    }

    stop() {
        if (this.server) this.server.close();
    }
}
