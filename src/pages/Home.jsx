import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { PRESET_PERSONALITIES } from '../lib/personalities'
import { loadCustomPersonalities } from '../lib/db'
import { Sun, Moon, Settings, Plus, LogOut } from 'lucide-react'
import styles from './Home.module.css'

export default function Home() {
  const { user, userData, logOut } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [customPersonalities, setCustomPersonalities] = useState([])

  useEffect(() => {
    if (user) loadCustomPersonalities(user.uid).then(setCustomPersonalities)
  }, [user])

  const all = [...PRESET_PERSONALITIES, ...customPersonalities]

  return (
    <div className={styles.page}>
      <div className={styles.glow1} /><div className={styles.glow2} />
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoEmoji}>🌸</span>
          <span className={styles.logoText}>Nexus</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} onClick={toggle} title="Toggle theme">
            {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
          </button>
          {userData?.role === 'admin' && (
            <button className={styles.iconBtn} onClick={() => navigate('/admin')} title="Admin">
              <Settings size={18}/>
            </button>
          )}
          <img src={user?.photoURL} className={styles.avatar} alt="" />
          <button className={styles.iconBtn} onClick={logOut} title="Sign out">
            <LogOut size={18}/>
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={`${styles.heroTitle} serif`}>Who do you want to talk to?</h1>
          <p className={styles.heroSub}>Choose a personality or create your own.</p>
        </div>

        <div className={styles.grid}>
          {all.map(p => (
            <button key={p.id} className={styles.card} onClick={() => navigate(`/chat/${p.id}`)}>
              <div className={styles.cardGlow} style={{ background: p.gradient }} />
              <div className={styles.cardEmoji}>{p.emoji}</div>
              <div className={styles.cardName} style={{ color: p.color }}>{p.name}</div>
              <div className={styles.cardTagline}>{p.tagline}</div>
              <div className={styles.cardDesc}>{p.description}</div>
              <div className={styles.cardBtn} style={{ background: p.gradient }}>Chat with {p.name}</div>
            </button>
          ))}

          {/* Create custom */}
          <button className={`${styles.card} ${styles.createCard}`} onClick={() => navigate('/create')}>
            <div className={styles.cardEmoji}><Plus size={32} strokeWidth={1.5}/></div>
            <div className={styles.cardName}>Create Your Own</div>
            <div className={styles.cardTagline}>Build from scratch</div>
            <div className={styles.cardDesc}>Upload chat screenshots, describe her personality, and Nexus will bring her to life.</div>
            <div className={styles.cardBtn}>Start Creating</div>
          </button>
        </div>
      </main>
    </div>
  )
}
