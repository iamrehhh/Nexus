import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { action, userId, noteId, title, content, query, mode = 'both' } = req.body

        if (!userId || !action) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // --- EMBED ACTION ---
        if (action === 'embed') {
            if (!noteId) return res.status(400).json({ error: 'Missing noteId for embed' })

            const combinedString = `${title || 'Untitled'}\n\n${content || ''}`
            const truncatedString = combinedString.substring(0, 2000)

            const embeddingRes = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: truncatedString,
            })
            const embedding = embeddingRes.data[0].embedding

            const { error } = await supabase
                .from('vault_files')
                .update({ vector_embedding: embedding })
                .eq('id', noteId)
                .eq('user_id', userId)

            if (error) {
                console.error('Supabase upsert error:', error)
                return res.status(500).json({ error: 'Failed to save embedding', details: error.message })
            }

            return res.status(200).json({ success: true })
        }

        // --- SEARCH ACTION ---
        if (action === 'search') {
            if (!query) return res.status(400).json({ error: 'Missing query for search' })

            let textResults = []
            let semanticResults = []

            // 1. Text Search (Using ilike on name/content for vault_files)
            if (mode === 'text' || mode === 'both') {
                const { data, error } = await supabase
                    .from('vault_files')
                    .select('id, name, content, vault_folders(name)')
                    .eq('user_id', userId)
                    .or(`name.ilike.%${query}%,content.ilike.%${query}%`)
                    .limit(10)

                if (error) console.error('Text search error:', error)
                else {
                    textResults = (data || []).map(r => ({
                        note_id: r.id,
                        title: r.name,
                        content_preview: r.content ? r.content.substring(0, 200) : '',
                        folder: r.vault_folders?.name || 'Uncategorized',
                        rank: 1 // Simple ranking for standard ILIKE
                    }))
                }
            }

            // 2. Semantic Search
            if (mode === 'semantic' || mode === 'both') {
                try {
                    const embeddingRes = await openai.embeddings.create({
                        model: 'text-embedding-3-small',
                        input: query,
                    })
                    const query_embedding = embeddingRes.data[0].embedding

                    const { data, error } = await supabase.rpc('match_vault_files', {
                        query_embedding,
                        match_user_id: userId,
                        match_count: 5
                    })
                    if (error) console.error('Semantic search error:', error)
                    else {
                        semanticResults = (data || []).map(r => ({
                            note_id: r.file_id, // Ensure we map to expected keys
                            title: r.name,
                            content_preview: r.content_preview,
                            folder: 'Uncategorized', // Optimization: could join folder name in RPC if needed
                            similarity: r.similarity
                        }))
                    }
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
                        ...r,
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
                            ...r,
                            score: r.similarity * 15,
                            inText: false,
                            inSemantic: true
                        })
                    }
                })

                const combinedResults = Array.from(resultsMap.values()).sort((a, b) => b.score - a.score)
                return res.status(200).json({ results: combinedResults })
            } else if (mode === 'semantic') {
                return res.status(200).json({ results: semanticResults })
            } else {
                return res.status(200).json({ results: textResults })
            }
        }

        return res.status(400).json({ error: 'Invalid action type' })

    } catch (error) {
        console.error('Vault generic error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
