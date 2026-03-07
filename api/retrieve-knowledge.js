import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end()

    const { message, characterId } = req.body
    if (!message || !characterId) return res.status(400).json({ knowledge: '' })

    try {
        // Embed the user's message
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: message
        })
        const queryEmbedding = embeddingResponse.data[0].embedding

        // Search for relevant knowledge chunks
        const { data: chunks, error } = await supabase.rpc('match_knowledge', {
            query_embedding: queryEmbedding,
            match_character_id: characterId,
            match_count: 4
        })

        if (error) {
            console.error('RPC Error:', error)
            throw error
        }

        const knowledge = chunks?.map(c => c.content).join('\n\n') || ''
        res.status(200).json({ knowledge })
    } catch (e) {
        console.error('RAG Retrieval Error:', e.message)
        res.status(500).json({ knowledge: '' })
    }
}
