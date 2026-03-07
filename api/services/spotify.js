import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    const { userId, forceRefresh } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const { data: service } = await supabase
            .from('connected_services')
            .select('access_token, refresh_token, token_expires_at, is_connected')
            .eq('user_id', userId)
            .eq('service_name', 'spotify')
            .single()

        if (!service || !service.is_connected || !service.access_token) {
            return res.json({ connected: false })
        }

        let { access_token, refresh_token, token_expires_at } = service

        // Token refresh logic check (expires in 1 hour)
        const expires = new Date(token_expires_at).getTime()
        const now = Date.now()
        // If within 5 minutes of expiring, refresh
        if (expires - now < 5 * 60 * 1000) {
            const authHeader = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
            const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${authHeader}`
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token
                })
            });

            if (refreshRes.ok) {
                const refreshed = await refreshRes.json()
                access_token = refreshed.access_token
                if (refreshed.refresh_token) refresh_token = refreshed.refresh_token

                const newExpires = new Date()
                newExpires.setSeconds(newExpires.getSeconds() + refreshed.expires_in)
                token_expires_at = newExpires.toISOString()

                await supabase.from('connected_services').update({
                    access_token,
                    refresh_token,
                    token_expires_at
                }).eq('user_id', userId).eq('service_name', 'spotify')
            } else {
                await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).eq('service_name', 'spotify')
                return res.json({ connected: false, requiresReconnect: true })
            }
        }

        if (!forceRefresh) {
            const { data: cache } = await supabase
                .from('service_cache')
                .select('data, expires_at')
                .eq('user_id', userId)
                .eq('service_name', 'spotify')
                .eq('cache_key', 'spotify_data')
                .single()

            if (cache && new Date(cache.expires_at) > new Date()) {
                return res.json({ connected: true, ...cache.data })
            }
        }

        const headers = { Authorization: `Bearer ${access_token}` }

        // Fetch Currently Playing
        const playingRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers })
        let currentlyPlaying = null
        if (playingRes.status === 200) {
            const playing = await playingRes.json()
            if (playing && playing.item) {
                currentlyPlaying = {
                    isPlaying: playing.is_playing,
                    trackName: playing.item.name,
                    artist: playing.item.artists?.map(a => a.name).join(', '),
                    albumArt: playing.item.album?.images?.[0]?.url,
                    progressMs: playing.progress_ms,
                    durationMs: playing.item.duration_ms
                }
            }
        } else if (playingRes.status === 401) {
            await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).eq('service_name', 'spotify')
            return res.json({ connected: false, requiresReconnect: true })
        }

        // Fetch Recently Played
        const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=5', { headers })
        const recentData = recentRes.ok ? await recentRes.json() : { items: [] }
        const recentlyPlayed = recentData.items?.map(i => ({
            name: i.track.name,
            artist: i.track.artists?.map(a => a.name).join(', '),
            played_at: i.played_at
        })) || []

        // Top Artists
        const topArtistsRes = await fetch('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=3', { headers })
        const topArtistsData = topArtistsRes.ok ? await topArtistsRes.json() : { items: [] }
        const topArtists = topArtistsData.items?.map(i => i.name) || []

        // Top Tracks
        const topTracksRes = await fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=3', { headers })
        const topTracksData = topTracksRes.ok ? await topTracksRes.json() : { items: [] }
        const topTracks = topTracksData.items?.map(i => ({
            name: i.name,
            artist: i.artists?.map(a => a.name).join(', ')
        })) || []

        const resultData = {
            currentlyPlaying,
            recentlyPlayed,
            topArtists,
            topTracks
        }

        // Cache 2 minutes
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + 2)

        await supabase.from('service_cache').upsert({
            user_id: userId,
            service_name: 'spotify',
            cache_key: 'spotify_data',
            data: resultData,
            expires_at: expiresAt.toISOString(),
            cached_at: new Date().toISOString()
        }, { onConflict: 'user_id,service_name,cache_key' })

        await supabase.from('connected_services')
            .update({ last_synced: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('service_name', 'spotify')

        return res.json({ connected: true, ...resultData })

    } catch (err) {
        console.error('Spotify Service Error:', err)
        return res.json({ connected: true, error: true, message: 'Could not fetch latest data' })
    }
}
