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
            .eq('service_name', 'google-calendar')
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

                await supabase.from('connected_services').update({
                    access_token,
                    token_expires_at
                }).eq('user_id', userId).in('service_name', ['gmail', 'google-calendar'])
            } else {
                await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).in('service_name', ['gmail', 'google-calendar'])
                return res.json({ connected: false, requiresReconnect: true })
            }
        }

        if (!forceRefresh) {
            const { data: cache } = await supabase
                .from('service_cache')
                .select('data, expires_at')
                .eq('user_id', userId)
                .eq('service_name', 'google-calendar')
                .eq('cache_key', 'calendar_data')
                .single()

            if (cache && new Date(cache.expires_at) > new Date()) {
                return res.json({ connected: true, ...cache.data })
            }
        }

        const headers = { Authorization: `Bearer ${access_token}` }

        const timeMin = new Date().toISOString()
        const timeMaxObj = new Date()
        timeMaxObj.setDate(timeMaxObj.getDate() + 7)
        const timeMax = timeMaxObj.toISOString()

        const params = new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '10'
        })

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

            const eventObj = {
                title: evt.summary || 'Untitled Event',
                start: start.toISOString(),
                end: end.toISOString(),
                location: evt.location || null,
                description: evt.description ? evt.description.substring(0, 100) : null,
                htmlLink: evt.htmlLink
            }

            if (start >= todayStart && start < tomorrowStart) {
                todayEvents.push(eventObj)
            } else {
                upcomingEvents.push(eventObj)
            }

            if (!nextEvent && start >= new Date()) {
                nextEvent = eventObj
            }
        })

        if (!nextEvent && todayEvents.length > 0) {
            nextEvent = todayEvents.find(e => new Date(e.start) >= new Date())
        }

        const resultData = {
            todayEvents,
            upcomingEvents,
            nextEvent
        }

        // Cache 10 minutes
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + 10)

        await supabase.from('service_cache').upsert({
            user_id: userId,
            service_name: 'google-calendar',
            cache_key: 'calendar_data',
            data: resultData,
            expires_at: expiresAt.toISOString(),
            cached_at: new Date().toISOString()
        }, { onConflict: 'user_id,service_name,cache_key' })

        await supabase.from('connected_services')
            .update({ last_synced: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('service_name', 'google-calendar')

        return res.json({ connected: true, ...resultData })

    } catch (err) {
        console.error('Calendar Service Error:', err)
        return res.json({ connected: true, error: true, message: 'Could not fetch latest data' })
    }
}
