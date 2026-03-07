import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    const { code, state: userId } = req.query;
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
        if (tokenData.error) {
            console.error('Google Token Error:', tokenData)
            return res.status(400).send(`Google OAuth Error: ${tokenData.error_description || tokenData.error}`);
        }

        const { access_token, refresh_token, expires_in } = tokenData;
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

        // Store for both gmail and google-calendar
        await supabase.from('connected_services').upsert([
            {
                user_id: userId,
                service_name: 'gmail',
                access_token,
                refresh_token: refresh_token || null,
                token_expires_at: expiresAt.toISOString(),
                is_connected: true,
                connected_at: new Date().toISOString()
            },
            {
                user_id: userId,
                service_name: 'google-calendar',
                access_token,
                refresh_token: refresh_token || null,
                token_expires_at: expiresAt.toISOString(),
                is_connected: true,
                connected_at: new Date().toISOString()
            }
        ], { onConflict: 'user_id,service_name' });

        res.redirect('/connect?connected=google');
    } catch (err) {
        console.error(err)
        res.status(500).send('Internal Server Error')
    }
}
