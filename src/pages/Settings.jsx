import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getBirthday, setBirthday, getNickname, setNickname } from '../lib/db'
import { ArrowLeft, Save } from 'lucide-react'
import styles from './Settings.module.css'

export default function Settings() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [birthday, setBirthdayState] = useState('')
    const [nickname, setNicknameState] = useState('')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        if (user) {
            getBirthday(user.uid).then(b => { if (b) setBirthdayState(b) }).catch(() => { })
            getNickname(user.uid).then(n => { if (n) setNicknameState(n) }).catch(() => { })
        }
    }, [user])

    const handleSave = async () => {
        setSaving(true)
        try {
            if (birthday) await setBirthday(user.uid, birthday)
            await setNickname(user.uid, nickname.trim() || null)
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } catch (e) {
            console.error('Save error:', e)
        }
        setSaving(false)
    }

    return (
        <div className={styles.page}>
            <div className={styles.glow} />
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate('/')}>
                    <ArrowLeft size={18} />
                </button>
                <h1 className={styles.title}>Settings</h1>
            </header>

            <div className={styles.content}>
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Your Nickname</h2>
                    <p className={styles.sectionSub}>She'll call you by this name instead of your real one 💬</p>
                    <div className={styles.inputRow}>
                        <input
                            type="text"
                            className={styles.input}
                            value={nickname}
                            onChange={e => setNicknameState(e.target.value)}
                            placeholder="What should she call you?"
                        />
                    </div>
                </section>

                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Your Birthday</h2>
                    <p className={styles.sectionSub}>She'll remember it and send you something special 🎂</p>
                    <div className={styles.inputRow}>
                        <input
                            type="date"
                            className={styles.input}
                            value={birthday}
                            onChange={e => setBirthdayState(e.target.value)}
                        />
                    </div>
                </section>

                <button className={styles.saveBtn} onClick={handleSave} disabled={saving} style={{ width: '100%', marginBottom: 24 }}>
                    {saved ? '✓ Saved' : saving ? 'Saving...' : <><Save size={14} /> Save</>}
                </button>

                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Account</h2>
                    <div className={styles.infoRow}>
                        <span className={styles.label}>Name</span>
                        <span className={styles.value}>{user?.displayName || 'Unknown'}</span>
                    </div>
                    <div className={styles.infoRow}>
                        <span className={styles.label}>Email</span>
                        <span className={styles.value}>{user?.email || 'Unknown'}</span>
                    </div>
                </section>
            </div>
        </div>
    )
}
