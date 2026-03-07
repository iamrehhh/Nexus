export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' })

    try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'dall-e-3',
                prompt: `Soft aesthetic realistic photography style. No people, no faces, no text. ${prompt}`,
                n: 1,
                size: '1024x1024',
                quality: 'standard'
            })
        })

        const data = await response.json()
        if (data.error) return res.status(500).json({ error: data.error.message })
        res.status(200).json({ imageUrl: data.data[0].url, revisedPrompt: data.data[0].revised_prompt })
    } catch (e) {
        res.status(500).json({ error: 'Image generation failed' })
    }
}
