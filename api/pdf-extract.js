import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// Vercel serverless config
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { pdfBase64, userId, bookId, fileName } = req.body

        if (!pdfBase64 || !userId || !bookId) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // Check size (base64 is ~33% larger than binary)
        const sizeInBytes = (pdfBase64.length * 3) / 4
        if (sizeInBytes > 50 * 1024 * 1024) {
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' })
        }

        // Convert base64 to buffer
        const pdfBuffer = Buffer.from(pdfBase64, 'base64')

        // Parse PDF using pdf-parse
        let pdfData
        try {
            const pdfParse = (await import('pdf-parse')).default
            pdfData = await pdfParse(pdfBuffer)
        } catch (parseErr) {
            console.error('PDF parse error:', parseErr)
            return res.status(400).json({ error: 'Could not process PDF. The file may be corrupted or password-protected.' })
        }

        const fullText = pdfData.text || ''
        const pageCount = pdfData.numpages || 1
        const metadata = pdfData.info || {}
        const totalWords = fullText.split(/\s+/).filter(Boolean).length

        // Split text into pages (estimate by dividing into equal chunks)
        const pages = []
        if (pageCount <= 1) {
            pages.push(fullText)
        } else {
            const avgCharsPerPage = Math.ceil(fullText.length / pageCount)
            for (let i = 0; i < pageCount; i++) {
                const start = i * avgCharsPerPage
                const end = Math.min((i + 1) * avgCharsPerPage, fullText.length)
                const pageText = fullText.slice(start, end).trim()
                if (pageText) pages.push(pageText)
            }
        }

        // Insert pages into book_pages table in batches
        const batchSize = 50
        for (let i = 0; i < pages.length; i += batchSize) {
            const batch = pages.slice(i, i + batchSize).map((content, j) => ({
                book_id: bookId,
                page_number: i + j + 1,
                content,
                word_count: content.split(/\s+/).filter(Boolean).length,
            }))

            const { error: insertErr } = await supabase
                .from('book_pages')
                .insert(batch)

            if (insertErr) {
                console.error('Failed to insert pages batch:', insertErr)
            }
        }

        // Extract title/author from metadata
        const extractedTitle = metadata.Title || null
        const extractedAuthor = metadata.Author || null

        // Update book record
        const updateData = {
            total_pages: pages.length,
            word_count: totalWords,
        }
        if (extractedTitle) updateData.title = extractedTitle
        if (extractedAuthor) updateData.author = extractedAuthor

        await supabase
            .from('books')
            .update(updateData)
            .eq('id', bookId)

        return res.status(200).json({
            totalPages: pages.length,
            wordCount: totalWords,
            title: extractedTitle,
            author: extractedAuthor,
        })

    } catch (error) {
        console.error('PDF extract error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
