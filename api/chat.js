export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, systemPrompt } = req.body
  if (!messages || !systemPrompt) return res.status(400).json({ error: 'Missing fields' })

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 300,
        temperature: 0.92,
        presence_penalty: 0.5,
        frequency_penalty: 0.3
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })
    res.status(200).json({ reply: data.choices[0].message.content })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
}
