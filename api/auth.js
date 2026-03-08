import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
    // URL will look like: /api/auth/github/connect?userId=123
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname; // e.g., /api/auth/github/connect

    const parts = pathname.split('/');
    const action = parts.pop();   // 'connect', 'callback', or 'disconnect'
    const service = parts.pop();  // 'github', 'google', or 'spotify'

    if (!service || !action) {
        return res.status(400).send('Invalid auth route');
    }

    const userId = req.query?.userId || req.body?.userId || urlObj.searchParams.get('userId') || req.query?.state || urlObj.searchParams.get('state');

    // ───────────────────────────────────────────
    //                GITHUB
    // ───────────────────────────────────────────
    if (service === 'github') {
        if (action === 'connect') {
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            const params = new URLSearchParams({
                client_id: process.env.GITHUB_CLIENT_ID,
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/github/callback`,
                scope: 'read:user repo',
                state: userId
            })
            return res.redirect(`https://github.com/login/oauth/authorize?${params}`)
        }

        if (action === 'callback') {
            const code = req.query?.code || urlObj.searchParams.get('code');
            if (!code || !userId) return res.status(400).send('Missing code or userId');

            try {
                const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                        client_id: process.env.GITHUB_CLIENT_ID,
                        client_secret: process.env.GITHUB_CLIENT_SECRET,
                        code,
                        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/github/callback`
                    })
                });
                const tokenData = await tokenRes.json();
                if (tokenData.error) return res.status(400).send(`GitHub OAuth Error: ${tokenData.error_description || tokenData.error}`);

                await supabase.from('connected_services').upsert({
                    user_id: userId,
                    service_name: 'github',
                    access_token: tokenData.access_token,
                    is_connected: true,
                    connected_at: new Date().toISOString()
                }, { onConflict: 'user_id,service_name' });

                return res.redirect('/connect?connected=github');
            } catch (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }
        }

        if (action === 'disconnect') {
            if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            await supabase.from('connected_services').delete().eq('user_id', userId).eq('service_name', 'github');
            await supabase.from('service_cache').delete().eq('user_id', userId).eq('service_name', 'github');
            return res.json({ success: true });
        }
    }

    // ───────────────────────────────────────────
    //                GOOGLE
    // ───────────────────────────────────────────
    if (service === 'google') {
        if (action === 'connect') {
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            const params = new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/google/callback`,
                response_type: 'code',
                scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly profile email',
                access_type: 'offline',
                prompt: 'consent',
                state: userId
            })
            return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
        }

        if (action === 'callback') {
            const code = req.query?.code || urlObj.searchParams.get('code');
            if (!code || !userId) return res.status(400).send('Missing code or userId');

            try {
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: process.env.GOOGLE_CLIENT_ID,
                        client_secret: process.env.GOOGLE_CLIENT_SECRET,
                        code,
                        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/google/callback`,
                        grant_type: 'authorization_code'
                    })
                });
                const tokenData = await tokenRes.json();
                if (tokenData.error) return res.status(400).send(`Google OAuth Error: ${tokenData.error_description || tokenData.error}`);

                const { access_token, refresh_token, expires_in } = tokenData;
                const expiresAt = new Date();
                expiresAt.setSeconds(expiresAt.getSeconds() + (expires_in || 3599));

                await supabase.from('connected_services').upsert([
                    { user_id: userId, service_name: 'gmail', access_token, refresh_token: refresh_token || null, token_expires_at: expiresAt.toISOString(), is_connected: true, connected_at: new Date().toISOString() },
                    { user_id: userId, service_name: 'google-calendar', access_token, refresh_token: refresh_token || null, token_expires_at: expiresAt.toISOString(), is_connected: true, connected_at: new Date().toISOString() }
                ], { onConflict: 'user_id,service_name' });

                return res.redirect('/connect?connected=google');
            } catch (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }
        }

        if (action === 'disconnect') {
            if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            await supabase.from('connected_services').delete().eq('user_id', userId).in('service_name', ['gmail', 'google-calendar']);
            await supabase.from('service_cache').delete().eq('user_id', userId).in('service_name', ['gmail', 'google-calendar']);
            return res.json({ success: true });
        }
    }

    // ───────────────────────────────────────────
    //                SPOTIFY
    // ───────────────────────────────────────────
    if (service === 'spotify') {
        if (action === 'connect') {
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            const params = new URLSearchParams({
                client_id: process.env.SPOTIFY_CLIENT_ID,
                response_type: 'code',
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/spotify/callback`,
                scope: 'user-read-currently-playing user-read-recently-played user-top-read user-read-playback-state user-modify-playback-state',
                state: userId
            })
            return res.redirect(`https://accounts.spotify.com/authorize?${params}`)
        }

        if (action === 'callback') {
            const code = req.query?.code || urlObj.searchParams.get('code');
            if (!code || !userId) return res.status(400).send('Missing code or userId');

            try {
                const authHeader = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
                const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${authHeader}` },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/spotify/callback`
                    })
                });
                const tokenData = await tokenRes.json();
                if (tokenData.error) return res.status(400).send(`Spotify OAuth Error: ${tokenData.error_description || tokenData.error}`);

                const { access_token, refresh_token, expires_in } = tokenData;
                const expiresAt = new Date();
                expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

                await supabase.from('connected_services').upsert({
                    user_id: userId,
                    service_name: 'spotify',
                    access_token,
                    refresh_token,
                    token_expires_at: expiresAt.toISOString(),
                    is_connected: true,
                    connected_at: new Date().toISOString()
                }, { onConflict: 'user_id,service_name' });

                return res.redirect('/connect?connected=spotify');
            } catch (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }
        }

        if (action === 'disconnect') {
            if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
            if (!userId) return res.status(400).json({ error: 'Missing userId' });
            await supabase.from('connected_services').delete().eq('user_id', userId).eq('service_name', 'spotify');
            await supabase.from('service_cache').delete().eq('user_id', userId).eq('service_name', 'spotify');
            return res.json({ success: true });
        }
    }

    return res.status(404).send('Service or action not found');
}
