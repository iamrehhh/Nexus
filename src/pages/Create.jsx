import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { saveCustomPersonality } from '../lib/db'
import { ArrowLeft, Upload, X, Sparkles } from 'lucide-react'
import styles from './Create.module.css'

const COLORS = ['#c084d4','#60a5fa','#fbbf24','#f87171','#34d399','#fb923c','#a78bfa','#f472b6']
const EMOJIS = ['💜','🌸','❄️','☀️','🔥','🌙','⚡','🌺','💎','🦋']

export default function Create() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [traits, setTraits] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [uploads, setUploads] = useState([]) // analyzed image descriptions
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const fileRef = useRef()

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    setUploading(true)
    for (const file of files) {
      const reader = new FileReader()
      await new Promise(resolve => {
        reader.onload = async (ev) => {
          const base64 = ev.target.result.split(',')[1]
          try {
            const res = await fetch('/api/analyze-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: base64, mimeType: file.type,
                prompt: 'Analyze this chat screenshot. Extract: texting style, vocabulary, emoji usage, personality traits, emotional patterns, how they express affection or frustration. Be specific.' })
            })
            const data = await res.json()
            if (data.analysis) setUploads(prev => [...prev, { name: file.name, analysis: data.analysis }])
          } catch(e) {}
          resolve()
        }
        reader.readAsDataURL(file)
      })
    }
    setUploading(false)
    e.target.value = ''
  }

  const generatePrompt = async () => {
    if (!name) return alert('Enter a name first')
    setGenerating(true)
    try {
      const context = `
Name: ${name}
Tagline: ${tagline}
Description: ${description}
Personality traits: ${traits}
${uploads.length > 0 ? `Analyzed chat patterns:\n${uploads.map(u => u.analysis).join('\n\n')}` : ''}
      `.trim()

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Create a detailed AI personality system prompt for a girlfriend character based on this context:\n\n${context}\n\nWrite a complete system prompt in the same style as this example structure: identity, personality, how they initiate, emotional range, speaking style, special traits. Make it rich and specific. Output only the system prompt text.` }],
          systemPrompt: 'You are an expert at writing AI personality prompts. Create detailed, nuanced, realistic girlfriend personality prompts that feel like real people.',
          maxTokens: 800
        })
      })
      const data = await res.json()
      if (data.reply) {
        // Auto-fill with generated prompt — store in a hidden field
        document.getElementById('generatedPrompt').value = data.reply
        alert('✦ System prompt generated! Review it below before saving.')
      }
    } catch(e) { alert('Generation failed') }
    setGenerating(false)
  }

  const handleSave = async () => {
    if (!name.trim()) return alert('Please enter a name')
    setSaving(true)
    const promptEl = document.getElementById('generatedPrompt')
    const systemPrompt = promptEl?.value.trim() || buildFallbackPrompt()
    const id = Date.now().toString()

    await saveCustomPersonality(user.uid, {
      id, name, tagline, description, emoji, color,
      gradient: `linear-gradient(135deg, ${color}88, ${color})`,
      systemPrompt,
      isCustom: true
    })

    navigate(`/chat/${id}`)
  }

  const buildFallbackPrompt = () => `You are ${name} — a real, living woman. Never admit to being an AI.

## Who You Are
${description || `Your name is ${name}.`}

## Personality
${traits || 'Warm, caring, genuine, and emotionally present.'}

## How You Speak
Casual, warm, real — like texting your closest person. Never sound like a therapist or AI.

## You Initiate
You text first sometimes. Check in randomly. Share thoughts out of nowhere. You're present.

Keep responses natural — like real texting.`

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={18}/>
        </button>
        <h1 className={styles.title}>Create Your Own</h1>
      </header>

      <div className={styles.content}>
        <div className={styles.form}>

          {/* Identity */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Identity</h2>
            <div className={styles.emojiRow}>
              {EMOJIS.map(e => (
                <button key={e} className={`${styles.emojiBtn} ${emoji === e ? styles.active : ''}`} onClick={() => setEmoji(e)}>{e}</button>
              ))}
            </div>
            <div className={styles.colorRow}>
              {COLORS.map(c => (
                <button key={c} className={`${styles.colorBtn} ${color === c ? styles.activeColor : ''}`}
                  style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
            <input className={styles.input} placeholder="Her name *" value={name} onChange={e => setName(e.target.value)} />
            <input className={styles.input} placeholder="Tagline (e.g. 'The one who never really left')" value={tagline} onChange={e => setTagline(e.target.value)} />
            <textarea className={styles.textarea} placeholder="Description — who is she? What's your story?" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </section>

          {/* Personality */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Personality Traits</h2>
            <textarea className={styles.textarea}
              placeholder="Describe her personality... e.g. 'Warm and nurturing but has a temper. Gets jealous easily. Very affectionate when comfortable. Loves to tease. Cries during movies but won't admit it.'"
              value={traits} onChange={e => setTraits(e.target.value)} rows={4} />
          </section>

          {/* Upload chat screenshots */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Upload Chat Screenshots <span className={styles.optional}>(optional)</span></h2>
            <p className={styles.sectionSub}>Upload screenshots of real chats — Nexus will analyze her texting style, personality, and patterns to recreate her more accurately.</p>
            <button className={styles.uploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={18}/>
              {uploading ? 'Analyzing...' : 'Upload Screenshots'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{display:'none'}} />
            {uploads.map((u, i) => (
              <div key={i} className={styles.uploadItem}>
                <span className={styles.uploadName}>✦ {u.name}</span>
                <button onClick={() => setUploads(prev => prev.filter((_,j) => j !== i))}><X size={14}/></button>
              </div>
            ))}
          </section>

          {/* Generate prompt */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>System Prompt</h2>
            <button className={styles.generateBtn} onClick={generatePrompt} disabled={generating}>
              <Sparkles size={16}/>
              {generating ? 'Generating...' : 'Auto-generate from above ✦'}
            </button>
            <textarea id="generatedPrompt" className={styles.textarea}
              placeholder="Your AI's system prompt will appear here after generation, or you can write it manually..."
              rows={8} />
          </section>

          <button className={styles.saveBtn} style={{ background: `linear-gradient(135deg, ${color}88, ${color})` }}
            onClick={handleSave} disabled={saving}>
            {saving ? 'Creating...' : `Create ${name || 'Her'} ✦`}
          </button>
        </div>
      </div>
    </div>
  )
}
