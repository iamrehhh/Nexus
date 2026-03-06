import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { PRESET_PERSONALITIES } from '../lib/personalities'
import { loadCustomPersonalities, saveMessage, loadMessages } from '../lib/db'
import { ArrowLeft, Sun, Moon, Image, Send, Trash2, X } from 'lucide-react'
import styles from './Chat.module.css'

const MOODS = ['romantic','playful','soft','teasing','warm','mysterious','affectionate','nostalgic']

export default function Chat() {
  const { personalityId } = useParams()
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const [personality, setPersonality] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [mood, setMood] = useState(MOODS[0])
  const [pendingImg, setPendingImg] = useState(null) // { base64, mime, preview }
  const [imageAnalysis, setImageAnalysis] = useState('')

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const silenceTimer = useRef(null)
  const moodTimer = useRef(null)
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

  // Load messages
  useEffect(() => {
    if (!user || !personalityId) return
    loadMessages(user.uid, personalityId).then(msgs => {
      setMessages(msgs)
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100)
    })
  }, [user, personalityId])

  // Mood cycle
  useEffect(() => {
    moodTimer.current = setInterval(() => {
      setMood(MOODS[Math.floor(Math.random() * MOODS.length)])
    }, 9000)
    return () => clearInterval(moodTimer.current)
  }, [])

  // Aria initiates if no messages
  useEffect(() => {
    if (!user || !personality || messages.length > 0) return
    const t = setTimeout(() => initiateConversation(), 2000)
    return () => clearTimeout(t)
  }, [personality, messages.length])

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

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
    } catch(e) {}
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
        const sysWithName = personality.systemPrompt + `\n\nUser's name: ${user.displayName?.split(' ')[0]}. ${imageAnalysis ? `\n\nPersonality context from uploaded images: ${imageAnalysis}` : ''}`
        const reply = await callAPI([
          ...history,
          { role: 'user', content: "You haven't heard from him in a while. Initiate naturally — check in, share a thought, flirt, or just say hi. Short and real." }
        ], sysWithName, 120)
        await addMessage('assistant', reply)
      } catch(e) {}
      setIsTyping(false)
      resetSilenceTimer()
    }, (180 + Math.random() * 240) * 1000)
  }, [messages, isTyping, personality, imageAnalysis])

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result
      const base64 = dataUrl.split(',')[1]
      setPendingImg({ base64, mime: file.type, preview: dataUrl, name: file.name })
      // Analyze in background
      try {
        const analysis = await analyzeImage(base64, file.type)
        setImageAnalysis(prev => prev + '\n' + analysis)
      } catch(e) {}
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const sendMessage = async () => {
    if (isTyping || (!input.trim() && !pendingImg)) return
    const text = input.trim()
    setInput('')
    clearTimeout(silenceTimer.current)

    // Build content for API
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

    setIsTyping(true)
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1500))

    try {
      const history = [...messages, { role: 'user', content: apiContent }]
        .slice(-30)
        .map(m => ({ role: m.role, content: m.content }))

      const firstName = user.displayName?.split(' ')[0] || 'you'
      const sysWithContext = personality.systemPrompt +
        `\n\nUser's real name: ${firstName}. Use it occasionally — naturally, not every message.` +
        (imageAnalysis ? `\n\nPersonality context from uploaded images/screenshots: ${imageAnalysis}` : '')

      const reply = await callAPI(history, sysWithContext)
      await addMessage('assistant', reply)
    } catch(e) {
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
          <ArrowLeft size={18}/>
        </button>
        <div className={styles.personaInfo}>
          <div className={styles.personaEmoji}>{personality.emoji}</div>
          <div>
            <div className={styles.personaName} style={{ color: personality.color }}>{personality.name}</div>
            <div className={styles.personaStatus}>online · always here</div>
          </div>
        </div>
        <div className={styles.headerCenter}>
          <span className={styles.moodTag}>✦ {mood}</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} onClick={toggle}>
            {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
          </button>
          <button className={styles.iconBtn} onClick={clearChat} title="Clear chat">
            <Trash2 size={16}/>
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
            <div className={styles.time}>{formatTime(msg.timestamp)}</div>
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
          <button className={styles.previewRemove} onClick={() => setPendingImg(null)}><X size={16}/></button>
        </div>
      )}

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()} title="Upload image">
            <Image size={16}/>
          </button>
          <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileSelect} style={{display:'none'}} />
          <textarea
            ref={inputRef}
            className={styles.msgInput}
            placeholder={`Say something to ${personality.name}...`}
            value={input}
            onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px' }}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            style={{ background: personality.gradient }}
            onClick={sendMessage}
            disabled={isTyping || (!input.trim() && !pendingImg)}
          >
            <Send size={15}/>
          </button>
        </div>
        <div className={styles.inputHint}>enter to send · shift+enter for new line · 📎 upload screenshots to train {personality.name}</div>
      </div>
    </div>
  )
}
