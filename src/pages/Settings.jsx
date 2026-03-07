import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { updateUser, updateUserSettings, getUserSettings, getMemoryCount, clearSecretaryMemory, clearSecretaryMessages } from '../lib/db'
import { Sun, Moon, LogOut, Download, Monitor, Smartphone, Volume2 } from 'lucide-react'
import { usePWAInstall } from '../hooks/usePWAInstall'
import toast from 'react-hot-toast'

export default function Settings() {
    const { user, userData, logOut } = useAuth()
    const { theme, toggle } = useTheme()
    const { isInstallable, promptInstall } = usePWAInstall()
    const [displayName, setDisplayName] = useState('')
    const [secretaryName, setSecretaryName] = useState('Secretary')
    const [secretaryTone, setSecretaryTone] = useState('professional')
    const [memoryCount, setMemoryCount] = useState(0)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (user) {
            setDisplayName(userData?.name || user.displayName || '')
            loadSettings()
        }
    }, [user, userData])

    const loadSettings = async () => {
        try {
            const settings = await getUserSettings(user.uid)
            if (settings.secretaryName) setSecretaryName(settings.secretaryName)
            if (settings.secretaryTone) setSecretaryTone(settings.secretaryTone)
            const count = await getMemoryCount(user.uid)
            setMemoryCount(count)
        } catch (err) {
            console.error('Failed to load settings:', err)
        }
    }

    const handleSaveName = async () => {
        if (!displayName.trim()) return
        setSaving(true)
        try {
            await updateUser(user.uid, { name: displayName.trim() })
            toast.success('Name updated')
        } catch (err) {
            toast.error('Failed to update name')
        } finally {
            setSaving(false)
        }
    }

    const handleSaveSecretarySettings = async () => {
        setSaving(true)
        try {
            await updateUserSettings(user.uid, { secretaryName, secretaryTone })
            toast.success('Settings saved')
        } catch (err) {
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    const handleClearMemory = async () => {
        if (!window.confirm('Are you sure you want to clear all secretary memory? This cannot be undone.')) return
        try {
            await clearSecretaryMemory(user.uid)
            setMemoryCount(0)
            toast.success('Memory cleared')
        } catch (err) {
            toast.error('Failed to clear memory')
        }
    }

    const handleClearHistory = async () => {
        if (!window.confirm('Are you sure you want to clear all conversation history? This cannot be undone.')) return
        try {
            await clearSecretaryMessages(user.uid)
            toast.success('Conversation history cleared')
        } catch (err) {
            toast.error('Failed to clear history')
        }
    }

    return (
        <div style={styles.page}>
            <h1 style={styles.pageTitle}>Settings</h1>

            {/* Profile */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Profile</h2>
                <div style={styles.card}>
                    <div style={styles.field}>
                        <label style={styles.label}>Display Name</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                style={styles.input}
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                onBlur={handleSaveName}
                            />
                        </div>
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Email</label>
                        <input style={{ ...styles.input, opacity: 0.6, cursor: 'not-allowed' }} value={userData?.email || user?.email || ''} readOnly />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Profile Photo</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} referrerPolicy="no-referrer" />
                            ) : (
                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600 }}>
                                    {displayName[0] || '?'}
                                </div>
                            )}
                            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Managed by Google</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Appearance & App */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Appearance & App</h2>
                <div style={styles.card}>
                    <div style={styles.field}>
                        <label style={styles.label}>Theme</label>
                        <button onClick={toggle} style={styles.themeToggle}>
                            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                        </button>
                    </div>
                    {isInstallable && (
                        <div style={styles.field}>
                            <label style={styles.label}>Install App</label>
                            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>Install Nexus on your device for a faster, app-like experience.</p>
                            <button onClick={promptInstall} style={styles.saveBtn}>
                                <Download size={14} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
                                Install Nexus
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Secretary */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Secretary Configuration</h2>
                <div style={styles.card}>
                    <div style={styles.field}>
                        <label style={styles.label}>Secretary Name</label>
                        <input
                            style={styles.input}
                            value={secretaryName}
                            onChange={e => setSecretaryName(e.target.value)}
                            placeholder="Secretary"
                        />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Communication Style</label>
                        <select
                            style={styles.input}
                            value={secretaryTone}
                            onChange={e => setSecretaryTone(e.target.value)}
                        >
                            <option value="professional">Professional</option>
                            <option value="casual">Casual</option>
                            <option value="direct">Direct</option>
                            <option value="warm">Warm</option>
                        </select>
                    </div>
                    <button onClick={handleSaveSecretarySettings} disabled={saving} style={styles.saveBtn}>
                        {saving ? 'Saving...' : 'Save Secretary Preferences'}
                    </button>
                </div>
            </div>

            {/* Reading & Health */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Reading & Health</h2>
                <div style={styles.card}>
                    <div style={{ ...styles.field, marginBottom: 12 }}>
                        <label style={styles.label}>Reading Preferences</label>
                        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Adjust your font size, line spacing, and theme directly within the Reading Room using the settings icon.</p>
                    </div>
                    <div style={{ ...styles.field, marginBottom: 0 }}>
                        <label style={styles.label}>Health Tracking</label>
                        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Your health metrics and check-in schedule can be customized directly on the Health page.</p>
                    </div>
                </div>
            </div>

            {/* Data & Privacy */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Data & Privacy</h2>
                <div style={styles.card}>
                    <div style={styles.field}>
                        <label style={styles.label}>Memory Count</label>
                        <span className="mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>{memoryCount}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2, display: 'block' }}>memories internally saved by your secretary</span>
                    </div>
                    <div style={{ ...styles.field, marginBottom: 12 }}>
                        <label style={{ ...styles.label, color: 'var(--accent-red)' }}>Danger Zone</label>
                        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>These actions are permanent and cannot be undone.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button onClick={handleClearMemory} style={styles.dangerBtn}>Clear all internal memory</button>
                        <button onClick={handleClearHistory} style={styles.dangerBtn}>Clear conversation history</button>
                    </div>
                </div>
            </div>

            {/* Account */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Account</h2>
                <div style={styles.card}>
                    <button onClick={logOut} style={styles.logoutBtn}>
                        <LogOut size={16} />
                        <span>Sign Out</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

const styles = {
    page: {
        padding: '32px 40px',
        maxWidth: 640,
        animation: 'fadeUp 0.3s ease',
    },
    pageTitle: {
        fontSize: 24,
        fontWeight: 600,
        color: 'var(--text)',
        letterSpacing: '-0.02em',
        marginBottom: 32,
    },
    section: {
        marginBottom: 28,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 12,
    },
    card: {
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
    },
    field: {
        marginBottom: 18,
    },
    label: {
        display: 'block',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text-dim)',
        marginBottom: 6,
    },
    input: {
        width: '100%',
        padding: '10px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 14,
        color: 'var(--text)',
        outline: 'none',
    },
    themeToggle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 14,
        color: 'var(--text)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    saveBtn: {
        padding: '10px 20px',
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'opacity 0.15s ease',
    },
    dangerBtn: {
        padding: '10px 16px',
        background: 'transparent',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        fontSize: 13,
        color: 'var(--accent-red)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    logoutBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 14,
        color: 'var(--text)',
        cursor: 'pointer',
    },
}
