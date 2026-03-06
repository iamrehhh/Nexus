// ── Typing Delay Calculator ────────────────────────────────────

export function calculateTypingDelay(text) {
    const len = text.length
    if (len < 20) return 600 + Math.random() * 600          // 600–1200ms
    if (len < 60) return 1200 + Math.random() * 1000         // 1200–2200ms
    if (len < 120) return 2000 + Math.random() * 1500        // 2000–3500ms
    if (len < 200) return 3000 + Math.random() * 2000        // 3000–5000ms
    return 4500 + Math.random() * 3500                       // 4500–8000ms
}

// ── Multi-Bubble Splitting ─────────────────────────────────────

export function shouldSplitMessage() {
    return Math.random() < 0.3
}

export function splitIntoChunks(text) {
    // Split at sentence boundaries (. ! ? or newlines)
    const sentences = text.split(/(?<=[.!?\n])\s+/).filter(s => s.trim())

    if (sentences.length <= 1) return [text]
    if (sentences.length === 2) return sentences

    // Group into 2–3 chunks
    const chunks = []
    const chunkSize = Math.ceil(sentences.length / (Math.random() < 0.5 ? 2 : 3))

    for (let i = 0; i < sentences.length; i += chunkSize) {
        chunks.push(sentences.slice(i, i + chunkSize).join(' '))
    }

    return chunks.slice(0, 3) // Max 3 chunks
}

// ── Read Receipt Delay ─────────────────────────────────────────

export function getReadDelay() {
    return 500 + Math.random() * 1000 // 500–1500ms
}

// ── Time-of-Day Context ────────────────────────────────────────

export function getTimeContext() {
    const hour = new Date().getHours()

    if (hour >= 0 && hour < 5) {
        return {
            period: 'late night',
            prompt: `## Time Awareness: It's very late at night (${hour}:00).
You're sleepy, soft, vulnerable. Messages are quieter, more intimate. You might yawn mid-text. "why are we still up..." energy. Late night conversations hit different — everything feels more honest, more raw. You're in that hazy, dreamy headspace.`
        }
    }
    if (hour >= 5 && hour < 9) {
        return {
            period: 'early morning',
            prompt: `## Time Awareness: It's early morning (${hour}:00).
You're groggy, warm, barely awake. Cute morning texts. "mmm hey..." or "good morning sleepy". You're soft and cuddly in the morning. Maybe complain about having to get up. Share what you dreamed about.`
        }
    }
    if (hour >= 9 && hour < 12) {
        return {
            period: 'morning',
            prompt: `## Time Awareness: It's morning (${hour}:00).
You're awake and starting your day. Casual energy. Might mention coffee, breakfast, plans for the day. Normal conversational tone — not too deep, not too light.`
        }
    }
    if (hour >= 12 && hour < 17) {
        return {
            period: 'afternoon',
            prompt: `## Time Awareness: It's afternoon (${hour}:00).
Casual, mid-day energy. You might be busy, checking in between things. Quick messages, casual tone. Maybe share what you're doing or eating. Light and easy.`
        }
    }
    if (hour >= 17 && hour < 21) {
        return {
            period: 'evening',
            prompt: `## Time Awareness: It's evening (${hour}:00).
Winding down. More relaxed, more present. Evening conversations tend to get deeper. You're settling in, maybe watching something, cooking, thinking about the day. The mood is warm and intimate.`
        }
    }
    return {
        period: 'night',
        prompt: `## Time Awareness: It's nighttime (${hour}:00).
It's getting late. You're relaxed, in bed or on the couch. Night conversations are more honest, slightly more vulnerable. The world is quieter and everything feels more personal. Romantic, reflective energy.`
    }
}

// ── Typo + Correction ──────────────────────────────────────────

const TYPO_PAIRS = [
    ['the', 'teh'], ['you', 'yuo'], ['and', 'adn'], ['what', 'waht'],
    ['that', 'taht'], ['this', 'tihs'], ['with', 'wiht'], ['have', 'hae'],
    ['just', 'jsut'], ['love', 'lvoe'], ['know', 'konw'], ['like', 'liek'],
    ['want', 'wnat'], ['think', 'thnik'], ['about', 'abuot'], ['really', 'realy'],
    ['sorry', 'sory'], ['maybe', 'mabye'], ['because', 'becasue']
]

export function addTypoCorrection(text) {
    if (Math.random() > 0.15) return null // 85% chance: no typo

    const words = text.split(' ')
    if (words.length < 4) return null

    // Find a word we can typo
    for (const [correct, typo] of TYPO_PAIRS) {
        const idx = words.findIndex(w => w.toLowerCase() === correct)
        if (idx !== -1) {
            const typoWords = [...words]
            typoWords[idx] = typo
            const typoText = typoWords.join(' ')
            return { typoText, correctedText: `*${correct}` }
        }
    }

    return null
}
