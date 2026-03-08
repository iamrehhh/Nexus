import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Note: Use service role key to bypass RLS when performing background admin tasks like downloading from user storage
const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY 
    // fallback if service role key isn't set, though it should be for background jobs
)
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Base payload is small now
        },
    },
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { bookId, userId, filePath } = req.body

        if (!bookId || !userId || !filePath) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // 1. Fetch current book state
        const { data: bookRecord, error: bookErr } = await supabaseAdmin
            .from('books')
            .select('last_processed_page, status')
            .eq('id', bookId)
            .single()

        if (bookErr || !bookRecord) {
            return res.status(404).json({ error: 'Book not found' })
        }

        const startPage = bookRecord.last_processed_page || 0
        const batchSize = 50

        // 2. Download PDF from Supabase Storage
        const { data: fileBlob, error: downloadErr } = await supabaseAdmin.storage
            .from('books')
            .download(filePath)

        if (downloadErr || !fileBlob) {
            console.error('Storage download error:', downloadErr)
            await supabaseAdmin.from('books').update({ status: 'error', processing_error: 'Could not download file from storage' }).eq('id', bookId)
            return res.status(500).json({ error: 'Could not download file from storage' })
        }

        // Convert blob to buffer
        const arrayBuffer = await fileBlob.arrayBuffer()
        const pdfBuffer = Buffer.from(arrayBuffer)

        // 3. Parse PDF
        let pdfData
        try {
            const pdfParse = (await import('pdf-parse')).default
            pdfData = await pdfParse(pdfBuffer)
        } catch (parseErr) {
            console.error('PDF parse error:', parseErr)
            await supabaseAdmin.from('books').update({ status: 'error', processing_error: 'Could not parse PDF file' }).eq('id', bookId)
            return res.status(400).json({ error: 'Could not process PDF. The file may be corrupted or password-protected.' })
        }

        const fullText = pdfData.text || ''
        const pageCount = pdfData.numpages || 1
        const metadata = pdfData.info || {}

        // Split text into pages
        const pages = []
        if (pageCount <= 1) {
            pages.push(fullText)
        } else {
            const avgCharsPerPage = Math.ceil(fullText.length / pageCount)
            for (let i = 0; i < pageCount; i++) {
                const start = i * avgCharsPerPage
                const end = Math.min((i + 1) * avgCharsPerPage, fullText.length)
                const pageText = fullText.slice(start, end).trim()
                pages.push(pageText)
            }
        }

        // 4. Process Batch
        const endPage = Math.min(startPage + batchSize, pageCount)
        const batchPages = pages.slice(startPage, endPage)
        
        const dbBatch = batchPages.map((content, idx) => ({
            book_id: bookId,
            page_number: startPage + idx + 1,
            content,
            word_count: content.split(/\s+/).filter(Boolean).length,
        }))

        // Insert into database if we have pages
        if (dbBatch.length > 0) {
            const { error: insertErr } = await supabaseAdmin
                .from('book_pages')
                .upsert(dbBatch, { onConflict: 'book_id,page_number' })

            if (insertErr) {
                console.error('Failed to insert pages batch:', insertErr)
                await supabaseAdmin.from('books').update({ status: 'error', processing_error: 'Database insert failed' }).eq('id', bookId)
                return res.status(500).json({ error: 'Database insert failed' })
            }
        }

        // 5. Update book record
        const totalWords = pages.reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0)
        const isDone = endPage >= pageCount

        const updateData = {
            total_pages: pageCount,
            word_count: totalWords,
            last_processed_page: endPage,
            status: isDone ? 'ready' : 'partial'
        }

        // Only update metadata on first batch
        if (startPage === 0) {
            if (metadata.Title) updateData.title = metadata.Title
            if (metadata.Author) updateData.author = metadata.Author
        }

        await supabaseAdmin
            .from('books')
            .update(updateData)
            .eq('id', bookId)

        return res.status(200).json({
            success: true,
            totalPages: pageCount,
            wordCount: totalWords,
            lastProcessedPage: endPage,
            isDone,
            title: metadata.Title || null,
            author: metadata.Author || null,
        })

    } catch (error) {
        console.error('PDF extract error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
