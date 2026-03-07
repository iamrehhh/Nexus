import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Missing code or userId');

    try {
        const authHeader = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${authHeader}`
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/spotify/callback`
            })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            console.error('Spotify Token Error:', tokenData)
            return res.status(400).send(`Spotify OAuth Error: ${tokenData.error_description || tokenData.error}`);
        }

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

        res.redirect('/connect?connected=spotify');
    } catch (err) {
        console.error(err)
        res.status(500).send('Internal Server Error')
    }
}
