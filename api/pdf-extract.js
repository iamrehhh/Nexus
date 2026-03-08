import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
        // Extend Vercel function timeout to maximum allowed on Hobby plan
        maxDuration: 60,
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

        // 1. Fetch book record
        const { data: bookRecord, error: bookErr } = await supabaseAdmin
            .from('books')
            .select('status, last_processed_page')
            .eq('id', bookId)
            .single()

        if (bookErr || !bookRecord) {
            return res.status(404).json({ error: 'Book not found' })
        }

        // If already done, return early
        if (bookRecord.status === 'ready') {
            return res.status(200).json({ success: true, alreadyDone: true })
        }

        // 2. Download PDF from Supabase Storage ONCE
        const { data: fileBlob, error: downloadErr } = await supabaseAdmin.storage
            .from('books')
            .download(filePath)

        if (downloadErr || !fileBlob) {
            console.error('Storage download error:', downloadErr)
            await supabaseAdmin.from('books').update({
                status: 'error',
                processing_error: 'Could not download file from storage'
            }).eq('id', bookId)
            return res.status(500).json({ error: 'Could not download file from storage' })
        }

        // Convert blob to buffer ONCE
        const arrayBuffer = await fileBlob.arrayBuffer()
        const pdfBuffer = Buffer.from(arrayBuffer)

        // 3. Parse PDF ONCE
        let pdfData
        try {
            const pdfParse = (await import('pdf-parse')).default
            pdfData = await pdfParse(pdfBuffer)
        } catch (parseErr) {
            console.error('PDF parse error:', parseErr)
            await supabaseAdmin.from('books').update({
                status: 'error',
                processing_error: 'Could not parse PDF — file may be corrupted or password-protected'
            }).eq('id', bookId)
            return res.status(400).json({ error: 'Could not process PDF' })
        }

        const fullText = pdfData.text || ''
        const pageCount = pdfData.numpages || 1
        const metadata = pdfData.info || {}
        const totalWords = fullText.split(/\s+/).filter(Boolean).length

        // 4. Split text into pages ONCE
        const pages = []
        if (pageCount <= 1) {
            pages.push(fullText)
        } else {
            const avgCharsPerPage = Math.ceil(fullText.length / pageCount)
            for (let i = 0; i < pageCount; i++) {
                const start = i * avgCharsPerPage
                const end = Math.min((i + 1) * avgCharsPerPage, fullText.length)
                pages.push(fullText.slice(start, end).trim())
            }
        }

        // 5. Insert all pages in bulk (one database call)
        // Split into chunks of 500 rows max to stay within Supabase payload limits
        const CHUNK_SIZE = 500
        const allPageRows = pages.map((content, idx) => ({
            book_id: bookId,
            page_number: idx + 1,
            content,
            word_count: content.split(/\s+/).filter(Boolean).length,
        }))

        for (let i = 0; i < allPageRows.length; i += CHUNK_SIZE) {
            const chunk = allPageRows.slice(i, i + CHUNK_SIZE)
            const { error: insertErr } = await supabaseAdmin
                .from('book_pages')
                .upsert(chunk, { onConflict: 'book_id,page_number' })

            if (insertErr) {
                console.error('Failed to insert pages chunk:', insertErr)
                await supabaseAdmin.from('books').update({
                    status: 'error',
                    processing_error: 'Database insert failed'
                }).eq('id', bookId)
                return res.status(500).json({ error: 'Database insert failed' })
            }
        }

        // 6. Update book record as fully done
        const updateData = {
            total_pages: pageCount,
            word_count: totalWords,
            last_processed_page: pageCount,
            status: 'ready',
            processing_error: null,
        }

        // Pull title/author from PDF metadata if available
        if (metadata.Title) updateData.title = metadata.Title
        if (metadata.Author) updateData.author = metadata.Author

        await supabaseAdmin.from('books').update(updateData).eq('id', bookId)

        return res.status(200).json({
            success: true,
            totalPages: pageCount,
            wordCount: totalWords,
            lastProcessedPage: pageCount,
            isDone: true,
            title: metadata.Title || null,
            author: metadata.Author || null,
        })

    } catch (error) {
        console.error('PDF extract error:', error)

        // Mark book as error so user sees it failed rather than stuck spinning
        try {
            const { bookId } = req.body
            if (bookId) {
                await supabaseAdmin.from('books').update({
                    status: 'error',
                    processing_error: error.message || 'Unexpected error during extraction'
                }).eq('id', bookId)
            }
        } catch (e) { }

        return res.status(500).json({ error: 'Internal server error' })
    }
}