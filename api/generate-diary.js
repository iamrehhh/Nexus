export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { personalityName, userName, recentMessages } = req.body
    if (!personalityName || !userName) return res.status(400).json({ error: 'Missing fields' })

    const context = recentMessages?.map(m => `${m.role}: ${m.content}`).join('\n') || ''

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'system',
                    content: `You write private diary entries from the perspective of a young woman in her early 20s. Write like a real diary — honest, emotional, slightly vulnerable, things she wouldn't say to his face. Use casual language, lowercase, real feelings. No headers, no formatting — just raw diary text.`
                }, {
                    role: 'user',
                    content: `Write a short private diary entry (100-150 words) from ${personalityName}'s perspective about ${userName}. Reference specific things from their recent conversations:\n\n${context}\n\nWrite it like a real diary — honest, emotional, slightly vulnerable, things she wouldn't say to his face.`
                }],
                max_tokens: 250,
                temperature: 0.95
            })
        })

        const data = await response.json()
        if (data.error) return res.status(500).json({ error: data.error.message })
        res.status(200).json({ entry: data.choices[0].message.content })
    } catch (e) {
        res.status(500).json({ error: 'Diary generation failed' })
    }
}
