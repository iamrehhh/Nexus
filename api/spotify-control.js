// api/spotify-control.js
import { getSpotifyClient } from './spotify-helper.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId, action } = req.body;
        if (!userId || !action) {
            return res.status(400).json({ error: 'Missing userId or action' });
        }

        const spotifyApi = await getSpotifyClient(userId);
        if (!spotifyApi) {
            return res.status(401).json({ error: 'Spotify not connected' });
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

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Spotify Control Error:', error);

        let errorMessage = 'Failed to control playback';
        // Spotify API errors often contain a specific reason
        if (error.body && error.body.error && error.body.error.message) {
            errorMessage = error.body.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        // Handle common "No active device" error
        if (errorMessage.toLowerCase().includes('no active device')) {
            errorMessage = 'No active Spotify device. Please start playing on a device first.';
        }

        res.status(500).json({ error: errorMessage });
    }
}
