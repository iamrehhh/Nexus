export default function handler(req, res) {
    const userId = req.query.userId || req.body?.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/github/callback`,
        scope: 'read:user repo',
        state: userId
    })
    res.redirect(`https://github.com/login/oauth/authorize?${params}`)
}
