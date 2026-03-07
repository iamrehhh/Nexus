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
            .eq('service_name', 'gmail')
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
                .eq('service_name', 'gmail')
                .eq('cache_key', 'gmail_data')
                .single()

            if (cache && new Date(cache.expires_at) > new Date()) {
                return res.json({ connected: true, ...cache.data })
            }
        }

        const headers = { Authorization: `Bearer ${access_token}` }

        // Fetch unread count from labels
        const labelRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX', { headers })
        const labelData = labelRes.ok ? await labelRes.json() : { messagesUnread: 0 }
        const unreadCount = labelData.messagesUnread || 0

        // Fetch profile
        const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers })
        const profileData = profileRes.ok ? await profileRes.json() : { messagesTotal: 0 }
        const totalMessages = profileData.messagesTotal || 0

        // Fetch top unread messages
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
                    if (match) {
                        fromName = match[1].trim().replace(/^"|"$/g, '') || match[2]
                        fromEmail = match[2]
                    }

                    emails.push({
                        id: msg.id,
                        subject: getHeader('Subject') || '(No Subject)',
                        from: fromName,
                        fromEmail,
                        date: getHeader('Date'),
                        snippet: msgData.snippet
                    })
                } catch (e) {
                    // Ignore single message failure
                }
            }
        }

        const resultData = {
            unreadCount,
            totalMessages,
            emails
        }

        // Cache 5 minutes
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + 5)

        await supabase.from('service_cache').upsert({
            user_id: userId,
            service_name: 'gmail',
            cache_key: 'gmail_data',
            data: resultData,
            expires_at: expiresAt.toISOString(),
            cached_at: new Date().toISOString()
        }, { onConflict: 'user_id,service_name,cache_key' })

        await supabase.from('connected_services')
            .update({ last_synced: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('service_name', 'gmail')

        return res.json({ connected: true, ...resultData })

    } catch (err) {
        console.error('Gmail Service Error:', err)
        return res.json({ connected: true, error: true, message: 'Could not fetch latest data' })
    }
}
