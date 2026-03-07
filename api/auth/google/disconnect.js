import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        await supabase.from('connected_services').delete().eq('user_id', userId).in('service_name', ['gmail', 'google-calendar'])
        await supabase.from('service_cache').delete().eq('user_id', userId).in('service_name', ['gmail', 'google-calendar'])
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}
