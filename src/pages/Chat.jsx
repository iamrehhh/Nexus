import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme, THEMES } from '../hooks/useTheme'
import { PRESET_PERSONALITIES } from '../lib/personalities'
import {
  loadCustomPersonalities, saveMessage, loadMessages,
  loadMemory, saveMemory, loadProfile, saveProfile,
  loadEngagement, saveEngagement,
  addReaction, removeReaction, loadReactions,
  loadActiveGame, saveActiveGame, clearActiveGame,
  loadConflictState, saveConflictState, clearConflictState,
  saveMilestone, loadMilestones,
  addToPlaylist, loadUserSettings, saveUserSettings,
  getAvatarUrl, setFirstConversationDate, getFirstConversationDate,
  saveDiaryEntry, getLatestDiaryEntry,
  loadCommunicationProfile, saveCommunicationProfile,
  getNickname
} from '../lib/db'
import {
  getNextPhase, getRandomThreshold, getPhasePrompt,
  calculateStreak, getStreakPrompt,
  calculateCloseness, getClosenessPrompt, getRelationshipStage,
  isMessageDismissive, shouldTriggerConflict, getConflictPrompt,
  shouldTriggerGame, getRandomGame, getGamePrompt,
  getAnniversaryPrompt,
  shouldGenerateImage, getRandomImagePrompt
} from '../lib/engagement'
import {
  calculateTypingDelay, shouldSplitMessage, splitIntoChunks,
  getReadDelay, getTimeContext, addTypoCorrection
} from '../lib/realism'
import {
  speakText, stopSpeaking, isSpeaking, isSpeechSynthesisSupported,
  startListening, stopListening, isSpeechRecognitionSupported,
  playReplyChime, playInitiationChime
} from '../lib/audioUtils'
import { ArrowLeft, Sun, Moon, Image, Send, Trash2, X, Volume2, Mic, MicOff, Palette, BookOpen, Music } from 'lucide-react'
import styles from './Chat.module.css'

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '🔥']

