import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { query, userId, mode = 'both' } = req.body

        if (!query || !userId) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        let textResults = []
        let semanticResults = []

        // 1. Text Search
        if (mode === 'text' || mode === 'both') {
            const { data, error } = await supabase.rpc('search_vault_text', {
                search_query: query,
                match_user_id: userId,
                match_count: 10
            })
            if (error) console.error('Text search error:', error)
            else textResults = data || []
        }

        // 2. Semantic Search
        if (mode === 'semantic' || mode === 'both') {
            try {
                const embeddingRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: query,
                })
                const query_embedding = embeddingRes.data[0].embedding

                const { data, error } = await supabase.rpc('search_vault_notes', {
                    query_embedding,
                    match_user_id: userId,
                    match_count: 5
                })
                if (error) console.error('Semantic search error:', error)
                else semanticResults = data || []
            } catch (embedError) {
                console.error('Semantic embedding error:', embedError)
            }
        }

        // 3. Merge and Deduplicate
        if (mode === 'both') {
            const resultsMap = new Map()

            // Process text results
            textResults.forEach(r => {
                resultsMap.set(r.note_id, {
                    noteId: r.note_id,
                    title: r.title,
                    contentPreview: r.content_preview,
                    folder: r.folder,
                    score: r.rank * 10, // Normalize a bit
                    inText: true,
                    inSemantic: false
                })
            })

            // Process semantic results
            semanticResults.forEach(r => {
                if (resultsMap.has(r.note_id)) {
                    const existing = resultsMap.get(r.note_id)
                    existing.score += (r.similarity * 20) // Boost score if in both
                    existing.inSemantic = true
                } else {
                    resultsMap.set(r.note_id, {
                        noteId: r.note_id,
                        title: r.title,
                        contentPreview: r.content_preview,
                        folder: r.folder,
                        score: r.similarity * 10,
                        inText: false,
                        inSemantic: true
                    })
                }
            })

            const mergedResults = Array.from(resultsMap.values()).map(r => {
                if (r.inText && r.inSemantic) r.score += 50 // Prioritise matches in both
                return r
            })

            mergedResults.sort((a, b) => b.score - a.score)
            return res.status(200).json({ results: mergedResults })
        }

        if (mode === 'text') {
            return res.status(200).json({ results: textResults.map(r => ({ noteId: r.note_id, title: r.title, contentPreview: r.content_preview, folder: r.folder, score: r.rank })) })
        }

        if (mode === 'semantic') {
            return res.status(200).json({ results: semanticResults.map(r => ({ noteId: r.note_id, title: r.title, contentPreview: r.content_preview, folder: r.folder, score: r.similarity })) })
        }

    } catch (error) {
        console.error('Vault search error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
