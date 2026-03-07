export default function handler(req, res) {
    const userId = req.query.userId || req.body?.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const params = new URLSearchParams({
        client_id: process.env.SPOTIFY_CLIENT_ID,
        response_type: 'code',
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL}/api/auth/spotify/callback`,
        scope: 'user-read-currently-playing user-read-recently-played user-top-read user-read-playback-state',
        state: userId
    })
    res.redirect(`https://accounts.spotify.com/authorize?${params}`)
}
