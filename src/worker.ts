import { statusService } from './statusService';
import { dbManager } from './db';

export class Worker {
    private intervalMs = 5 * 60 * 1000; // 5 minutes

    async start() {
        console.log('[Worker] Starting background status worker...');
        
        // Initial run
        await this.tick();

        // Schedule periodic updates
        setInterval(() => this.tick(), this.intervalMs);
    }

    private async tick() {
        try {
            await statusService.updateAllStatuses();
            console.log(`[Worker] Tick complete at ${new Date().toISOString()}`);
        } catch (error) {
            console.error('[Worker] Error during status update tick:', error);
        }
    }
}

export const worker = new Worker();
