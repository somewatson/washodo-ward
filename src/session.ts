import session from 'express-session';
import { dbManager } from './db';

// To avoid the connect-sqlite3 prototype error in Jest/TS and development, 
// we'll use a simple MemoryStore for tests and development if needed, 
// or we'll use a safer way to initialize the SQLiteStore.

const isTest = process.env.NODE_ENV === 'test';

export const sessionConfig = session({
    store: isTest ? undefined : (function() {
        try {
            const session = require('express-session');
            const SQLiteStoreFactory = require('connect-sqlite3');
            const SQLiteStore = SQLiteStoreFactory(session);
            return new SQLiteStore({ db: 'sessions.sqlite' });
        } catch (e) {
            console.error('Failed to initialize SQLiteStore, falling back to MemoryStore:', e);
            return undefined;
        }
    })(),
    secret: process.env.SESSION_SECRET || 'washodo-secret-key-12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
});
