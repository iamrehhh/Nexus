import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export async function getSpotifyToken(userId) {
    const { data: service } = await supabase
        .from('connected_services')
        .select('access_token, refresh_token, token_expires_at, is_connected')
        .eq('user_id', userId)
        .eq('service_name', 'spotify')
        .single()

    if (!service || !service.is_connected || !service.access_token) return null;

    let { access_token, refresh_token, token_expires_at } = service;

    if (token_expires_at && new Date(token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
        const authHeader = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
        const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${authHeader}` },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token })
        });
        if (refreshRes.ok) {
            const refreshed = await refreshRes.json();
            access_token = refreshed.access_token;
            if (refreshed.refresh_token) refresh_token = refreshed.refresh_token;
            const newExpires = new Date();
            newExpires.setSeconds(newExpires.getSeconds() + refreshed.expires_in);
            await supabase.from('connected_services').update({ access_token, refresh_token, token_expires_at: newExpires.toISOString() })
                .eq('user_id', userId).eq('service_name', 'spotify');
        } else {
            return null;
        }
    }
    return access_token;
}

export async function getSpotifyClient(userId) {
    const token = await getSpotifyToken(userId);
    if (!token) return null;

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    return {
        getMyCurrentPlaybackState: async () => {
            const res = await fetch('https://api.spotify.com/v1/me/player', { headers });
            if (res.status === 204) return { statusCode: 204, body: null };
            if (!res.ok) throw new Error('Spotify API Error - Get Playback');
            return { statusCode: 200, body: await res.json() };
        },
        play: async () => {
            const res = await fetch('https://api.spotify.com/v1/me/player/play', { method: 'PUT', headers });
            if (!res.ok && res.status !== 204) throw new Error('Failed to play. Ensure you have an active device.');
        },
        pause: async () => {
            const res = await fetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT', headers });
            if (!res.ok && res.status !== 204) throw new Error('Failed to pause');
        },
        skipToNext: async () => {
            const res = await fetch('https://api.spotify.com/v1/me/player/next', { method: 'POST', headers });
            if (!res.ok && res.status !== 204) throw new Error('Failed to skip');
        },
        skipToPrevious: async () => {
            const res = await fetch('https://api.spotify.com/v1/me/player/previous', { method: 'POST', headers });
            if (!res.ok && res.status !== 204) throw new Error('Failed to go previous');
        }
    };
}
