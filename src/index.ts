import { ApiServer } from './server';
import { worker } from './worker';

async function main() {
    console.log('[Main] Starting friends.washodo.tv...');
    
    // Initialize database schema first
    const { dbManager } = require('./db');
    await dbManager.initialize();

    const server = new ApiServer();
    await server.start();

    await worker.start();

    process.on('SIGINT', async () => {
        console.log('[Main] Shutting down...');
        server.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('[Main] Shutting down...');
        server.stop();
        process.exit(0);
    });
}

main().catch(err => {
    console.error('[Main] Fatal error during startup:', err);
    process.exit(1);
});
