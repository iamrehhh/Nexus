import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { getSpotifyClient } from './spotify-helper.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { message, userId, conversationHistory, userName } = req.body

        if (!message || !userId) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        const lowerMsg = message.toLowerCase().trim()

        // 0. Quick Action: Spotify Control Intents
        const spotifyPlayIntents = ['play music', 'play spotify', 'resume music', 'resume spotify']
        const spotifyPauseIntents = ['pause music', 'pause spotify', 'stop music', 'stop spotify']
        const spotifyNextIntents = ['next song', 'skip song', 'next track', 'skip track']
        const spotifyPrevIntents = ['previous song', 'last song', 'previous track', 'go back a song']

        if (
            spotifyPlayIntents.includes(lowerMsg) ||
            spotifyPauseIntents.includes(lowerMsg) ||
            spotifyNextIntents.includes(lowerMsg) ||
            spotifyPrevIntents.includes(lowerMsg)
        ) {
            try {
                const spotifyApi = await getSpotifyClient(userId)
                if (spotifyApi) {
                    let replyText = 'Done.'
                    if (spotifyPlayIntents.includes(lowerMsg)) {
                        await spotifyApi.play()
                        replyText = 'Playing your music.'
                    } else if (spotifyPauseIntents.includes(lowerMsg)) {
                        await spotifyApi.pause()
                        replyText = 'Paused the music.'
                    } else if (spotifyNextIntents.includes(lowerMsg)) {
                        await spotifyApi.skipToNext()
                        replyText = 'Skipped to the next song.'
                    } else if (spotifyPrevIntents.includes(lowerMsg)) {
                        await spotifyApi.skipToPrevious()
                        replyText = 'Went back to the previous song.'
                    }

                    // Save messages
                    await supabase.from('secretary_messages').insert([
                        { user_id: userId, role: 'user', content: message },
                        { user_id: userId, role: 'assistant', content: replyText },
                    ])

                    return res.status(200).json({ reply: replyText })
                }
            } catch (err) {
                console.error('Spotify Intent Error:', err)
                // Fall through to normal GPT response if it fails
            }
        }

        // 1. Embed the user message for RAG search
        let relevantMemory = ''
        try {
            const embeddingRes = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: message,
            })
            const embedding = embeddingRes.data[0].embedding

            // 2. Search secretary_memory using match function
            const { data: memories, error: memError } = await supabase.rpc('match_secretary_memory', {
                query_embedding: embedding,
                match_user_id: userId,
                match_count: 8,
            })

            if (!memError && memories && memories.length > 0) {
                relevantMemory = memories.map(m => `[${m.memory_type}] ${m.content}`).join('\n')
            }
        } catch (embErr) {
            console.error('Embedding/memory search error:', embErr)
        }

        // 3. Fetch today's tasks
        let todaysTasks = 'None'
        let pendingTaskCount = 0
        try {
            const today = new Date()
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

            const { data: todayTasksData } = await supabase
                .from('tasks')
                .select('title, priority, due_date')
                .eq('user_id', userId)
                .eq('completed', false)
                .gte('due_date', startOfDay)
                .lt('due_date', endOfDay)

            if (todayTasksData && todayTasksData.length > 0) {
                todaysTasks = todayTasksData.map(t => `- ${t.title} (${t.priority})`).join('\n')
            }

            // 4. Count total pending tasks
            const { count } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('completed', false)

            pendingTaskCount = count || 0
        } catch (taskErr) {
            console.error('Task fetch error:', taskErr)
        }

        // 4.5. Fetch Currently Reading Books
        let readingContext = 'Not currently reading anything.'
        try {
            const { data: books } = await supabase
                .from('books')
                .select('title, author, progress')
                .eq('user_id', userId)
                .eq('status', 'reading')
                .limit(3)

            if (books && books.length > 0) {
                readingContext = books.map(b => `${b.title} by ${b.author || 'Unknown'} (${Math.round((b.progress || 0) * 100)}% complete)`).join(', ')
            }
        } catch (e) { }

        // 4.6. Fetch Health Context
        let healthContext = 'No recent health check-ins.'
        try {
            const { data: healthData } = await supabase
                .from('health_checkins')
                .select('checkin_date, data, mood_summary')
                .eq('user_id', userId)
                .order('checkin_date', { ascending: false })
                .limit(2)

            if (healthData && healthData.length > 0) {
                const latest = healthData[0]
                const previous = healthData[1]

                const formatData = (d) => {
                    const parts = []
                    Object.entries(d.data || {}).forEach(([k, v]) => parts.push(`${k}: ${v}`))
                    if (d.mood_summary) parts.push(`mood: ${d.mood_summary}`)
                    return parts.join(', ')
                }

                healthContext = `Last check-in (${latest.checkin_date}): ${formatData(latest)}.`
                if (previous) {
                    healthContext += ` Previous check-in (${previous.checkin_date}): ${formatData(previous)}.`
                }

                const daysOverdue = Math.floor((Date.now() - new Date(latest.checkin_date).getTime()) / (1000 * 60 * 60 * 24))
                if (daysOverdue > 7) {
                    healthContext += ` Note: User is ${daysOverdue} days overdue for a check-in.`
                }
            }
        } catch (e) { }

        // 4.6.5. Fetch Custom Health Tables Context
        let customTablesContext = ''
        try {
            const { data: tables } = await supabase
                .from('health_tables')
                .select('id, title, columns')
                .eq('user_id', userId)

            if (tables && tables.length > 0) {
                const tableContexts = await Promise.all(tables.slice(0, 3).map(async t => {
                    const { data: rows } = await supabase
                        .from('health_table_rows')
                        .select('data')
                        .eq('table_id', t.id)
                        .order('created_at', { ascending: false })
                        .limit(3)

                    if (!rows || rows.length === 0) return `${t.title} (0 rows)`

                    // only show top few cols
                    const topCols = t.columns.slice(0, 3)
                    const rowSummaries = rows.map(r =>
                        topCols.map(c => `${c.name}: ${r.data[c.id] || '-'}`).join(', ')
                    ).join(' | ')
                    return `${t.title} [Recent rows: ${rowSummaries}]`
                }))
                customTablesContext = tableContexts.join('\n  - ')
            }
        } catch (e) { }

        // 4.7. Fetch Connected Services Context
        let connectedServicesContext = []
        try {
            const { data: services } = await supabase
                .from('connected_services')
                .select('service_name, is_connected')
                .eq('user_id', userId)

            const connectedNames = services?.filter(s => s.is_connected).map(s => s.service_name) || []

            if (connectedNames.length > 0) {
                const { data: caches } = await supabase
                    .from('service_cache')
                    .select('service_name, data')
                    .eq('user_id', userId)
                    .in('service_name', connectedNames)

                const cacheMap = {}
                caches?.forEach(c => cacheMap[c.service_name] = c.data)

                if (connectedNames.includes('github') && cacheMap['github']) {
                    const d = cacheMap['github']
                    let text = `GitHub: ${d.commitStreak} day streak`
                    if (d.recentCommits?.length > 0) {
                        const msg = d.recentCommits[0]
                        const timeAgo = Math.floor((Date.now() - new Date(msg.date).getTime()) / (1000 * 60 * 60 * 24))
                        text += `, last commit '${msg.message.substring(0, 30)}...' on ${msg.repo} (${timeAgo === 0 ? 'today' : timeAgo + ' days ago'})`
                    }
                    if (d.recentRepos?.length > 0) {
                        text += `. Recent repos: ${d.recentRepos.map(r => r.name).join(', ')}`
                    }
                    connectedServicesContext.push(text)
                }

                if (connectedNames.includes('spotify') && cacheMap['spotify']) {
                    const d = cacheMap['spotify']
                    if (d.currentlyPlaying) {
                        connectedServicesContext.push(`Spotify: Currently playing '${d.currentlyPlaying.trackName}' by ${d.currentlyPlaying.artist}`)
                    } else if (d.recentlyPlayed?.length > 0) {
                        connectedServicesContext.push(`Spotify: Last played '${d.recentlyPlayed[0].name}'`)
                    }
                }

                if (connectedNames.includes('gmail') && cacheMap['gmail']) {
                    const d = cacheMap['gmail']
                    let text = `Gmail: ${d.unreadCount} unread emails`
                    if (d.emails?.length > 0) {
                        text += `. Recent: ${d.emails.slice(0, 3).map(e => `'${e.subject}'`).join(', ')}`
                    }
                    connectedServicesContext.push(text)
                }

                if (connectedNames.includes('google-calendar') && cacheMap['google-calendar']) {
                    const d = cacheMap['google-calendar']
                    let text = `Calendar: `
                    if (d.todayEvents?.length > 0) {
                        text += `Today's events: ${d.todayEvents.map(e => `'${e.title}'`).join(', ')}. `
                    } else {
                        text += `No events today. `
                    }
                    if (d.nextEvent) {
                        text += `Next event: '${d.nextEvent.title}' at ${new Date(d.nextEvent.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    }
                    connectedServicesContext.push(text)
                }
            }
        } catch (e) { console.error('Error fetching connected services:', e) }
        const servicesString = connectedServicesContext.length > 0 ? '\n- ' + connectedServicesContext.join('\n- ') : ' None'

        // 4.8. Fetch Vault Context
        let vaultContext = ''
        let vaultSummary = '0 active notes'
        try {
            const { count } = await supabase.from('vault_files').select('*', { count: 'exact', head: true }).eq('user_id', userId)
            vaultSummary = `${count || 0} active notes`

            const vaultKeywords = ["note", "wrote", "writing", "saved", "vault", "idea i had", "what did i", "find my", "remember when i", "search"]
            if (vaultKeywords.some(kw => lowerMsg.includes(kw))) {

                // Semantic Search
                const embeddingRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: message })
                const query_embedding = embeddingRes.data[0].embedding
                const { data: semData } = await supabase.rpc('match_vault_files', { query_embedding, match_user_id: userId, match_count: 5 })

                // Text Search
                const { data: txtData } = await supabase
                    .from('vault_files')
                    .select('id, name, content')
                    .eq('user_id', userId)
                    .or(`name.ilike.%${message}%,content.ilike.%${message}%`)
                    .limit(5)

                const resultMap = new Map()
                semData?.forEach(r => resultMap.set(r.file_id, {
                    note_id: r.file_id,
                    title: r.name,
                    content_preview: r.content_preview
                }))
                txtData?.forEach(r => {
                    if (!resultMap.has(r.id)) {
                        resultMap.set(r.id, {
                            note_id: r.id,
                            title: r.name,
                            content_preview: r.content ? r.content.substring(0, 200) : ''
                        })
                    }
                })

                const topNotes = Array.from(resultMap.values()).slice(0, 5)
                if (topNotes.length > 0) {
                    vaultContext = 'Matched Vault Notes:\n' + topNotes.map(n => `Title: "${n.title}"\nContent snippet: ${n.content_preview}`).join('\n---\n')
                } else {
                    vaultContext = 'Searched vault but found no matching notes.'
                }
            }
        } catch (e) { console.error('Vault integration error:', e) }

        // 5. Get user settings for secretary tone
        let secretaryTone = 'professional'
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('settings')
                .eq('id', userId)
                .single()
            if (userData?.settings?.secretaryTone) {
                secretaryTone = userData.settings.secretaryTone
            }
        } catch (e) { }

        const toneInstructions = {
            professional: 'You are competent, direct, and efficient with a warm undertone.',
            casual: 'You are friendly, relaxed, and conversational while still being helpful.',
            direct: 'You are extremely concise and to-the-point. No pleasantries, just answers.',
            warm: 'You are warm, supportive, and encouraging while being competent.',
        }

        // 6. Build system prompt
        const currentTime = new Date().toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
        })

        const systemPrompt = `You are the personal secretary for ${userName || 'the user'}. ${toneInstructions[secretaryTone] || toneInstructions.professional} You speak plainly — no filler words, no padding, no "Certainly!" or "Great question!". Just respond directly.

You have access to context about the user's tasks, memory, and activity. Use it naturally — reference things they have told you before without making it obvious you are searching memory. You help them plan, think, execute, and remember things. You proactively notice patterns when relevant.

When the user asks you to remember something, confirm it briefly and save it. When they ask what you remember, summarise clearly. When they ask for a plan or ideas, be concrete and specific — not generic advice.

Keep responses concise unless depth is genuinely needed. Never give a numbered list when a sentence will do. Never give a paragraph when a sentence will do.

Current context:
- User name: ${userName || 'Unknown'}
- Current time: ${currentTime}
- Tasks due today: ${todaysTasks}
- Total pending tasks: ${pendingTaskCount}
- Currently reading: ${readingContext}
- Health tracking: ${healthContext}
- Custom Health Tables: 
  - ${customTablesContext || 'No custom tables yet.'}
- Connected Services Context: ${servicesString}
- Entire Vault Profile: ${vaultSummary}
- Relevant Vault Notes: ${vaultContext || 'No vault search triggered for this message.'}
- Recent memory: ${relevantMemory || 'No relevant memories found'}`

        // 7. Call GPT-4o mini
        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...(conversationHistory || []).slice(-18),
            { role: 'user', content: message },
        ]

        const tools = [
            {
                type: 'function',
                function: {
                    name: 'schedule_reminder',
                    description: 'Schedule a reminder for the user at a specific date and time based on their request. Use this whenever the user asks you to remind them of something.',
                    parameters: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'A short, clear title for the reminder (e.g., "Doctor Appointment", "Call Mom")' },
                            description: { type: 'string', description: 'Any extra details or context for the reminder.' },
                            due_date: { type: 'string', description: 'The absolute ISO 8601 string for the date and time of the reminder (e.g., "2026-03-09T14:30:00.000Z"). Make sure to calculate this accurately based on the current time provided in the system prompt.' }
                        },
                        required: ['title', 'due_date']
                    }
                }
            }
        ]

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: chatMessages,
            tools: tools,
            tool_choice: 'auto',
            max_tokens: 1000,
            temperature: 0.7,
        })

        const responseMessage = completion.choices[0]?.message
        let reply = responseMessage?.content || ''

        // Check if the LLM decided to call a tool
        if (responseMessage?.tool_calls) {
            for (const toolCall of responseMessage.tool_calls) {
                if (toolCall.function.name === 'schedule_reminder') {
                    try {
                        const args = JSON.parse(toolCall.function.arguments)

                        // Save to Supabase
                        await supabase.from('reminders').insert([{
                            user_id: userId,
                            title: args.title,
                            description: args.description || null,
                            due_date: args.due_date
                        }])

                        const formattedDate = new Date(args.due_date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

                        // If there was no text content, formulate a default reply
                        if (!reply.trim()) {
                            reply = `Alright, I've set a reminder for "${args.title}" on ${formattedDate}.`
                        }
                    } catch (e) {
                        console.error('Failed to parse or save reminder tool call:', e)
                        if (!reply.trim()) reply = "I tried to set a reminder, but something went wrong."
                    }
                }
            }
        }

        if (!reply.trim()) reply = 'I couldn\'t generate a response.'

        // 8. Save both messages to secretary_messages
        try {
            await supabase.from('secretary_messages').insert([
                { user_id: userId, role: 'user', content: message },
                { user_id: userId, role: 'assistant', content: reply },
            ])
        } catch (saveErr) {
            console.error('Failed to save messages:', saveErr)
        }

        // 9. Trigger background memory extraction (fire and forget)
        try {
            const recentMsgs = [...(conversationHistory || []).slice(-8), { role: 'user', content: message }, { role: 'assistant', content: reply }]

            const baseUrl = process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'http://localhost:5173'

            fetch(`${baseUrl}/api/memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: recentMsgs, userId }),
            }).catch(() => { })
        } catch (e) { }

        // 10. Return reply
        return res.status(200).json({ reply })

    } catch (error) {
        console.error('Secretary API error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
