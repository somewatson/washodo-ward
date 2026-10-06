import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class TwitchClient {
    private globalClientId = process.env.TWITCH_CLIENT_ID;
    private globalClientSecret = process.env.TWITCH_CLIENT_SECRET;
    private accessToken: string | null = null;

    async getAccessToken(clientId?: string, clientSecret?: string): Promise<string> {
        const id = clientId || this.globalClientId;
        const secret = clientSecret || this.globalClientSecret;

        if (!id || !secret) {
            console.warn('⚠️ Twitch credentials missing. API will be in limited mode.');
            return 'dummy-token';
        }

        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
                params: {
                    client_id: id,
                    client_secret: secret,
                    grant_type: 'client_credentials',
                },
            });
            const token = response.data.access_token;
            if (!token) throw new Error('Twitch API did not return an access token');
            return token;
        } catch (error: any) {
            console.error('Error fetching Twitch access token:', error.response?.data || error.message);
            return 'dummy-token';
        }
    }

    async getLiveStreamers(usernames: string[], clientId?: string, clientSecret?: string): Promise<any[]> {
        const id = clientId || this.globalClientId;
        const token = await this.getAccessToken(clientId, clientSecret);
        try {
            const response = await axios.get('https://api.twitch.tv/helix/streams', {
                params: {
                    user_login: usernames,
                },
                headers: {
                    'Client-ID': id || 'dummy-id',
                    'Authorization': `Bearer ${token}`,
                },
            });
            
            const streams = response.data.data;
            if (!streams || streams.length === 0) return [];

            const userIds = streams.map((s: any) => s.user_id);
            const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
                params: {
                    id: userIds,
                },
                headers: {
                    'Client-ID': id || 'dummy-id',
                    'Authorization': `Bearer ${token}`,
                },
            });

            const users = userResponse.data.data;
            const userMap: Record<string, any> = {};
            users.forEach((u: any) => {
                userMap[u.id] = u;
            });

            return streams.map((s: any) => ({
                ...s,
                profile_image_url: userMap[s.user_id]?.profile_image_url || '',
                displayName: userMap[s.user_id]?.display_name || s.user_login
            }));
        } catch (error: any) {
            console.error('Error fetching live streams:', error.response?.data || error.message);
            return [];
        }
    }
}
