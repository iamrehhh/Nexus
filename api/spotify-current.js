// api/spotify-current.js
import { getSpotifyClient } from './spotify-helper.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId } = req.query;
        if (!userId) return res.status(401).json({ error: 'Missing userId' });

        const spotifyApi = await getSpotifyClient(userId);
        if (!spotifyApi) return res.status(401).json({ error: 'Spotify not connected' });

        const playbackState = await spotifyApi.getMyCurrentPlaybackState();

        if (playbackState.statusCode === 204 || !playbackState.body) {
            return res.status(200).json({ playback: null }); // Nothing active
        }

        res.status(200).json({ playback: playbackState.body });
    } catch (error) {
        console.error('Spotify Current Error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch playback' });
    }
}
