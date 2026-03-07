import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

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
        const { messages, userId } = req.body

        if (!messages || !userId || messages.length === 0) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // 1. Call GPT-4o mini to extract memories
        const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n')

        const extraction = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Extract important facts, preferences, goals, tasks, and anything worth remembering long term from this conversation. Return a JSON array of objects: [{"type": "fact|goal|preference|task|reminder", "content": "the memory in one clear sentence", "importance": 1-5}]. Return only the JSON array, nothing else. If there is nothing worth remembering, return an empty array [].'
                },
                {
                    role: 'user',
                    content: conversationText
                }
            ],
            max_tokens: 800,
            temperature: 0.3,
        })

        const rawContent = extraction.choices[0]?.message?.content || '[]'

        // 2. Parse JSON response
        let memories = []
        try {
            // Clean any markdown formatting
            const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            memories = JSON.parse(cleaned)
        } catch (parseErr) {
            console.error('Failed to parse memory extraction:', parseErr, rawContent)
            return res.status(200).json({ saved: 0 })
        }

        if (!Array.isArray(memories) || memories.length === 0) {
            return res.status(200).json({ saved: 0 })
        }

        // 3. For each memory: embed and save
        let savedCount = 0
        for (const memory of memories) {
            if (!memory.content || !memory.type) continue

            try {
                // Embed the memory content
                const embeddingRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: memory.content,
                })
                const embedding = embeddingRes.data[0].embedding

                // Save to secretary_memory
                const { error } = await supabase.from('secretary_memory').insert([{
                    user_id: userId,
                    memory_type: memory.type,
                    content: memory.content,
                    embedding,
                    importance: memory.importance || 1,
                }])

                if (!error) savedCount++
            } catch (memErr) {
                console.error('Failed to save memory item:', memErr)
            }
        }

        // 4. Return count
        return res.status(200).json({ saved: savedCount })

    } catch (error) {
        console.error('Memory API error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
