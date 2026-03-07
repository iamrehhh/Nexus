// ── Audio Utilities ─────────────────────────────────────────────
// Voice synthesis, speech recognition, notification sounds

// ── Voice Selection ─────────────────────────────────────────────
const PREFERRED_VOICES = ['samantha', 'victoria', 'karen', 'alice', 'zira', 'google uk english female', 'google us english']

let cachedVoice = null

function getBestFeminineVoice() {
    if (cachedVoice) return cachedVoice
    const voices = window.speechSynthesis?.getVoices() || []
    if (voices.length === 0) return null

    // Try preferred voices first
    for (const pref of PREFERRED_VOICES) {
        const found = voices.find(v => v.name.toLowerCase().includes(pref))
        if (found) { cachedVoice = found; return found }
    }

    // Fallback: any English female-sounding voice
    const english = voices.filter(v => v.lang.startsWith('en'))
    const female = english.find(v =>
        /female|woman|girl|samantha|victoria|karen|alice|zira|fiona/i.test(v.name)
    )
    if (female) { cachedVoice = female; return female }

    // Last resort: first English voice
    cachedVoice = english[0] || voices[0]
    return cachedVoice
}

// Preload voices
if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => { cachedVoice = null; getBestFeminineVoice() }
    // Trigger voice loading
    window.speechSynthesis.getVoices()
}

// ── Text-to-Speech ──────────────────────────────────────────────
let currentUtterance = null

export function speakText(text, onStart, onEnd) {
    if (!window.speechSynthesis) return false

    // Stop any current speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const voice = getBestFeminineVoice()
    if (voice) utterance.voice = voice

    utterance.rate = 0.92
    utterance.pitch = 1.15
    utterance.volume = 0.85

    utterance.onstart = () => onStart?.()
    utterance.onend = () => { currentUtterance = null; onEnd?.() }
    utterance.onerror = () => { currentUtterance = null; onEnd?.() }

    currentUtterance = utterance
    window.speechSynthesis.speak(utterance)
    return true
}

export function stopSpeaking() {
    window.speechSynthesis?.cancel()
    currentUtterance = null
}

export function isSpeaking() {
    return window.speechSynthesis?.speaking || false
}

export function isSpeechSynthesisSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// ── Speech Recognition ──────────────────────────────────────────
let recognition = null

export function isSpeechRecognitionSupported() {
    if (typeof window === 'undefined') return false
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function startListening(onResult, onError, onEnd) {
    if (!isSpeechRecognitionSupported()) return false

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        onResult?.(transcript)
    }

    recognition.onerror = (event) => {
        if (event.error !== 'no-speech') onError?.(event.error)
    }

    recognition.onend = () => {
        recognition = null
        onEnd?.()
    }

    recognition.start()
    return true
}

export function stopListening() {
    recognition?.stop()
    recognition = null
}

export function isListening() {
    return recognition !== null
}

// ── Notification Sounds (Web Audio API) ─────────────────────────
let audioCtx = null

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioCtx
}

function playTone(frequency, duration, type = 'sine', volume = 0.15) {
    if (document.hidden) return // Respect system mute / tab visibility

    try {
        const ctx = getAudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = type
        osc.frequency.setValueAtTime(frequency, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, ctx.currentTime + duration * 0.3)
        osc.frequency.exponentialRampToValueAtTime(frequency * 0.8, ctx.currentTime + duration)

        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + duration)
    } catch (e) {
        // Audio not available — fail silently
    }
}

export function playReplyChime() {
    // Soft gentle chime — two ascending tones
    playTone(523.25, 0.15, 'sine', 0.1)  // C5
    setTimeout(() => playTone(659.25, 0.25, 'sine', 0.08), 100) // E5
}

export function playInitiationChime() {
    // Warmer tone — three gentle notes
    playTone(440, 0.12, 'sine', 0.08)     // A4
    setTimeout(() => playTone(523.25, 0.12, 'sine', 0.08), 80)  // C5
    setTimeout(() => playTone(659.25, 0.3, 'sine', 0.06), 170)  // E5
}
