import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Missing code or userId');

    try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/github/callback`
            })
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            console.error('GitHub Token Error:', tokenData)
            return res.status(400).send(`GitHub OAuth Error: ${tokenData.error_description || tokenData.error}`);
        }

        const { access_token } = tokenData;

        await supabase.from('connected_services').upsert({
            user_id: userId,
            service_name: 'github',
            access_token,
            is_connected: true,
            connected_at: new Date().toISOString()
        }, { onConflict: 'user_id,service_name' });

        res.redirect('/connect?connected=github');
    } catch (err) {
        console.error(err)
        res.status(500).send('Internal Server Error')
    }
}
