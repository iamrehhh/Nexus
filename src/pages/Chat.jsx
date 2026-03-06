import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { PRESET_PERSONALITIES } from '../lib/personalities'
import {
  loadCustomPersonalities, saveMessage, loadMessages,
  loadMemory, saveMemory, loadProfile, saveProfile,
  loadEngagement, saveEngagement
} from '../lib/db'
import {
  getNextPhase, getRandomThreshold, getPhasePrompt,
  calculateStreak, getStreakPrompt,
  calculateCloseness, getClosenessPrompt
} from '../lib/engagement'
import {
  calculateTypingDelay, shouldSplitMessage, splitIntoChunks,
  getReadDelay, getTimeContext, addTypoCorrection
} from '../lib/realism'
import { ArrowLeft, Sun, Moon, Image, Send, Trash2, X } from 'lucide-react'
import styles from './Chat.module.css'

export default function Chat() {
  const { personalityId } = useParams()
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const [personality, setPersonality] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [pendingImg, setPendingImg] = useState(null)
  const [imageAnalysis, setImageAnalysis] = useState('')

  // Memory & engagement state (loaded from DB)
  const memoryRef = useRef({ facts: [], lastExtractedAt: 0 })
  const profileRef = useRef({ profile: {}, lastAnalyzedAt: 0 })
  const engagementRef = useRef({
    phase: 'warm', phaseMessageCount: 0, phaseThreshold: 20,
    closeness: 1, totalMessages: 0, streak: 0, lastActiveDate: ''
  })

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const silenceTimer = useRef(null)
  const fileInputRef = useRef(null)

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

  // Load messages + memory + engagement
  useEffect(() => {
    if (!user || !personalityId) return

    // Load messages
    loadMessages(user.uid, personalityId).then(msgs => {
      setMessages(msgs)
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100)
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
          lastActiveDate: eng.lastActiveDate || ''
        }
      }
    }).catch(() => { })
  }, [user, personalityId])

  // She initiates if no messages
  useEffect(() => {
    if (!user || !personality || messages.length > 0) return
    const t = setTimeout(() => initiateConversation(), 2000)
    return () => clearTimeout(t)
  }, [personality, messages.length])

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

  // ── Build enhanced system prompt ──────────────────────────────
  const buildSystemPrompt = () => {
    const firstName = user.displayName?.split(' ')[0] || 'you'
    const eng = engagementRef.current
    const mem = memoryRef.current
    const prof = profileRef.current
    const timeCtx = getTimeContext()

    let prompt = personality.systemPrompt
    prompt += `\n\nUser's real name: ${firstName}. Use it occasionally — naturally, not every message.`

    // Time awareness
    prompt += `\n\n${timeCtx.prompt}`

    // Engagement phase
    prompt += `\n\n${getPhasePrompt(eng.phase)}`

    // Closeness level
    prompt += getClosenessPrompt(eng.closeness)

    // Streak
    prompt += getStreakPrompt(eng.streak, eng.lastActiveDate)

    // Memory (facts about user)
    if (mem.facts && mem.facts.length > 0) {
      prompt += `\n\n## Things You Remember About Him\nYou know these things from previous conversations. Reference them naturally — don't list them, just weave them in when relevant:\n${mem.facts.map(f => `- ${f}`).join('\n')}`
    }

    // Deep profile
    if (prof.profile && Object.keys(prof.profile).length > 0) {
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

    return prompt
  }

  const callAPI = async (history, systemPrompt, maxTokens = 300) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, systemPrompt, maxTokens })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.reply
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

  const addMessage = async (role, content, imgPreview = null) => {
    const msg = { role, content, imageUrl: imgPreview, timestamp: new Date() }
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

  // ── Update engagement state ───────────────────────────────────
  const updateEngagement = async () => {
    const eng = engagementRef.current
    eng.totalMessages += 1
    eng.phaseMessageCount += 1

    // Calculate closeness
    eng.closeness = calculateCloseness(eng.totalMessages)

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

  // ── Initiate conversation ─────────────────────────────────────
  const initiateConversation = async () => {
    if (isTyping || !personality) return
    setIsTyping(true)
    try {
      const firstName = user.displayName?.split(' ')[0] || 'you'
      const openers = [
        `hey ${firstName}... I was just thinking about you. weird timing huh?`,
        `hi. I know I shouldn't text first but I did anyway 🙃`,
        `okay so random but something reminded me of you today`,
        `hey ${firstName}. just wanted to check in. how are you actually doing?`,
        `I've been thinking about us lately. just wanted to say hi.`
      ]
      const opener = openers[Math.floor(Math.random() * openers.length)]
      await addMessage('assistant', opener)
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
        const reply = await callAPI([
          ...history,
          { role: 'user', content: "You haven't heard from him in a while. Initiate naturally — check in, share a thought, flirt, or just say hi. Short and real." }
        ], sysPrompt, 120)
        await addMessage('assistant', reply)
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

  // ── Send message (with realism features) ──────────────────────
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

    await addMessage('user', apiContent, imgPreview)

    // Show "Read" receipt before typing
    setShowRead(true)
    await new Promise(r => setTimeout(r, getReadDelay()))
    setShowRead(false)

    // Show typing indicator with realistic delay
    setIsTyping(true)

    try {
      const history = [...messages, { role: 'user', content: apiContent }]
        .slice(-30)
        .map(m => ({ role: m.role, content: m.content }))

      const sysPrompt = buildSystemPrompt()
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
              // Send the typo version first
              const typingDelay = calculateTypingDelay(typo.typoText)
              await new Promise(r => setTimeout(r, typingDelay))
              await addMessage('assistant', typo.typoText)

              // Then correction
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

        // Check for typo correction
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

      // Background: extract memory / analyze profile
      const msgCount = engagementRef.current.totalMessages
      maybeExtractMemory(msgCount)
      maybeAnalyzeProfile(msgCount)

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

  if (!personality) return <div className={styles.loading}><span className={styles.spinner} /></div>

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={18} />
        </button>
        <div className={styles.personaInfo}>
          <div className={styles.personaEmoji}>{personality.emoji}</div>
          <div>
            <div className={styles.personaName} style={{ color: personality.color }}>{personality.name}</div>
            <div className={styles.personaStatus}>online · always here</div>
          </div>
        </div>
        <div className={styles.headerCenter}>
          <span className={styles.moodTag}>✦ {engagementRef.current.phase}</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} onClick={toggle}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className={styles.iconBtn} onClick={clearChat} title="Clear chat">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && !isTyping && (
          <div className={styles.emptyState}>
            <div className={styles.emptyEmoji}>{personality.emoji}</div>
            <p className={styles.emptyQuote}>"{personality.tagline}"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`${styles.msgGroup} ${msg.role === 'user' ? styles.user : styles.ai}`}>
            <div className={styles.bubble}>
              {msg.imageUrl && <img src={msg.imageUrl} className={styles.bubbleImg} alt="uploaded" />}
              {msg.content && <span>{msg.content}</span>}
            </div>
            <div className={styles.time}>
              {formatTime(msg.timestamp)}
              {/* Show "Read" indicator on last user message */}
              {msg.role === 'user' && i === messages.length - 1 && showRead && (
                <span className={styles.readReceipt}> · Read</span>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className={`${styles.msgGroup} ${styles.ai}`}>
            <div className={`${styles.bubble} ${styles.typingBubble}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
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
        <div className={styles.inputHint}>enter to send · shift+enter for new line · 📎 upload screenshots to train {personality.name}</div>
      </div>
    </div>
  )
}
