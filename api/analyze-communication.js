export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { messages, existingProfile } = req.body
    if (!messages || messages.length < 5) return res.status(400).json({ error: 'Not enough messages' })

    try {
        const userMessages = messages
            .filter(m => m.role === 'user')
            .map(m => m.content)
            .join('\n')

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
                    content: `You are a communication analyst. Analyze the user's messages and identify their communication patterns. Return ONLY valid JSON with these fields:
{
  "humor_style": "brief description of what kind of humor makes them laugh or engage (dry, absurd, self-deprecating, witty, physical, dark, etc)",
  "engaging_topics": "what topics genuinely engage them — not just what they mention but what they light up about",
  "communication_style": "how they communicate — deep/casual/playful/intellectual/emotional/minimal/chaotic/etc",
  "emotional_tone": "what emotional energy they typically bring — warm/guarded/anxious/confident/melancholic/upbeat/etc",
  "needs": "what they seem to need from this conversation — validation/challenge/comfort/stimulation/connection/escape/fun/etc",
  "responsiveness": "how they respond to different approaches — do they open up more with teasing, with depth, with humor, with directness?"
}
Be specific and observational. Not generic. Based on what you actually see in their messages.`
                }, {
                    role: 'user',
                    content: `Here are the user's recent messages:\n\n${userMessages}\n\n${existingProfile ? `Previous analysis: ${JSON.stringify(existingProfile)}\nUpdate or refine based on new messages.` : 'First analysis — build from scratch.'}`
                }],
                max_tokens: 300,
                temperature: 0.4,
                response_format: { type: 'json_object' }
            })
        })

        const data = await response.json()
        if (data.error) return res.status(500).json({ error: data.error.message })

        try {
            const profile = JSON.parse(data.choices[0].message.content)
            return res.status(200).json({ profile })
        } catch (e) {
            return res.status(500).json({ error: 'Invalid JSON from analysis' })
        }
    } catch (e) {
        res.status(500).json({ error: 'Analysis failed' })
    }
}
