import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { question, pageContent, bookTitle, userId } = req.body

        if (!question || !pageContent) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a reading assistant. The user is reading '${bookTitle || 'a book'}'. Answer questions about the text clearly and concisely. Don't summarise unless asked. Don't pad your response.`
                },
                {
                    role: 'user',
                    content: `Page content: ${pageContent}\n\nQuestion: ${question}`
                }
            ],
            max_tokens: 800,
            temperature: 0.5,
        })

        const answer = completion.choices[0]?.message?.content || 'I couldn\'t answer that question.'

        return res.status(200).json({ answer })

    } catch (error) {
        console.error('Book AI error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
