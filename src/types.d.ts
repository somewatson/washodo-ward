import 'express-session';

declare global {
    namespace Express {
        interface Request {
            session: SessionData & {
                userId?: string;
                username?: string;
            };
        }
    }
}