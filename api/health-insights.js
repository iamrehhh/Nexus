import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { userId, checkins, metricsConfig } = req.body

    if (!userId || !checkins || !metricsConfig || checkins.length < 3) {
        return res.status(400).json({ error: 'Missing required parameters or insufficient data (need 3 checkins)' })
    }

    try {
        // 1. Build a readable summary of the check-in data and metrics
        const metricsMap = metricsConfig.reduce((acc, m) => {
            acc[m.id] = { label: m.label, desc: m.description, type: m.type, unit: m.unit }
            return acc
        }, {})

        let configSummary = 'My tracked metrics are:\n'
        metricsConfig.forEach(m => {
            configSummary += `- ${m.label} (${m.type}${m.unit ? ` in ${m.unit}` : ''}): ${m.description}\n`
        })

        let checkinSummary = 'Recent Check-ins (Chronological order):\n'
        // Ensure chronological order
        const sortedCheckins = [...checkins].sort((a, b) => new Date(a.checkin_date) - new Date(b.checkin_date))
        sortedCheckins.forEach(c => {
            checkinSummary += `Date: ${c.checkin_date}\n`
            Object.entries(c.data).forEach(([key, value]) => {
                const m = metricsMap[key]
                if (m) {
                    checkinSummary += `  - ${m.label}: ${value} ${m.unit || ''}\n`
                }
            })
            if (c.mood_summary) checkinSummary += `  - Mood Summary: ${c.mood_summary}\n`
            if (c.notes) checkinSummary += `  - Notes: ${c.notes}\n`
        })

        // 2. Call GPT-4o mini
        const systemPrompt = `You are a thoughtful personal health analyst. Analyse the user's health check-in data and provide genuine, specific insights. Be honest, direct, and helpful. Never be generic. Reference specific numbers and patterns you actually see in the data. Keep your response concise — 3 to 5 short paragraphs maximum. No bullet point lists. No headers. Just plain honest analysis in a warm direct tone.`

        const userPrompt = `Here is my health check-in data for the past weeks:\n\n${checkinSummary}\n\n${configSummary}\n\nPlease analyse my patterns, note any correlations you notice between metrics, flag anything concerning, and give me 1-2 specific actionable suggestions based on what you actually see.`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 600,
        })

        const insightText = completion.choices[0].message.content.trim()

        // 3. Save the insight to health_insights table
        const { data: insightData, error } = await supabase
            .from('health_insights')
            .insert({
                user_id: userId,
                insight_text: insightText,
                insight_type: 'weekly'
            })
            .select('id, generated_at, insight_text')
            .single()

        if (error) throw error

        // 4. Return
        return res.status(200).json({
            insight: insightData.insight_text,
            generatedAt: insightData.generated_at
        })

    } catch (error) {
        console.error('Error generating health insight:', error)
        return res.status(500).json({ error: error.message })
    }
}
