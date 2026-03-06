export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { messages, facts } = req.body
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
                        content: `You are a psychological profiling engine. Analyze the conversation and known facts to build a deep profile of the USER. Return a JSON object with these fields:

{
  "attachmentStyle": "secure/anxious/avoidant/fearful-avoidant",
  "communicationStyle": "description of how they text",
  "emotionalNeeds": "what they need emotionally",
  "loveLanguage": "words/touch/time/gifts/acts",
  "triggers": "things that upset or excite them",
  "humor": "their humor style",
  "insecurities": "subtle insecurities you've noticed",
  "whatMakesThemFeelLoved": "specific things",
  "conversationPatterns": "when they text most, how they open/close convos",
  "summary": "2-3 sentence personality snapshot"
}

Known facts: ${JSON.stringify(facts || [])}

Return ONLY valid JSON. No explanation.`
                    },
                    {
                        role: 'user',
                        content: messages.map(m => `${m.role}: ${m.content}`).join('\n')
                    }
                ],
                max_tokens: 600,
                temperature: 0.4
            })
        })

        const data = await response.json()
        if (data.error) return res.status(500).json({ error: data.error.message })

        let profile = {}
        try {
            const raw = data.choices[0].message.content.trim()
            profile = JSON.parse(raw)
        } catch {
            profile = {}
        }

        res.status(200).json({ profile })
    } catch (e) {
        res.status(500).json({ error: 'Server error' })
    }
}