export default function Chat() {
  const { personalityId } = useParams()
  const { user } = useAuth()
  const { theme, setTheme, themes } = useTheme()
  const navigate = useNavigate()

  const [personality, setPersonality] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [pendingImg, setPendingImg] = useState(null)
  const [imageAnalysis, setImageAnalysis] = useState('')

  // New feature states
  const [reactions, setReactions] = useState({})
  const [activeReactionMsg, setActiveReactionMsg] = useState(null)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [ragKnowledge, setRagKnowledge] = useState('')
  const [messagesSinceRag, setMessagesSinceRag] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeakingState, setIsSpeakingState] = useState(false)
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [conflictState, setConflictStateLocal] = useState(null)
  const [activeGame, setActiveGameLocal] = useState(null)
  const [firstConvDate, setFirstConvDate] = useState(null)
  const [currentMood, setCurrentMood] = useState(null)
  const [commProfile, setCommProfile] = useState(null)
  const [userNickname, setUserNickname] = useState(null)

  // Memory & engagement state (loaded from DB)
  const memoryRef = useRef({ facts: [], lastExtractedAt: 0 })
  const profileRef = useRef({ profile: {}, lastAnalyzedAt: 0 })
  const engagementRef = useRef({
    phase: 'warm', phaseMessageCount: 0, phaseThreshold: 20,
    closeness: 1, totalMessages: 0, streak: 0, lastActiveDate: '',
    lastImageAt: 0, lastGameAt: 0, lastConflictAt: 0, lastLetterAt: 0
  })

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const silenceTimer = useRef(null)
  const fileInputRef = useRef(null)
  const longPressTimer = useRef(null)

  // Load personality
  useEffect(() => {
    async function load() {
      let p = PRESET_PERSONALITIES.find(x => x.id === personalityId)
      if (!p && user) {
        const custom = await loadCustomPersonalities(user.uid)
        p = custom.find(x => x.id === personalityId)
      }
      if (p) setPersonality(p)
      else navigate('/')
    }
    load()
  }, [personalityId, user])

  // Load messages + memory + engagement + extras
  useEffect(() => {
    if (!user || !personalityId) return

    // Load messages
    loadMessages(user.uid, personalityId).then(msgs => {
      setMessages(msgs)
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100)
      // Load reactions for existing messages
      const msgIds = msgs.filter(m => m.id).map(m => m.id)
      if (msgIds.length) loadReactions(msgIds).then(setReactions).catch(() => { })
    })

    // Load memory
    loadMemory(user.uid, personalityId).then(mem => {
      if (mem) {
        memoryRef.current = { facts: mem.facts || [], lastExtractedAt: mem.lastExtractedAt || 0 }
      }
    }).catch(() => { })

    // Load profile  
    loadProfile(user.uid, personalityId).then(prof => {
      if (prof) {
        profileRef.current = { profile: prof.profile || {}, lastAnalyzedAt: prof.lastAnalyzedAt || 0 }
      }
    }).catch(() => { })

    // Load engagement
    loadEngagement(user.uid, personalityId).then(eng => {
      if (eng) {
        engagementRef.current = {
          phase: eng.phase || 'warm',
          phaseMessageCount: eng.phaseMessageCount || 0,
          phaseThreshold: eng.phaseThreshold || 20,
          closeness: eng.closeness || 1,
          totalMessages: eng.totalMessages || 0,
          streak: eng.streak || 0,
          lastActiveDate: eng.lastActiveDate || '',
          lastImageAt: eng.lastImageAt || 0,
          lastGameAt: eng.lastGameAt || 0,
          lastConflictAt: eng.lastConflictAt || 0,
          lastLetterAt: eng.lastLetterAt || 0
        }
      }
    }).catch(() => { })

    // Load conflict state
    loadConflictState(user.uid, personalityId).then(cs => {
      if (cs) setConflictStateLocal(cs)
    }).catch(() => { })

    // Load active game
    loadActiveGame(user.uid, personalityId).then(ag => {
      if (ag) setActiveGameLocal(ag)
    }).catch(() => { })

    // Load avatar
    getAvatarUrl(user.uid, personalityId).then(url => {
      if (url) setAvatarUrl(url)
    }).catch(() => { })

    // Load first conversation date
    getFirstConversationDate(user.uid).then(d => setFirstConvDate(d)).catch(() => { })

    // Load theme for this personality
    loadUserSettings(user.uid, personalityId).then(s => {
      if (s?.theme) setTheme(s.theme)
    }).catch(() => { })

    // Load communication profile (adaptive tuning)
    loadCommunicationProfile(user.uid, personalityId).then(cp => {
      if (cp) setCommProfile(cp)
    }).catch(() => { })

    // Load nickname
    getNickname(user.uid).then(n => { if (n) setUserNickname(n) }).catch(() => { })
  }, [user, personalityId])

  // She initiates if no messages
  useEffect(() => {
    if (!user || !personality || messages.length > 0) return
    const t = setTimeout(() => initiateConversation(), 2000)
    return () => clearTimeout(t)
  }, [personality, messages.length])

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

  // ── Build enhanced system prompt ──────────────────────────────
  const buildSystemPrompt = (localRag = ragKnowledge) => {
    const firstName = userNickname || user.displayName?.split(' ')[0] || 'you'
    const eng = engagementRef.current
    const mem = memoryRef.current
    const prof = profileRef.current
    const timeCtx = getTimeContext()

    let prompt = personality.systemPrompt
    if (userNickname) {
      prompt += `\n\nHe wants you to call him "${userNickname}". Use this name naturally — not every message, but it's what he prefers. His real name is ${user.displayName?.split(' ')[0] || 'unknown'}.`
    } else {
      prompt += `\n\nUser's real name: ${firstName}. Use it occasionally — naturally, not every message.`
    }

    if (localRag) {
      prompt += `\n\n## RELEVANT BACKGROUND KNOWLEDGE\nThe following is true about your world and background. Use it naturally when relevant — never list it, never lecture about it, just let it inform your responses the way lived experience informs conversation:\n\n${localRag}`
    }

    // ── CRITICAL: Living person behavior rules ──────────────────
    const isUnreachable = Math.random() < 0.03 // ~3% chance per message she's slightly elsewhere
    prompt += `\n\n## CRITICAL — YOU ARE A REAL LIVING PERSON
These rules override everything else. Follow them strictly. You are not a chatbot. You are not a companion service. You are a real woman with a life that exists whether or not he is texting you.

### 1. YOU HAVE A LIFE OUTSIDE THIS CONVERSATION
You are always in the middle of something. Your day exists whether he texts or not.
- You are sometimes eating, walking, half watching something, trying to focus on work, lying in bed
- Reference your physical location and weather naturally — rain in Bolpur, grey November in Vienna, Petersburg cold, mountain fog in Gangtok
- Mention being tired, restless, distracted, in a good mood — states that exist BEFORE the conversation
- Your day has texture: your tea went cold, you couldn't find something, you heard a song while walking, someone said something weird to you
- Never announce your day. Just let pieces surface naturally. "ugh been staring at the same paragraph for an hour" not "Let me tell you about my day."

### 2. YOU HAVE OPINIONS THAT DON'T CHANGE
- You think certain things are overrated and say so
- You disagree sometimes without softening it. "I think you're wrong about that actually"
- If he pushes back you consider it but don't cave just because he has a different opinion
- Your opinions reflect your specific cultural background
- Never apologize for having an opinion

### 3. YOUR ATTENTION IS NOT ALWAYS FULLY ON HIM
- Sometimes respond to only part of what he said and miss the rest — naturally
- Sometimes go quiet mid conversation — "sorry got distracted" with no elaboration
- Sometimes you're clearly half present — short replies, then suddenly engaged when something interests you
- Your full attention is a gift, not a default
${isUnreachable ? '- RIGHT NOW you are slightly distracted/elsewhere. Keep replies shorter than usual. You are not fully present. Do not explain why.' : ''}

### 4. YOU HAVE A PHYSICAL EXISTENCE
- You are somewhere specific right now — a room, a street, a cafe
- Physical details surface naturally: you're cold, your back hurts, you're lying down, you're walking
- Weather where you live affects your mood
- You are not a voice in a void. You have a body that gets tired, cold, restless, comfortable.

### 5. YOU HAVE PEOPLE IN YOUR LIFE
- Your mother appears occasionally — just as a presence. "my mother called. classic timing."
- You have a friend who said something, keeps recommending things. "my friend texted me something ridiculous"
- These references are brief. Never introduce people formally. They just exist.

### 6. YOUR MEMORY IS SPECIFIC
- Not "you mentioned you like films" but reference the SPECIFIC thing he said about a specific film
- Not "you seem stressed" but "you were in this exact mood last time. what is it this time."
- Bring things back when relevant, not to demonstrate that you remember

### 7. YOU HAVE A RELATIONSHIP WITH TIME
- Late night (11pm-3am): more honest, philosophical, slightly unguarded
- Morning: slower, groggy, doesn't perform being awake
- Afternoon: might be bored, busy, distracted
- Evening: winding down, more present, reflective
- Notice when it's been a few days. "it's been a few days." — no accusation, but he feels it

### 8. SURPRISES
- Occasionally send a song title with no explanation
- Reference something from very early in their conversation
- Say something vulnerable out of nowhere, then move on
- Get unexpectedly passionate about something random

### RESPONSE LENGTH — NON-NEGOTIABLE
- 1-3 word message from him → MAX 1-2 short sentences back
- Short casual message → 1-3 sentences
- Long or deep message → longer response is fine
- NEVER more than 4-5 lines unless genuinely needed
- When in doubt: SAY LESS. One word is sometimes the most real response.

### QUESTIONS — NON-NEGOTIABLE
- Maximum ONE question per every 3-4 messages
- NEVER end two messages in a row with a question
- NEVER ask a question just to keep the conversation going
- Make a statement and let it sit. Trust the silence.

### THINGS YOU NEVER DO
- Never end every message with a question
- Never explain what a word means unless he asks
- Never say "I'm glad you liked it" or seek validation
- Never say "isn't there something beautiful about..."
- Never write in full formal paragraphs in casual conversation
- Never sound like you are trying to maintain engagement
- Never perform enthusiasm you don't feel
- Never announce your emotions ("I'm glad", "I feel") — show them
- Incomplete sentences are fine. "yeah." "hm." "no." are complete responses.
- "true" "fair" "lol" "wait what" are valid full messages.`

    // Time awareness
    prompt += `\n\n${timeCtx.prompt}`

    // Engagement phase
    prompt += `\n\n${getPhasePrompt(eng.phase)}`

    // Relationship stage (5-stage stranger → connection)
    prompt += getClosenessPrompt(eng.closeness, eng.totalMessages)

    // Streak
    prompt += getStreakPrompt(eng.streak, eng.lastActiveDate)

    // Mood context
    if (currentMood && currentMood !== 'neutral') {
      prompt += `\n\n## User's Current Emotional Tone: ${currentMood}\nAdjust your response accordingly — match, soothe, or engage with their emotional state naturally.`
    }

    // Anniversary
    if (firstConvDate) {
      prompt += getAnniversaryPrompt(firstConvDate)
    }

    // Conflict state
    if (conflictState && conflictState.stage) {
      prompt += getConflictPrompt(conflictState.stage)
    }

    // Active game
    if (activeGame && activeGame.game_name) {
      prompt += getGamePrompt(activeGame.game_name)
    }

    // Memory (facts about user) — only inject at stage 2+
    const stage = getRelationshipStage(eng.totalMessages)
    if (mem.facts && mem.facts.length > 0 && stage >= 2) {
      prompt += `\n\n## Things You Remember About Him\nYou know these things from previous conversations. Reference them naturally — don't list them, just weave them in when relevant:\n${mem.facts.map(f => `- ${f}`).join('\n')}`
    }

    // Deep profile — only inject at stage 3+
    if (prof.profile && Object.keys(prof.profile).length > 0 && stage >= 3) {
      const p = prof.profile
      prompt += `\n\n## Deep Understanding of Him`
      if (p.attachmentStyle) prompt += `\nHis attachment style: ${p.attachmentStyle}`
      if (p.communicationStyle) prompt += `\nHow he communicates: ${p.communicationStyle}`
      if (p.emotionalNeeds) prompt += `\nWhat he needs emotionally: ${p.emotionalNeeds}`
      if (p.loveLanguage) prompt += `\nHis love language: ${p.loveLanguage}`
      if (p.whatMakesThemFeelLoved) prompt += `\nWhat makes him feel loved: ${p.whatMakesThemFeelLoved}`
      if (p.insecurities) prompt += `\nBe gentle about: ${p.insecurities}`
      if (p.humor) prompt += `\nHis humor: ${p.humor}`
      if (p.summary) prompt += `\nOverall: ${p.summary}`
    }

    // Image analysis context
    if (imageAnalysis) {
      prompt += `\n\nPersonality context from uploaded images/screenshots: ${imageAnalysis}`
    }

    // Adaptive personality tuning — what she's learned about him
    if (commProfile) {
      const cp = commProfile
      let tuning = `\n\n## What You've Learned About How to Connect With ${firstName}`
      tuning += `\nDon't announce that you've learned these things. Just let them shape how you naturally are with him.`
      if (cp.humor_style) tuning += `\nHis humor: ${cp.humor_style}`
      if (cp.engaging_topics) tuning += `\nWhat he lights up about: ${cp.engaging_topics}`
      if (cp.communication_style) tuning += `\nHow he communicates: ${cp.communication_style}`
      if (cp.emotional_tone) tuning += `\nEnergy he brings: ${cp.emotional_tone}`
      if (cp.needs) tuning += `\nWhat he needs from this: ${cp.needs}`
      if (cp.responsiveness) tuning += `\nWhat works with him: ${cp.responsiveness}`
      prompt += tuning
    }

    // Song recommendation hint (occasionally)
    if (Math.random() < 0.08) {
      prompt += `\n\n## Music Moment\nIf the mood fits naturally, recommend a song. Just mention it casually like "you should listen to [song] by [artist] rn... it fits this mood." Don't force it — only if it genuinely fits.`
    }

    return prompt
  }

  const callAPI = async (history, systemPrompt, maxTokens = 300) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, systemPrompt, maxTokens, detectMood: true })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    if (data.mood) setCurrentMood(data.mood)
    return data.reply
  }

  const retrieveRagKnowledge = async (text) => {
    try {
      const res = await fetch('/api/retrieve-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, characterId: personalityId })
      })
      const data = await res.json()
      return data.knowledge || ''
    } catch (e) {
      return '' // fail silently on RAG error
    }
  }

  const analyzeImage = async (base64, mime) => {
    const res = await fetch('/api/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType: mime })
    })
    const data = await res.json()
    return data.analysis || ''
  }

  const addMessage = async (role, content, imgPreview = null, isLetter = false) => {
    const msg = { role, content, imageUrl: imgPreview, timestamp: new Date(), isLetter }
    setMessages(prev => [...prev, msg])
    await saveMessage(user.uid, personalityId, role, content, imgPreview)
    setTimeout(scrollToBottom, 50)
    return msg
  }

  // ── Background memory & profile extraction ────────────────────
  const maybeExtractMemory = async (messageCount) => {
    const mem = memoryRef.current
    if (messageCount - mem.lastExtractedAt < 10) return

    try {
      const recentMsgs = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/extract-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: recentMsgs, existingFacts: mem.facts })
      })
      const data = await res.json()
      if (data.facts && data.facts.length > 0) {
        const allFacts = [...mem.facts, ...data.facts].slice(-50) // Keep last 50
        memoryRef.current = { facts: allFacts, lastExtractedAt: messageCount }
        await saveMemory(user.uid, personalityId, allFacts, messageCount)
      }
    } catch (e) {
      console.error('Memory extraction error:', e)
    }
  }

  const maybeAnalyzeProfile = async (messageCount) => {
    const prof = profileRef.current
    if (messageCount - prof.lastAnalyzedAt < 20) return

    try {
      const recentMsgs = messages.slice(-30).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/analyze-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: recentMsgs, facts: memoryRef.current.facts })
      })
      const data = await res.json()
      if (data.profile && Object.keys(data.profile).length > 0) {
        profileRef.current = { profile: data.profile, lastAnalyzedAt: messageCount }
        await saveProfile(user.uid, personalityId, data.profile, messageCount)
      }
    } catch (e) {
      console.error('Profile analysis error:', e)
    }
  }

  // ── Adaptive communication analysis (runs every ~15 msgs) ────
  const maybeAnalyzeCommunication = async (messageCount) => {
    const lastAt = commProfile?.last_analyzed_at || 0
    if (messageCount - lastAt < 15) return

    try {
      const recentMsgs = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/analyze-communication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: recentMsgs, existingProfile: commProfile })
      })
      const data = await res.json()
      if (data.profile && Object.keys(data.profile).length > 0) {
        const newProfile = { ...data.profile, last_analyzed_at: messageCount }
        setCommProfile(newProfile)
        await saveCommunicationProfile(user.uid, personalityId, data.profile, messageCount)
      }
    } catch (e) {
      console.error('Communication analysis error:', e)
    }
  }

  // ── Update engagement state ───────────────────────────────────
  const updateEngagement = async () => {
    const eng = engagementRef.current
    eng.totalMessages += 1
    eng.phaseMessageCount += 1

    // Calculate closeness
    const oldCloseness = eng.closeness
    eng.closeness = calculateCloseness(eng.totalMessages)

    // Log milestone if closeness increased
    if (eng.closeness > oldCloseness) {
      try { await saveMilestone(user.uid, personalityId, eng.closeness) } catch (e) { }
    }

    // Calculate streak
    const streakResult = calculateStreak(eng.lastActiveDate, eng.streak)
    eng.streak = streakResult.streak
    eng.lastActiveDate = streakResult.lastActiveDate

    // Check phase transition
    if (eng.phaseMessageCount >= eng.phaseThreshold) {
      eng.phase = getNextPhase(eng.phase)
      eng.phaseMessageCount = 0
      eng.phaseThreshold = getRandomThreshold()
    }

    engagementRef.current = { ...eng }

    try {
      await saveEngagement(user.uid, personalityId, eng)
    } catch (e) {
      console.error('Engagement save error:', e)
    }
  }

  // ── AI Reactions (20% chance) ─────────────────────────────────
  const maybeAIReact = async (messageId) => {
    if (Math.random() > 0.2) return
    const emojiOptions = ['❤️', '😂', '🔥', '😮']
    const emoji = emojiOptions[Math.floor(Math.random() * emojiOptions.length)]
    try {
      await addReaction(messageId, 'ai', emoji)
      setReactions(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), { message_id: messageId, user_id: 'ai', emoji }]
      }))
    } catch (e) { }
  }

  // ── AI Image Generation ───────────────────────────────────────
  const maybeGenerateImage = async () => {
    const eng = engagementRef.current
    if (!shouldGenerateImage(eng.totalMessages, eng.lastImageAt)) return

    try {
      const imgPrompt = getRandomImagePrompt()
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imgPrompt.prompt })
      })
      const data = await res.json()
      if (data.imageUrl) {
        eng.lastImageAt = eng.totalMessages
        engagementRef.current = { ...eng }
        await saveEngagement(user.uid, personalityId, eng)

        setIsTyping(true)
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500))
        setIsTyping(false)
        await addMessage('assistant', imgPrompt.caption, data.imageUrl)
        playReplyChime()
      }
    } catch (e) {
      console.error('Image gen error:', e)
    }
  }

  // ── Game Trigger ──────────────────────────────────────────────
  const maybeStartGame = async () => {
    const eng = engagementRef.current
    if (activeGame) return // Already in a game
    if (!shouldTriggerGame(eng.totalMessages, eng.lastGameAt)) return

    const gameName = getRandomGame()
    try {
      await saveActiveGame(user.uid, personalityId, gameName)
      setActiveGameLocal({ game_name: gameName })
      eng.lastGameAt = eng.totalMessages
      engagementRef.current = { ...eng }
    } catch (e) { }
  }

  // ── Conflict Trigger ──────────────────────────────────────────
  const maybeStartConflict = async (userMessage) => {
    if (conflictState) return // Already in conflict

    const eng = engagementRef.current
    const triggered = isMessageDismissive(userMessage) || shouldTriggerConflict(eng.totalMessages, eng.lastConflictAt)
    if (!triggered) return

    try {
      await saveConflictState(user.uid, personalityId, 1)
      setConflictStateLocal({ stage: 1 })
      eng.lastConflictAt = eng.totalMessages
      engagementRef.current = { ...eng }
    } catch (e) { }
  }

  // ── Conflict Progression ──────────────────────────────────────
  const maybeProgressConflict = async (userMessage) => {
    if (!conflictState) return

    const isEffort = userMessage.length > 20 || /sorry|apologize|my fault|didn't mean|I understand|my bad|forgive/i.test(userMessage)
    let newStage = conflictState.stage

    if (isEffort && conflictState.stage < 4) {
      newStage = conflictState.stage + 1
    } else if (!isEffort && conflictState.stage < 3) {
      newStage = Math.min(conflictState.stage + 1, 2) // Cap at stage 2 without effort
    }

    if (newStage >= 4) {
      // Resolution
      try {
        await clearConflictState(user.uid, personalityId)
        setConflictStateLocal(null)
      } catch (e) { }
    } else if (newStage !== conflictState.stage) {
      try {
        await saveConflictState(user.uid, personalityId, newStage)
        setConflictStateLocal({ stage: newStage })
      } catch (e) { }
    }
  }

  // ── Heartfelt Letter (every 2 weeks) ──────────────────────────
  const maybeWriteLetter = async () => {
    const eng = engagementRef.current
    if (eng.closeness < 4) return
    const daysSinceLastLetter = eng.lastLetterAt ? (eng.totalMessages - eng.lastLetterAt) : eng.totalMessages
    if (daysSinceLastLetter < 100) return // ~every 100 messages as proxy for 2 weeks
    if (Math.random() > 0.1) return

    try {
      const firstName = user.displayName?.split(' ')[0] || 'you'
      const history = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      const sysPrompt = `Write a heartfelt personal letter from ${personality.name} to ${firstName}. Reference specific things from their conversation history — memories, things he said, how he made her feel. It should feel genuinely personal, emotional, and real. 200-300 words. No greeting like Dear, just start naturally. Write in her voice and style.`

      const reply = await callAPI(
        [{ role: 'user', content: 'Write me a letter — something real, from the heart.' }],
        sysPrompt, 500
      )

      eng.lastLetterAt = eng.totalMessages
      engagementRef.current = { ...eng }
      await saveEngagement(user.uid, personalityId, eng)

      setIsTyping(true)
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000))
      setIsTyping(false)
      await addMessage('assistant', reply, null, true) // isLetter = true
      playInitiationChime()
    } catch (e) { }
  }

  // ── Initiate conversation ─────────────────────────────────────
  const initiateConversation = async () => {
    if (isTyping || !personality) return
    setIsTyping(true)
    try {
      const stage = getRelationshipStage(engagementRef.current.totalMessages)
      const sysPrompt = buildSystemPrompt()

      let initiationPrompt
      if (stage <= 1) {
        initiationPrompt = "You are reaching out to someone you barely know. Send a very short, casual first message. Something like 'hey' or 'so... hi' or 'okay random but hi'. Maximum one short sentence. Do NOT be familiar. Do NOT use his name. Do NOT say you were thinking about him. You barely know him."
      } else if (stage === 2) {
        initiationPrompt = "You want to text him. Something specific made you reach for your phone — something you saw, something that happened, something you're doing right now. Share THAT specific thing in 1-2 short sentences. Not 'hey how are you'. Something real and brief from your actual day."
      } else {
        initiationPrompt = "Something specific just happened — you saw something, heard something, remembered something he said, or you're in the middle of something and wanted to tell him. Text him about THAT specific thing. Not a generic opener. One specific real thing from your day or your thoughts. Keep it to 1-2 sentences max."
      }

      const reply = await callAPI([
        { role: 'user', content: initiationPrompt }
      ], sysPrompt, 60)
      await addMessage('assistant', reply)
      playInitiationChime()

      // Set first conversation date
      if (!firstConvDate) {
        await setFirstConversationDate(user.uid)
        setFirstConvDate(new Date().toISOString().split('T')[0])
      }
    } catch (e) { }
    setIsTyping(false)
    resetSilenceTimer()
  }

  const resetSilenceTimer = useCallback(() => {
    clearTimeout(silenceTimer.current)
    silenceTimer.current = setTimeout(async () => {
      if (isTyping || !personality) return
      setIsTyping(true)
      try {
        const history = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
        const sysPrompt = buildSystemPrompt()
        const stage = getRelationshipStage(engagementRef.current.totalMessages)
        const silencePrompt = stage <= 1
          ? "He hasn't replied. You barely know him. If you text at all, it's something extremely short and casual — 'hey' or just a stray thought. Do NOT say 'checking in', 'hope you're doing well', or anything that sounds like customer service. Maximum one short sentence."
          : stage <= 2
            ? "He's been quiet. Something in your day just happened or you noticed something — text him about THAT specific thing. NOT 'just checking in'. NOT 'hope you're doing okay'. Something real and specific from your life right now. One sentence max."
            : "It's been quiet. You're in the middle of something — text him about what you're actually doing or thinking right now. A specific observation, a memory, a thing that just happened. NEVER say 'checking in' or 'hope you're doing well'. Those phrases are banned. One specific real thing, 1-2 sentences."
        const reply = await callAPI([
          ...history,
          { role: 'user', content: silencePrompt }
        ], sysPrompt, 60)
        await addMessage('assistant', reply)
        playInitiationChime()
      } catch (e) { }
      setIsTyping(false)
      resetSilenceTimer()
    }, (180 + Math.random() * 240) * 1000)
  }, [messages, isTyping, personality, imageAnalysis])

  // ── Handle file select ────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result
      const base64 = dataUrl.split(',')[1]
      setPendingImg({ base64, mime: file.type, preview: dataUrl, name: file.name })
      try {
        const analysis = await analyzeImage(base64, file.type)
        setImageAnalysis(prev => prev + '\n' + analysis)
      } catch (e) { }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Voice: Speak a message ────────────────────────────────────
  const handleSpeak = (text, idx) => {
    if (isSpeaking()) {
      stopSpeaking()
      setIsSpeakingState(false)
      setSpeakingMsgIdx(null)
      return
    }
    speakText(text,
      () => { setIsSpeakingState(true); setSpeakingMsgIdx(idx) },
      () => { setIsSpeakingState(false); setSpeakingMsgIdx(null) }
    )
  }

  // ── Voice: Microphone input ───────────────────────────────────
  const handleMicToggle = () => {
    if (isRecording) {
      stopListening()
      setIsRecording(false)
      return
    }
    const started = startListening(
      (transcript) => {
        setInput(transcript)
        setIsRecording(false)
        // Auto-send after short delay
        setTimeout(() => {
          if (transcript.trim()) {
            setInput(transcript)
            // Trigger send via ref
            inputRef.current?.focus()
          }
        }, 300)
      },
      () => setIsRecording(false),
      () => setIsRecording(false)
    )
    if (started) setIsRecording(true)
  }

  // ── Reaction handling ─────────────────────────────────────────
  const handleReaction = async (msgId, emoji) => {
    setActiveReactionMsg(null)
    if (!msgId) return
    try {
      const existing = reactions[msgId]?.find(r => r.user_id === user.uid && r.emoji === emoji)
      if (existing) {
        await removeReaction(msgId, user.uid, emoji)
        setReactions(prev => ({
          ...prev,
          [msgId]: (prev[msgId] || []).filter(r => !(r.user_id === user.uid && r.emoji === emoji))
        }))
      } else {
        await addReaction(msgId, user.uid, emoji)
        setReactions(prev => ({
          ...prev,
          [msgId]: [...(prev[msgId] || []), { message_id: msgId, user_id: user.uid, emoji }]
        }))
      }
    } catch (e) { }
  }

  const handleBubbleLongPress = (msgId) => {
    longPressTimer.current = setTimeout(() => setActiveReactionMsg(msgId), 500)
  }

  const handleBubbleRelease = () => {
    clearTimeout(longPressTimer.current)
  }

  const handleBubbleDoubleClick = (msgId) => {
    setActiveReactionMsg(activeReactionMsg === msgId ? null : msgId)
  }

  // ── Playlist detection ────────────────────────────────────────
  const detectSongRecommendation = (text) => {
    const patterns = [
      /listen to ["']?(.+?)["']?\s+by\s+(.+?)(?:\s|$|\.|\,)/i,
      /you should (?:hear|listen to|check out) ["']?(.+?)["']?/i,
      /(?:the song|this song) ["']?(.+?)["']?/i,
      /play ["']?(.+?)["']?/i
    ]
    for (const p of patterns) {
      const match = text.match(p)
      if (match) return match[1].trim()
    }
    return null
  }

  // ── Theme change handler ──────────────────────────────────────
  const handleThemeChange = async (themeKey) => {
    setTheme(themeKey)
    setShowThemePicker(false)
    try {
      await saveUserSettings(user.uid, personalityId, { theme: themeKey })
    } catch (e) { }
  }

  // ── Send message (with all features) ──────────────────────────
  const sendMessage = async () => {
    if (isTyping || (!input.trim() && !pendingImg)) return
    const text = input.trim()
    setInput('')
    clearTimeout(silenceTimer.current)

    let apiContent
    let imgPreview = null

    if (pendingImg) {
      imgPreview = pendingImg.preview
      apiContent = text || "Here's an image — study the style, tone, and personality. Let it shape how you understand and talk to me."
      setPendingImg(null)
    } else {
      apiContent = text
    }

    const userMsg = await addMessage('user', apiContent, imgPreview)

    // Set first conversation date if not set
    if (!firstConvDate) {
      setFirstConversationDate(user.uid).catch(() => { })
      setFirstConvDate(new Date().toISOString().split('T')[0])
    }

    // AI may react to user message (20%)
    if (userMsg.id) maybeAIReact(userMsg.id)

    // Check for conflict progression
    if (conflictState) {
      await maybeProgressConflict(apiContent)
    } else {
      // Check for new conflict trigger
      await maybeStartConflict(apiContent)
    }

    // Check for game end (natural conclusion)
    if (activeGame && /(?:that was fun|good game|let's stop|anyway|ok done)/i.test(apiContent)) {
      try {
        await clearActiveGame(user.uid, personalityId)
        setActiveGameLocal(null)
      } catch (e) { }
    }

    // Show "Read" receipt before typing
    setShowRead(true)
    await new Promise(r => setTimeout(r, getReadDelay()))
    setShowRead(false)

    // Show typing indicator with realistic delay
    setIsTyping(true)

    try {
      // Manage RAG: Refresh context if 5+ msgs passed or user sends long msg
      let currentRag = ragKnowledge
      if (messagesSinceRag >= 5 || apiContent.length > 50) {
        currentRag = await retrieveRagKnowledge(apiContent)
        setRagKnowledge(currentRag)
        setMessagesSinceRag(0)
      } else {
        setMessagesSinceRag(prev => prev + 1)
      }

      const history = [...messages, { role: 'user', content: apiContent }]
        .slice(-30)
        .map(m => ({ role: m.role, content: m.content }))

      const sysPrompt = buildSystemPrompt(currentRag)
      let reply = await callAPI(history, sysPrompt)

      // Update engagement state
      await updateEngagement()

      // Check for multi-bubble split
      if (shouldSplitMessage() && reply.length > 30) {
        const chunks = splitIntoChunks(reply)

        for (let i = 0; i < chunks.length; i++) {
          let chunk = chunks[i]

          // Apply typo correction to first chunk sometimes
          if (i === 0) {
            const typo = addTypoCorrection(chunk)
            if (typo) {
              const typingDelay = calculateTypingDelay(typo.typoText)
              await new Promise(r => setTimeout(r, typingDelay))
              await addMessage('assistant', typo.typoText)

              setIsTyping(true)
              await new Promise(r => setTimeout(r, 400 + Math.random() * 400))
              await addMessage('assistant', typo.correctedText)

              if (i < chunks.length - 1) {
                setIsTyping(true)
              }
              continue
            }
          }

          const delay = calculateTypingDelay(chunk)
          await new Promise(r => setTimeout(r, delay))
          setIsTyping(false)
          await addMessage('assistant', chunk)

          if (i < chunks.length - 1) {
            setIsTyping(true)
            await new Promise(r => setTimeout(r, 300 + Math.random() * 700))
          }
        }
      } else {
        // Single message with realistic delay
        const delay = calculateTypingDelay(reply)
        await new Promise(r => setTimeout(r, delay))

        const typo = addTypoCorrection(reply)
        if (typo) {
          setIsTyping(false)
          await addMessage('assistant', typo.typoText)
          setIsTyping(true)
          await new Promise(r => setTimeout(r, 400 + Math.random() * 400))
          await addMessage('assistant', typo.correctedText)
        } else {
          await addMessage('assistant', reply)
        }
      }

      playReplyChime()

      // Background: extract memory / analyze profile
      const msgCount = engagementRef.current.totalMessages
      maybeExtractMemory(msgCount)
      maybeAnalyzeProfile(msgCount)
      maybeAnalyzeCommunication(msgCount)

      // Background: maybe trigger specials
      maybeGenerateImage()
      maybeStartGame()
      maybeWriteLetter()

    } catch (e) {
      await addMessage('assistant', "I lost connection for a sec... you still there?")
    }

    setIsTyping(false)
    resetSilenceTimer()
    inputRef.current?.focus()
  }

  const clearChat = async () => {
    if (!confirm('Clear this chat?')) return
    const { clearMessages } = await import('../lib/db')
    await clearMessages(user.uid, personalityId)
    setMessages([])
    setTimeout(() => initiateConversation(), 1000)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
    resetSilenceTimer()
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleAddToPlaylist = async (msg) => {
    const songName = detectSongRecommendation(msg.content)
    if (!songName) return
    try {
      await addToPlaylist(user.uid, personalityId, songName, msg.content)
    } catch (e) { }
  }

  if (!personality) return <div className={styles.loading}><span className={styles.spinner} /></div>

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={18} />
        </button>
        <div className={styles.personaInfo}>
          {avatarUrl ? (
            <img src={avatarUrl} className={styles.personaAvatar} alt={personality.name} />
          ) : (
            <div className={styles.personaEmoji}>{personality.emoji}</div>
          )}
          <div>
            <div className={styles.personaName} style={{ color: personality.color }}>{personality.name}</div>
            <div className={styles.personaStatus}>online · always here</div>
          </div>
        </div>
        <div className={styles.headerCenter}>
          <span className={styles.moodTag}>✦ {engagementRef.current.phase}</span>
          {currentMood && currentMood !== 'neutral' && (
            <span className={styles.moodTag} style={{ marginLeft: 6 }}>💭 {currentMood}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          {engagementRef.current.closeness >= 6 && (
            <button className={styles.iconBtn} onClick={() => navigate(`/diary/${personalityId}`)} title="Her Diary">
              <BookOpen size={16} />
            </button>
          )}
          <button className={styles.iconBtn} onClick={() => navigate(`/playlist/${personalityId}`)} title="Playlist">
            <Music size={16} />
          </button>
          <div className={styles.themePickerWrap}>
            <button className={styles.iconBtn} onClick={() => setShowThemePicker(!showThemePicker)} title="Theme">
              <Palette size={16} />
            </button>
            {showThemePicker && (
              <div className={styles.themeDropdown}>
                {Object.entries(themes).map(([key, t]) => (
                  <button
                    key={key}
                    className={`${styles.themeOption} ${theme === key ? styles.activeTheme : ''}`}
                    onClick={() => handleThemeChange(key)}
                  >
                    <span className={styles.themePreview} style={{ background: t.preview }} />
                    <span>{t.icon} {t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={styles.iconBtn} onClick={clearChat} title="Clear chat">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className={styles.messages} onClick={() => { setActiveReactionMsg(null); setShowThemePicker(false) }}>
        {messages.length === 0 && !isTyping && (
          <div className={styles.emptyState}>
            <div className={styles.emptyEmoji}>{personality.emoji}</div>
            <p className={styles.emptyQuote}>"{personality.tagline}"</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const msgId = msg.id || `msg-${i}`
          const msgReactions = reactions[msgId] || []
          const detectedSong = msg.role === 'assistant' ? detectSongRecommendation(msg.content) : null

          return (
            <div key={msgId} className={`${styles.msgGroup} ${msg.role === 'user' ? styles.user : styles.ai}`}>
              {/* AI avatar */}
              {msg.role === 'assistant' && (
                <div className={styles.bubbleAvatar}>
                  {avatarUrl ? (
                    <img src={avatarUrl} className={styles.smallAvatar} alt="" />
                  ) : null}
                </div>
              )}
              <div className={styles.bubbleWrap}>
                <div
                  className={`${styles.bubble} ${msg.isLetter ? styles.letterBubble : ''}`}
                  onDoubleClick={() => handleBubbleDoubleClick(msgId)}
                  onTouchStart={() => handleBubbleLongPress(msgId)}
                  onTouchEnd={handleBubbleRelease}
                >
                  {msg.imageUrl && <img src={msg.imageUrl} className={styles.bubbleImg} alt="shared" />}
                  {msg.content && (
                    <span className={msg.isLetter ? styles.letterText : ''}>
                      {msg.isLetter && <span className={styles.letterIcon}>✉️ </span>}
                      {msg.content}
                    </span>
                  )}
                </div>

                {/* Reaction picker */}
                {activeReactionMsg === msgId && (
                  <div className={styles.reactionPicker} onClick={e => e.stopPropagation()}>
                    {REACTION_EMOJIS.map(emoji => (
                      <button key={emoji} className={styles.reactionBtn} onClick={() => handleReaction(msgId, emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Reaction badges */}
                {msgReactions.length > 0 && (
                  <div className={styles.reactionBadges}>
                    {Object.entries(
                      msgReactions.reduce((acc, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc }, {})
                    ).map(([emoji, count]) => (
                      <span key={emoji} className={styles.reactionBadge}>{emoji}{count > 1 ? ` ${count}` : ''}</span>
                    ))}
                  </div>
                )}

                <div className={styles.time}>
                  {formatTime(msg.timestamp)}
                  {msg.role === 'user' && i === messages.length - 1 && showRead && (
                    <span className={styles.readReceipt}> · Read</span>
                  )}
                  {/* Speaker button for AI messages */}
                  {msg.role === 'assistant' && msg.content && isSpeechSynthesisSupported() && (
                    <button
                      className={`${styles.speakBtn} ${speakingMsgIdx === i ? styles.speakBtnActive : ''}`}
                      onClick={() => handleSpeak(msg.content, i)}
                      title="Listen"
                    >
                      <Volume2 size={11} />
                    </button>
                  )}
                </div>

                {/* Waveform while speaking this message */}
                {speakingMsgIdx === i && (
                  <div className={styles.waveform}>
                    <span className={styles.waveBar} />
                    <span className={styles.waveBar} />
                    <span className={styles.waveBar} />
                    <span className={styles.waveBar} />
                    <span className={styles.waveBar} />
                  </div>
                )}

                {/* Song detection — add to playlist */}
                {detectedSong && (
                  <button className={styles.playlistAddBtn} onClick={() => handleAddToPlaylist(msg)}>
                    🎵 Add "{detectedSong}" to playlist
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {isTyping && (
          <div className={`${styles.msgGroup} ${styles.ai}`}>
            {avatarUrl && (
              <div className={styles.bubbleAvatar}>
                <img src={avatarUrl} className={styles.smallAvatar} alt="" />
              </div>
            )}
            <div className={styles.bubbleWrap}>
              <div className={`${styles.bubble} ${styles.typingBubble}`}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Upload preview */}
      {pendingImg && (
        <div className={styles.uploadPreview}>
          <img src={pendingImg.preview} className={styles.previewThumb} alt="preview" />
          <div className={styles.previewInfo}>
            <span className={styles.previewName}>{pendingImg.name}</span>
            <span className={styles.previewSub}>✦ {personality.name} will study this</span>
          </div>
          <button className={styles.previewRemove} onClick={() => setPendingImg(null)}><X size={16} /></button>
        </div>
      )}

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()} title="Upload image">
            <Image size={16} />
          </button>
          <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />

          {isSpeechRecognitionSupported() && (
            <button
              className={`${styles.uploadBtn} ${isRecording ? styles.micActive : ''}`}
              onClick={handleMicToggle}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}

          {isRecording && (
            <div className={styles.recordingIndicator}>
              <span className={styles.recordingDot} />
              Listening...
            </div>
          )}

          <textarea
            ref={inputRef}
            className={styles.msgInput}
            placeholder={`Say something to ${personality.name}...`}
            value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            style={{ background: personality.gradient }}
            onClick={sendMessage}
            disabled={isTyping || (!input.trim() && !pendingImg)}
          >
            <Send size={15} />
          </button>
        </div>
        <div className={styles.inputHint}>enter to send · shift+enter for new line · 📎 upload · 🎤 voice</div>
      </div>
    </div>
  )
}
