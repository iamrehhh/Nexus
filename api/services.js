import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    // URL will look like: /api/services/github
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;

    const parts = pathname.split('/');
    const serviceName = parts.pop(); // 'github', 'gmail', 'spotify', or 'google-calendar'

    if (!serviceName) {
        return res.status(400).send('Invalid service route');
    }

    const { userId, forceRefresh } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        // 1. Check connection
        const { data: service } = await supabase
            .from('connected_services')
            .select('access_token, refresh_token, token_expires_at, is_connected')
            .eq('user_id', userId)
            .eq('service_name', serviceName)
            .single()

        if (!service || !service.is_connected || !service.access_token) {
            return res.json({ connected: false })
        }

        let { access_token, refresh_token, token_expires_at } = service

        // Token refresh logic check
        if (token_expires_at) {
            const expires = new Date(token_expires_at).getTime()
            const now = Date.now()
            // If within 5 minutes of expiring, refresh
            if (expires - now < 5 * 60 * 1000) {
                let refreshSuccess = false;

                if (serviceName === 'gmail' || serviceName === 'google-calendar') {
                    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: process.env.GOOGLE_CLIENT_ID,
                            client_secret: process.env.GOOGLE_CLIENT_SECRET,
                            refresh_token,
                            grant_type: 'refresh_token'
                        })
                    });
                    if (refreshRes.ok) {
                        const refreshed = await refreshRes.json()
                        access_token = refreshed.access_token
                        const newExpires = new Date()
                        newExpires.setSeconds(newExpires.getSeconds() + refreshed.expires_in)
                        token_expires_at = newExpires.toISOString()

                        await supabase.from('connected_services').update({ access_token, token_expires_at })
                            .eq('user_id', userId).in('service_name', ['gmail', 'google-calendar'])
                        refreshSuccess = true;
                    }
                } else if (serviceName === 'spotify') {
                    const authHeader = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
                    const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${authHeader}` },
                        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token })
                    });
                    if (refreshRes.ok) {
                        const refreshed = await refreshRes.json()
                        access_token = refreshed.access_token
                        if (refreshed.refresh_token) refresh_token = refreshed.refresh_token
                        const newExpires = new Date()
                        newExpires.setSeconds(newExpires.getSeconds() + refreshed.expires_in)
                        token_expires_at = newExpires.toISOString()

                        await supabase.from('connected_services').update({ access_token, refresh_token, token_expires_at })
                            .eq('user_id', userId).eq('service_name', 'spotify')
                        refreshSuccess = true;
                    }
                }

                if (!refreshSuccess) {
                    await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).eq('service_name', serviceName)
                    return res.json({ connected: false, requiresReconnect: true })
                }
            }
        }

        // 2. Check cache
        if (!forceRefresh) {
            const cacheKeySuffix = serviceName === 'google-calendar' ? 'calendar_data' : `${serviceName}_data`;
            const { data: cache } = await supabase
                .from('service_cache')
                .select('data, expires_at')
                .eq('user_id', userId)
                .eq('service_name', serviceName)
                .eq('cache_key', cacheKeySuffix)
                .single()

            if (cache && new Date(cache.expires_at) > new Date()) {
                return res.json({ connected: true, ...cache.data })
            }
        }

        const headers = { Authorization: `Bearer ${access_token}` }

        // 3. Fetch specific service data
        let resultData = {};
        let cacheMinutes = 5;
        const cacheKeySuffix = serviceName === 'google-calendar' ? 'calendar_data' : `${serviceName}_data`;

        if (serviceName === 'github') {
            headers['X-GitHub-Api-Version'] = '2022-11-28'
            const userRes = await fetch('https://api.github.com/user', { headers })
            if (!userRes.ok) {
                if (userRes.status === 401) {
                    await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).eq('service_name', 'github')
                    return res.json({ connected: false, requiresReconnect: true })
                }
                throw new Error('Failed to fetch user')
            }
            const userProfile = await userRes.json()

            const eventsRes = await fetch(`https://api.github.com/users/${userProfile.login}/events?per_page=30`, { headers })
            const events = eventsRes.ok ? await eventsRes.json() : []
            const recentCommits = []
            let lastActivity = null
            for (const ev of events) {
                if (!lastActivity) lastActivity = ev.created_at
                if (ev.type === 'PushEvent' && ev.payload?.commits) {
                    for (const commit of ev.payload.commits.reverse()) {
                        recentCommits.push({ repo: ev.repo.name, message: commit.message, date: ev.created_at })
                        if (recentCommits.length >= 5) break
                    }
                }
                if (recentCommits.length >= 5) break
            }

            const reposRes = await fetch('https://api.github.com/user/repos?sort=pushed&per_page=10', { headers })
            const repos = reposRes.ok ? await reposRes.json() : []
            const recentRepos = repos.slice(0, 5).map(r => ({
                name: r.name, description: r.description, language: r.language,
                stargazers_count: r.stargazers_count, updated_at: r.updated_at, html_url: r.html_url
            }))

            const pushDates = new Set()
            for (const ev of events) {
                if (ev.type === 'PushEvent' || ev.type === 'PullRequestEvent' || ev.type === 'IssuesEvent') {
                    pushDates.add(new Date(ev.created_at).toISOString().split('T')[0])
                }
            }
            const today = new Date().toISOString().split('T')[0]
            const yesterday = new Date()
            yesterday.setDate(yesterday.getDate() - 1)
            let checkDate = pushDates.has(today) ? new Date() : yesterday
            let currentStreak = 0
            while (currentStreak < 60) {
                const dateStr = checkDate.toISOString().split('T')[0]
                if (pushDates.has(dateStr)) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1) }
                else { break }
            }

            resultData = {
                profile: { login: userProfile.login, name: userProfile.name, avatar_url: userProfile.avatar_url, publicRepos: userProfile.public_repos, followers: userProfile.followers },
                recentRepos, recentCommits, commitStreak: currentStreak, lastActivity
            };
            cacheMinutes = 15;

        } else if (serviceName === 'gmail') {
            const labelRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', { headers })
            const labelData = labelRes.ok ? await labelRes.json() : { messagesUnread: 0 }
            const unreadCount = labelData.messagesUnread || 0

            const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers })
            const profileData = profileRes.ok ? await profileRes.json() : { messagesTotal: 0 }
            const totalMessages = profileData.messagesTotal || 0

            const unreadMsgsRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread', { headers })
            const unreadMsgsData = unreadMsgsRes.ok ? await unreadMsgsRes.json() : { messages: [] }
            const emails = []
            if (unreadMsgsData.messages && unreadMsgsData.messages.length > 0) {
                for (const msg of unreadMsgsData.messages) {
                    try {
                        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers })
                        if (!msgRes.ok) continue
                        const msgData = await msgRes.json()
                        const headersList = msgData.payload?.headers || []
                        const getHeader = (name) => headersList.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
                        const fromHeader = getHeader('From')
                        const match = fromHeader.match(/(.*?)<([^>]+)>/)
                        let fromName = fromHeader
                        let fromEmail = fromHeader
                        if (match) { fromName = match[1].trim().replace(/^"|"$/g, '') || match[2]; fromEmail = match[2] }
                        emails.push({ id: msg.id, subject: getHeader('Subject') || '(No Subject)', from: fromName, fromEmail, date: getHeader('Date'), snippet: msgData.snippet })
                    } catch (e) { }
                }
            }
            resultData = { unreadCount, totalMessages, emails };
            cacheMinutes = 5;

        } else if (serviceName === 'spotify') {
            const playingRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers })
            let currentlyPlaying = null
            if (playingRes.status === 200) {
                const playing = await playingRes.json()
                if (playing && playing.item) {
                    currentlyPlaying = { isPlaying: playing.is_playing, trackName: playing.item.name, artist: playing.item.artists?.map(a => a.name).join(', '), albumArt: playing.item.album?.images?.[0]?.url, progressMs: playing.progress_ms, durationMs: playing.item.duration_ms }
                }
            } else if (playingRes.status === 401) {
                await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).eq('service_name', 'spotify')
                return res.json({ connected: false, requiresReconnect: true })
            }

            const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=5', { headers })
            const recentData = recentRes.ok ? await recentRes.json() : { items: [] }
            const recentlyPlayed = recentData.items?.map(i => ({ name: i.track.name, artist: i.track.artists?.map(a => a.name).join(', '), played_at: i.played_at })) || []

            const topArtistsRes = await fetch('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=3', { headers })
            const topArtistsData = topArtistsRes.ok ? await topArtistsRes.json() : { items: [] }
            const topArtists = topArtistsData.items?.map(i => i.name) || []

            const topTracksRes = await fetch('https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=3', { headers })
            const topTracksData = topTracksRes.ok ? await topTracksRes.json() : { items: [] }
            const topTracks = topTracksData.items?.map(i => ({ name: i.name, artist: i.artists?.map(a => a.name).join(', ') })) || []

            resultData = { currentlyPlaying, recentlyPlayed, topArtists, topTracks };
            cacheMinutes = 2;

        } else if (serviceName === 'google-calendar') {
            const timeMin = new Date().toISOString()
            const timeMaxObj = new Date()
            timeMaxObj.setDate(timeMaxObj.getDate() + 7)
            const timeMax = timeMaxObj.toISOString()
            const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '10' })
            const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers })

            if (!calRes.ok) {
                if (calRes.status === 401) {
                    await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).in('service_name', ['gmail', 'google-calendar'])
                    return res.json({ connected: false, requiresReconnect: true })
                }
                throw new Error('Failed to fetch events')
            }

            const calData = await calRes.json()
            const events = calData.items || []
            const todayEvents = []
            const upcomingEvents = []
            let nextEvent = null

            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            const tomorrowStart = new Date(todayStart)
            tomorrowStart.setDate(tomorrowStart.getDate() + 1)

            events.forEach(evt => {
                const start = new Date(evt.start.dateTime || evt.start.date)
                const end = new Date(evt.end.dateTime || evt.end.date)
                const eventObj = { title: evt.summary || 'Untitled Event', start: start.toISOString(), end: end.toISOString(), location: evt.location || null, description: evt.description ? evt.description.substring(0, 100) : null, htmlLink: evt.htmlLink }
                if (start >= todayStart && start < tomorrowStart) { todayEvents.push(eventObj) } else { upcomingEvents.push(eventObj) }
                if (!nextEvent && start >= new Date()) { nextEvent = eventObj }
            })
            if (!nextEvent && todayEvents.length > 0) { nextEvent = todayEvents.find(e => new Date(e.start) >= new Date()) }

            resultData = { todayEvents, upcomingEvents, nextEvent };
            cacheMinutes = 10;
        }

        // 4. Cache
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + cacheMinutes)

        await supabase.from('service_cache').upsert({
            user_id: userId,
            service_name: serviceName,
            cache_key: cacheKeySuffix,
            data: resultData,
            expires_at: expiresAt.toISOString(),
            cached_at: new Date().toISOString()
        }, { onConflict: 'user_id,service_name,cache_key' })

        await supabase.from('connected_services')
            .update({ last_synced: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('service_name', serviceName)

        return res.json({ connected: true, ...resultData })

    } catch (err) {
        console.error(`${serviceName} Service Error:`, err)
        return res.json({ connected: true, error: true, message: 'Could not fetch latest data' })
    }
}
