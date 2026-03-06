export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { imageBase64, mimeType, prompt } = req.body
  if (!imageBase64) return res.status(400).json({ error: 'Missing image' })

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
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: prompt || 'Describe the personality, tone, and texting style visible in this image. Extract any patterns about how this person communicates.' }
          ]
        }],
        max_tokens: 500
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })
    res.status(200).json({ analysis: data.choices[0].message.content })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
}
