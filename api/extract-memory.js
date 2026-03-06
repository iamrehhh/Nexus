export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { messages, existingFacts } = req.body
    if (!messages) return res.status(400).json({ error: 'Missing messages' })

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a memory extraction engine. Analyze the conversation and extract factual information about the USER (not the AI). Return a JSON array of short fact strings.

Extract things like:
- Their name, age, location, job, school
- Hobbies, interests, favorites (food, music, movies)
- Problems they mentioned, things they're stressed about
- Inside jokes or recurring themes
- People they mentioned (friends, family, ex)
- Their mood patterns, what makes them happy/sad
- Specific events or plans they mentioned

Existing facts (avoid duplicates): ${JSON.stringify(existingFacts || [])}

Return ONLY a valid JSON array of new fact strings. No explanation. Example: ["likes coffee", "stressed about exams", "has a sister named Sarah"]`
                    },
                    {
                        role: 'user',
                        content: messages.map(m => `${m.role}: ${m.content}`).join('\n')
                    }
                ],
                max_tokens: 500,
                temperature: 0.3
            })
        })

        const data = await response.json()
        if (data.error) return res.status(500).json({ error: data.error.message })

        let facts = []
        try {
            const raw = data.choices[0].message.content.trim()
            facts = JSON.parse(raw)
        } catch {
            facts = []
        }

        res.status(200).json({ facts })
    } catch (e) {
        res.status(500).json({ error: 'Server error' })
    }
}
