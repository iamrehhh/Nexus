import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    const { userId, forceRefresh } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        // 1. Check connection
        const { data: service } = await supabase
            .from('connected_services')
            .select('access_token, is_connected')
            .eq('user_id', userId)
            .eq('service_name', 'github')
            .single()

        if (!service || !service.is_connected || !service.access_token) {
            return res.json({ connected: false })
        }

        // 2. Check cache
        if (!forceRefresh) {
            const { data: cache } = await supabase
                .from('service_cache')
                .select('data, expires_at')
                .eq('user_id', userId)
                .eq('service_name', 'github')
                .eq('cache_key', 'github_data')
                .single()

            if (cache && new Date(cache.expires_at) > new Date()) {
                return res.json({ connected: true, ...cache.data })
            }
        }

        // 3. Fetch fresh data
        const headers = { Authorization: `Bearer ${service.access_token}`, 'X-GitHub-Api-Version': '2022-11-28' }

        // Fetch User Profile
        const userRes = await fetch('https://api.github.com/user', { headers })
        if (!userRes.ok) {
            if (userRes.status === 401) {
                await supabase.from('connected_services').update({ is_connected: false }).eq('user_id', userId).eq('service_name', 'github')
                return res.json({ connected: false, requiresReconnect: true })
            }
            throw new Error('Failed to fetch user')
        }
        const userProfile = await userRes.json()

        // Fetch user events to find recent commits
        const eventsRes = await fetch(`https://api.github.com/users/${userProfile.login}/events?per_page=30`, { headers })
        const events = eventsRes.ok ? await eventsRes.json() : []
        const recentCommits = []
        let lastActivity = null

        for (const ev of events) {
            if (!lastActivity) lastActivity = ev.created_at
            if (ev.type === 'PushEvent' && ev.payload?.commits) {
                for (const commit of ev.payload.commits.reverse()) {
                    recentCommits.push({
                        repo: ev.repo.name,
                        message: commit.message,
                        date: ev.created_at
                    })
                    if (recentCommits.length >= 5) break
                }
            }
            if (recentCommits.length >= 5) break
        }

        // Fetch Recent Repositories
        const reposRes = await fetch('https://api.github.com/user/repos?sort=pushed&per_page=10', { headers })
        const repos = reposRes.ok ? await reposRes.json() : []

        const recentRepos = repos.slice(0, 5).map(r => ({
            name: r.name,
            description: r.description,
            language: r.language,
            stargazers_count: r.stargazers_count,
            updated_at: r.updated_at,
            html_url: r.html_url
        }))

        // Calculate streak (days with pushed repos from the list)
        const pushDates = new Set()

        for (const ev of events) {
            if (ev.type === 'PushEvent' || ev.type === 'PullRequestEvent' || ev.type === 'IssuesEvent') {
                const dateStr = new Date(ev.created_at).toISOString().split('T')[0]
                pushDates.add(dateStr)
            }
        }

        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)

        let checkDate = pushDates.has(today) ? new Date() : yesterday
        let currentStreak = 0

        while (currentStreak < 60) {
            const dateStr = checkDate.toISOString().split('T')[0]
            if (pushDates.has(dateStr)) {
                currentStreak++
                checkDate.setDate(checkDate.getDate() - 1)
            } else {
                break
            }
        }

        const resultData = {
            profile: {
                login: userProfile.login,
                name: userProfile.name,
                avatar_url: userProfile.avatar_url,
                publicRepos: userProfile.public_repos,
                followers: userProfile.followers
            },
            recentRepos,
            recentCommits,
            commitStreak: currentStreak,
            lastActivity
        }

        // 4. Cache
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + 15) // Cache 15 minutes

        await supabase.from('service_cache').upsert({
            user_id: userId,
            service_name: 'github',
            cache_key: 'github_data',
            data: resultData,
            expires_at: expiresAt.toISOString(),
            cached_at: new Date().toISOString()
        }, { onConflict: 'user_id,service_name,cache_key' })

        await supabase.from('connected_services')
            .update({ last_synced: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('service_name', 'github')

        return res.json({ connected: true, ...resultData })

    } catch (err) {
        console.error('GitHub Service Error:', err)
        return res.json({ connected: true, error: true, message: 'Could not fetch latest data' })
    }
}
