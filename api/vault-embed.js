import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { noteId, userId, title, content } = req.body

        if (!noteId || !userId) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // 1. Combine title and content, restrict length to stay within token limits cleanly
        const combinedString = `${title || 'Untitled'}\n\n${content || ''}`
        const truncatedString = combinedString.substring(0, 2000)

        // 2. Embed
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: truncatedString,
        })
        const embedding = embeddingRes.data[0].embedding

        // 3. Update vault_files
        const { error } = await supabase
            .from('vault_files')
            .update({ vector_embedding: embedding })
            .eq('id', noteId)
            .eq('user_id', userId)

        if (error) {
            console.error('Supabase upsert error:', error)
            return res.status(500).json({ error: 'Failed to save embedding', details: error.message })
        }

        // 4. Return success
        return res.status(200).json({ success: true })

    } catch (error) {
        console.error('Vault embed error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
