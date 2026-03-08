import { getSpotifyClient } from './spotify-helper.js';

export default async function handler(req, res) {
    // Determine user ID from query (GET) or body (POST)
    const userId = req.method === 'GET' ? req.query.userId : req.body?.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Missing userId' });
    }

    try {
        const spotifyApi = await getSpotifyClient(userId);
        if (!spotifyApi) return res.status(401).json({ error: 'Spotify not connected' });

        // HTTP GET: Fetch current playback
        if (req.method === 'GET') {
            const playbackState = await spotifyApi.getMyCurrentPlaybackState();

            if (playbackState.statusCode === 204 || !playbackState.body) {
                return res.status(200).json({ playback: null }); // Nothing active
            }

            return res.status(200).json({ playback: playbackState.body });
        }

        // HTTP POST: Control playback
        if (req.method === 'POST') {
            const { action } = req.body;
            if (!action) {
                return res.status(400).json({ error: 'Missing action' });
            }

            switch (action) {
                case 'play':
                    await spotifyApi.play();
                    break;
                case 'pause':
                    await spotifyApi.pause();
                    break;
                case 'next':
                    await spotifyApi.skipToNext();
                    break;
                case 'previous':
                    await spotifyApi.skipToPrevious();
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid action' });
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Spotify API Error:', error);

        let errorMessage = 'Spotify action failed';
        if (error.body && error.body.error && error.body.error.message) {
            errorMessage = error.body.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        if (errorMessage.toLowerCase().includes('no active device')) {
            errorMessage = 'No active Spotify device. Please start playing on a device first.';
        }

        return res.status(500).json({ error: errorMessage });
    }
}
