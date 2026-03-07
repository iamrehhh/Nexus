export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, systemPrompt, maxTokens, detectMood } = req.body
  if (!messages || !systemPrompt) return res.status(400).json({ error: 'Missing fields' })

  try {
    let mood = null

    // Optional mood detection pre-call
    if (detectMood && messages.length > 0) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      if (lastUserMsg) {
        try {
          const moodRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{
                role: 'system',
                content: 'Respond with exactly ONE word. What is the emotional tone of this message? Choose from: happy, sad, anxious, angry, excited, romantic, confused, tired, neutral'
              }, {
                role: 'user',
                content: lastUserMsg.content
              }],
              max_tokens: 5,
              temperature: 0.3
            })
          })
          const moodData = await moodRes.json()
          mood = moodData.choices?.[0]?.message?.content?.trim().toLowerCase() || null
        } catch (e) {
          // Mood detection failed — proceed without it
        }
      }
    }

    // Inject mood into system prompt if detected
    let finalSystemPrompt = systemPrompt
    if (mood) {
      finalSystemPrompt += `\n\n## User's Current Emotional Tone: ${mood}\nAdjust your response accordingly — if they seem sad, be softer and more present. If happy, match their energy. If anxious, be calming. If romantic, lean into it. If angry, don't dismiss it — acknowledge it. If tired, be gentle and brief.`
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: finalSystemPrompt }, ...messages],
        max_tokens: maxTokens || 300,
        temperature: 0.92,
        presence_penalty: 0.5,
        frequency_penalty: 0.3
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })
    res.status(200).json({ reply: data.choices[0].message.content, mood })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
}
