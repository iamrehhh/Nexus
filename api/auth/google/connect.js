export default function handler(req, res) {
    const userId = req.query.userId || req.body?.userId;
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
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
