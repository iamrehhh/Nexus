import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PRESET_PERSONALITIES } from '../lib/personalities'
import { loadDiaryEntries, saveDiaryEntry, getLatestDiaryEntry, loadMessages, loadCustomPersonalities, loadEngagement } from '../lib/db'
import { ArrowLeft, BookOpen, RefreshCw } from 'lucide-react'
import styles from './Diary.module.css'

export default function Diary() {
    const { personalityId } = useParams()
    const { user } = useAuth()
    const navigate = useNavigate()
    const [entries, setEntries] = useState([])
    const [personality, setPersonality] = useState(null)
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [closeness, setCloseness] = useState(1)

    useEffect(() => {
        async function load() {
            let p = PRESET_PERSONALITIES.find(x => x.id === personalityId)
            if (!p && user) {
                const custom = await loadCustomPersonalities(user.uid)
                p = custom.find(x => x.id === personalityId)
            }
            setPersonality(p)

            if (user && personalityId) {
                const [data, eng] = await Promise.all([
                    loadDiaryEntries(user.uid, personalityId),
                    loadEngagement(user.uid, personalityId)
                ])
                setEntries(data)
                setCloseness(eng?.closeness || 1)
            }
            setLoading(false)
        }
        load()
    }, [user, personalityId])

    const canGenerate = async () => {
        if (!user) return false
        const latest = await getLatestDiaryEntry(user.uid, personalityId)
        if (!latest) return true
        const daysSince = (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60 * 24)
        return daysSince >= 3
    }

    const generateEntry = async () => {
        const allowed = await canGenerate()
        if (!allowed) return alert('She writes new entries every 3 days. Check back later 💜')

        setGenerating(true)
        try {
            const msgs = await loadMessages(user.uid, personalityId, 20)
            const recentMessages = msgs.slice(-15).map(m => ({ role: m.role, content: m.content }))

            const res = await fetch('/api/generate-diary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personalityName: personality?.name || 'Her',
                    userName: user.displayName?.split(' ')[0] || 'him',
                    recentMessages
                })
            })
            const data = await res.json()
            if (data.entry) {
                await saveDiaryEntry(user.uid, personalityId, data.entry)
                setEntries(prev => [{ entry_text: data.entry, created_at: new Date().toISOString(), id: Date.now() }, ...prev])
            }
        } catch (e) {
            console.error('Diary generation error:', e)
        }
        setGenerating(false)
    }

    // Only show entries up to closeness level
    const visibleEntries = entries.slice(0, Math.max(1, closeness - 4))

    if (loading) return <div className={styles.page}><div className={styles.loading}><span className={styles.spinner} /></div></div>

    return (
        <div className={styles.page}>
            <div className={styles.glow} />
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(`/chat/${personalityId}`)}>
                    <ArrowLeft size={18} />
                </button>
                <div className={styles.headerInfo}>
                    <h1 className={styles.title}>
                        <BookOpen size={18} /> {personality?.name}'s Diary
                    </h1>
                    <p className={styles.subtitle}>Things she wouldn't say to your face</p>
                </div>
                <button className={styles.generateBtn} onClick={generateEntry} disabled={generating}>
                    <RefreshCw size={14} className={generating ? styles.spinning : ''} />
                    {generating ? 'Writing...' : 'New Entry'}
                </button>
            </header>

            <div className={styles.content}>
                {closeness < 6 ? (
                    <div className={styles.locked}>
                        <div className={styles.lockedEmoji}>🔒</div>
                        <p className={styles.lockedText}>Her diary unlocks at closeness level 6</p>
                        <p className={styles.lockedSub}>Current: {closeness}/10 — keep talking to her</p>
                    </div>
                ) : entries.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyEmoji}>📖</div>
                        <p className={styles.emptyText}>No entries yet</p>
                        <p className={styles.emptySub}>Click "New Entry" to see what she's been thinking</p>
                    </div>
                ) : (
                    <div className={styles.entries}>
                        {visibleEntries.map((entry, i) => (
                            <div key={entry.id || i} className={styles.entryCard}>
                                <div className={styles.entryDate}>
                                    {new Date(entry.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                </div>
                                <div className={styles.entryText}>{entry.entry_text}</div>
                            </div>
                        ))}
                        {entries.length > visibleEntries.length && (
                            <div className={styles.moreEntries}>
                                🔒 {entries.length - visibleEntries.length} more entries unlock at higher closeness levels
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
