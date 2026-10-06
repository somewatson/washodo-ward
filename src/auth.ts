import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class TwitchAuth {
    private globalClientId = process.env.TWITCH_CLIENT_ID;
    private globalClientSecret = process.env.TWITCH_CLIENT_SECRET;
    private redirectUri = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3001/auth/callback';

    getAuthUrl(clientId?: string): string {
        const id = clientId || this.globalClientId;
        const scope = 'user:read:email';
        return `https://id.twitch.tv/oauth2/authorize?client_id=${id}&redirect_uri=${this.redirectUri}&response_type=code&scope=${scope}`;
    }

    async getAccessToken(code: string, clientId?: string, clientSecret?: string): Promise<{ accessToken: string, refreshToken: string }> {
        const id = clientId || this.globalClientId;
        const secret = clientSecret || this.globalClientSecret;
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: id,
                client_secret: secret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri,
            },
        });
        return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
        };
    }

    async getUserInfo(accessToken: string, clientId?: string): Promise<any> {
        const id = clientId || this.globalClientId;
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': id,
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        return response.data.data[0];
    }

    async getUserEmail(accessToken: string, clientId?: string): Promise<string> {
        const id = clientId || this.globalClientId;
        const response = await axios.get('https://api.twitch.tv/helix/users/email', {
            headers: {
                'Client-ID': id,
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        return response.data.data[0]?.email || '';
    }
}

export const twitchAuth = new TwitchAuth();
