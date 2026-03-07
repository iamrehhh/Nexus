import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { word, context } = req.body

        if (!word) {
            return res.status(400).json({ error: 'Missing word' })
        }

        const contextLine = context ? `\nContext: "${context}"` : ''

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Define the word '${word}' clearly and concisely.${contextLine ? ' Tailor the definition to how it is used in the provided context.' : ''} Return a JSON object with these fields: { "definition": "2-3 sentences max", "partOfSpeech": "string", "simpleExplanation": "one casual sentence like explaining to a friend", "exampleSentence": "string" }. Return only the JSON, nothing else.`
                },
                {
                    role: 'user',
                    content: `Word: ${word}${contextLine}`
                }
            ],
            max_tokens: 300,
            temperature: 0.3,
        })

        const rawContent = completion.choices[0]?.message?.content || ''

        try {
            const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            const parsed = JSON.parse(cleaned)
            return res.status(200).json(parsed)
        } catch (parseErr) {
            return res.status(200).json({
                definition: rawContent || 'Definition not available',
                partOfSpeech: '',
                simpleExplanation: '',
                exampleSentence: '',
            })
        }

    } catch (error) {
        console.error('Define word error:', error)
        return res.status(200).json({
            definition: 'Definition not available',
            partOfSpeech: '',
            simpleExplanation: '',
            exampleSentence: '',
        })
    }
}
