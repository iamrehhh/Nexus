import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loadTasks, addTask, completeTask, uncompleteTask, getTodayTaskCount, getPendingTaskCount, getMemoryCount, loadVaultNotes } from '../lib/db'
import { CheckSquare, Clock, Brain, Calendar, Plus, Send, BookOpen, Activity, Link2, Github, Mail, Music, Calendar as CalendarIcon, Lock, Pin } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Dashboard() {
    const { user, userData } = useAuth()
    const navigate = useNavigate()
    const [todayTasks, setTodayTasks] = useState([])
    const [vaultNotes, setVaultNotes] = useState([])
    const [stats, setStats] = useState({ todayCount: 0, pendingCount: 0, memoryCount: 0, daysActive: 0 })
    const [showAddTask, setShowAddTask] = useState(false)
    const [newTask, setNewTask] = useState({ title: '', dueDate: '', priority: 'medium' })
    const [secretaryInput, setSecretaryInput] = useState('')
    const [loading, setLoading] = useState(true)

    const firstName = user?.displayName?.split(' ')[0] || 'User'

    const getGreeting = () => {
        const hour = new Date().getHours()
        if (hour < 12) return 'Good morning'
        if (hour < 17) return 'Good afternoon'
        return 'Good evening'
    }

    const getFormattedDate = () => {
        return new Date().toLocaleDateString('en-US', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        })
    }

    useEffect(() => {
        if (user) loadDashboardData()
    }, [user])

    const loadDashboardData = async () => {
        try {
            const { getLastReadBook, getHealthCheckins, getHealthMetricsConfig } = await import('../lib/db')

            const fetchService = async (srv) => {
                try {
                    const res = await fetch(`/api/services/${srv}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.uid }) })
                    return await res.json()
                } catch (e) { return { connected: false } }
            }

            const [tasks, todayCount, pendingCount, memoryCount, lastBook, healthCheckins, healthConfig, github, spotify, gmail, calendar, vaultNotesData] = await Promise.all([
                loadTasks(user.uid, { pendingOnly: true }),
                getTodayTaskCount(user.uid),
                getPendingTaskCount(user.uid),
                getMemoryCount(user.uid),
                getLastReadBook(user.uid),
                getHealthCheckins(user.uid, 1).catch(() => []),
                getHealthMetricsConfig(user.uid).catch(() => null),
                fetchService('github'),
                fetchService('spotify'),
                fetchService('gmail'),
                fetchService('calendar'),
                loadVaultNotes(user.uid, { folder: 'All Notes' }).catch(() => [])
            ])

            const today = new Date()
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

            const todayFiltered = tasks.filter(t => {
                if (!t.due_date) return false
                const d = new Date(t.due_date)
                return (d < endOfDay) && !t.completed
            })

            const createdAt = userData?.created_at ? new Date(userData.created_at) : new Date()
            const daysActive = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))

            let healthStats = null
            if (healthConfig && healthConfig.metrics) {
                const latest = healthCheckins?.[0]
                const isOverdue = !latest || ((Date.now() - new Date(latest.checkin_date).getTime()) > 7 * 24 * 60 * 60 * 1000)
                healthStats = {
                    lastDate: latest ? latest.checkin_date : null,
                    isOverdue,
                    data: latest?.data || null,
                    metrics: healthConfig.metrics.slice(0, 3)
                }
            }

            setTodayTasks(todayFiltered)
            setVaultNotes(vaultNotesData || [])
            setStats({
                todayCount, pendingCount, memoryCount, daysActive, lastBook, healthStats,
                services: { github, spotify, gmail, calendar }
            })
        } catch (err) {
            console.error('Failed to load dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleAddTask = async () => {
        if (!newTask.title.trim()) return
        try {
            const task = await addTask(user.uid, {
                title: newTask.title.trim(),
                dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : new Date().toISOString(),
                priority: newTask.priority,
            })
            setTodayTasks(prev => [task, ...prev])
            setStats(prev => ({ ...prev, todayCount: prev.todayCount + 1, pendingCount: prev.pendingCount + 1 }))
            setNewTask({ title: '', dueDate: '', priority: 'medium' })
            setShowAddTask(false)
            toast.success('Task added')
        } catch (err) {
            toast.error('Failed to add task')
        }
    }

    const handleCompleteTask = async (taskId) => {
        try {
            await completeTask(taskId)
            setTodayTasks(prev => prev.filter(t => t.id !== taskId))
            setStats(prev => ({
                ...prev,
                todayCount: Math.max(0, prev.todayCount - 1),
                pendingCount: Math.max(0, prev.pendingCount - 1),
            }))
        } catch (err) {
            toast.error('Failed to complete task')
        }
    }

    const handleSecretarySubmit = (msg) => {
        const message = msg || secretaryInput.trim()
        if (!message) return
        navigate('/secretary', { state: { prefill: message } })
    }

    const quickActions = [
        'Plan my week',
        'What should I focus on?',
        'Add a reminder',
        'Give me ideas',
    ]

    const priorityColors = { high: 'var(--accent-red)', medium: 'var(--accent-amber)', low: 'var(--accent-green)' }

    if (loading) {
        return (
            <div style={styles.page}>
                <div style={styles.header}>
                    <div style={{ height: 32, width: 200, background: 'var(--border)', borderRadius: 8, marginBottom: 8, animation: 'pulse 1.5s infinite ease-in-out' }} />
                    <div style={{ height: 20, width: 150, background: 'var(--border)', borderRadius: 8, animation: 'pulse 1.5s infinite ease-in-out' }} />
                </div>
                <div style={styles.statsGrid}>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{ ...styles.statCard, height: 88, background: 'var(--border)', animation: 'pulse 1.5s infinite ease-in-out' }} />
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
                    <div style={{ flex: '1 1 400px', height: 200, background: 'var(--border)', borderRadius: 12, animation: 'pulse 1.5s infinite ease-in-out' }} />
                    <div style={{ flex: '0 0 320px', height: 200, background: 'var(--border)', borderRadius: 12, animation: 'pulse 1.5s infinite ease-in-out' }} />
                </div>
                <div style={styles.previewGrid}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} style={{ ...styles.previewCard, height: 120, background: 'var(--border)', animation: 'pulse 1.5s infinite ease-in-out' }} />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div style={styles.page}>
            {/* Header */}
            <div style={styles.header}>
                <h1 style={styles.greeting}>{getGreeting()}, {firstName}</h1>
                <p style={styles.date}>{getFormattedDate()}</p>
            </div>

            {/* Stats Row */}
            <div style={styles.statsGrid}>
                {[
                    { label: 'Tasks Today', value: stats.todayCount, icon: CheckSquare, color: 'var(--accent-blue)' },
                    { label: 'Tasks Pending', value: stats.pendingCount, icon: Clock, color: 'var(--accent-amber)' },
                    { label: 'Memory Saved', value: stats.memoryCount, icon: Brain, color: 'var(--accent-green)' },
                    { label: 'Days Active', value: stats.daysActive, icon: Calendar, color: 'var(--accent)' },
                ].map((stat, i) => (
                    <div key={i} style={styles.statCard}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>{stat.label}</span>
                            <stat.icon size={16} style={{ color: stat.color }} />
                        </div>
                        <span className="mono" style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>{stat.value}</span>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
                {/* Today's Tasks */}
                <div style={{ flex: '1 1 400px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h2 style={styles.sectionTitle}>Today's Tasks</h2>
                    </div>

                    {todayTasks.length === 0 && !showAddTask ? (
                        <p style={{ fontSize: 14, color: 'var(--text-dim)', padding: '20px 0' }}>
                            No tasks for today. Ask your secretary to help you plan.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {todayTasks.map(task => (
                                <div key={task.id} style={styles.taskItem}>
                                    <button onClick={() => handleCompleteTask(task.id)} style={styles.checkbox}>
                                        <CheckSquare size={16} style={{ color: 'var(--text-faint)' }} />
                                    </button>
                                    <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{task.title}</span>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                                        color: priorityColors[task.priority] || priorityColors.medium,
                                        background: `${priorityColors[task.priority] || priorityColors.medium}15`,
                                        textTransform: 'uppercase', letterSpacing: '0.05em',
                                    }}>
                                        {task.priority}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {showAddTask ? (
                        <div style={styles.addTaskForm}>
                            <input
                                style={styles.input}
                                placeholder="Task title..."
                                value={newTask.title}
                                onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                                autoFocus
                            />
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="date"
                                    style={{ ...styles.input, flex: 1 }}
                                    value={newTask.dueDate}
                                    onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))}
                                />
                                <select
                                    style={{ ...styles.input, flex: 1 }}
                                    value={newTask.priority}
                                    onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                                <button onClick={handleAddTask} style={styles.saveBtn}>Save</button>
                                <button onClick={() => setShowAddTask(false)} style={styles.cancelBtn}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setShowAddTask(true)} style={styles.addTaskBtn}>
                            <Plus size={16} />
                            <span>Add task</span>
                        </button>
                    )}
                </div>

                {/* Reading Widget */}
                <div style={{ flex: '0 0 320px' }}>
                    <h2 style={{ ...styles.sectionTitle, marginBottom: 16 }}>Currently Reading</h2>
                    {stats.lastBook ? (
                        <div style={{ ...styles.previewCard, padding: 0, overflow: 'hidden' }} onClick={() => navigate(`/reading/${stats.lastBook.id}`)}>
                            <div style={{ height: 120, background: stats.lastBook.cover_color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                                <span style={{ color: '#fff', fontWeight: 600, fontSize: 16, textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{stats.lastBook.title}</span>
                            </div>
                            <div style={{ padding: '16px 20px' }}>
                                <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>{stats.lastBook.author || 'Unknown Author'}</p>
                                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                                    <div style={{ height: '100%', background: 'var(--accent)', width: `${Math.round((stats.lastBook.progress || 0) * 100)}%` }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Page {stats.lastBook.current_page || 1}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Continue →</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ ...styles.previewCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }} onClick={() => navigate('/reading')}>
                            <BookOpen size={32} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
                            <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 16 }}>No active books</p>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Browse library</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Secretary */}
            <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Quick Secretary</h2>
                <div style={styles.secretaryInputWrap}>
                    <input
                        style={styles.secretaryInput}
                        placeholder="Ask your secretary anything..."
                        value={secretaryInput}
                        onChange={e => setSecretaryInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSecretarySubmit()}
                    />
                    <button onClick={() => handleSecretarySubmit()} style={styles.sendBtn}>
                        <Send size={16} />
                    </button>
                </div>
                <div style={styles.chipsRow}>
                    {quickActions.map(a => (
                        <button key={a} style={styles.chip} onClick={() => handleSecretarySubmit(a)}>
                            {a}
                        </button>
                    ))}
                </div>
            </div>

            {/* Health & Previews */}
            <div style={styles.previewGrid}>
                {stats.healthStats ? (
                    <div style={{ ...styles.previewCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Activity size={20} style={{ color: 'var(--accent-green)' }} />
                                <h3 style={styles.sectionTitle}>Health Snapshot</h3>
                            </div>
                            {stats.healthStats.isOverdue && (
                                <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--accent-amber)20', color: 'var(--accent-amber)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Overdue
                                </span>
                            )}
                        </div>

                        {stats.healthStats.data ? (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                {stats.healthStats.metrics.map(m => (
                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
                                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{m.label}</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                            {typeof stats.healthStats.data[m.id] === 'boolean'
                                                ? (stats.healthStats.data[m.id] ? 'Yes' : 'No')
                                                : stats.healthStats.data[m.id] ?? '--'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No check-in data yet.</p>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                            <button onClick={() => navigate('/health')} style={{ flex: 1, padding: '8px', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 500, color: 'var(--text)', cursor: 'pointer' }}>
                                View Dashboard
                            </button>
                            {stats.healthStats.isOverdue && (
                                <button onClick={() => navigate('/health?tab=checkin')} style={{ flex: 1, padding: '8px', background: 'var(--accent-green)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    Check In Now
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={styles.previewCard} onClick={() => navigate('/health')}>
                        <Activity size={24} style={{ color: 'var(--accent-green)' }} />
                        <h3 style={styles.previewTitle}>Health Tracker</h3>
                        <p style={styles.previewDesc}>Track your weekly health check-ins</p>
                    </div>
                )}

                {/* Vault Widget */}
                <div style={{ ...styles.previewCard, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={() => navigate('/vault')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Lock size={20} style={{ color: 'var(--accent-purple)' }} />
                            <h3 style={styles.sectionTitle}>Vault</h3>
                        </div>
                        <span style={{ fontSize: 11, background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-dim)' }}>
                            {vaultNotes.length} notes
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                        {vaultNotes.slice(0, 3).map(note => (
                            <div key={note.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {note.is_pinned ? <Pin size={12} style={{ color: 'var(--accent)' }} /> : <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-faint)' }} />}
                                <span style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{note.title || 'Untitled'}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(note.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                            </div>
                        ))}
                        {vaultNotes.length === 0 && (
                            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No notes yet. Click to create one.</p>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
                    {/* GitHub Tile */}
                    <div style={{ ...styles.previewCard, padding: 16 }} onClick={() => navigate('/connect')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Github size={16} /> <span style={{ fontSize: 13, fontWeight: 600 }}>GitHub</span>
                        </div>
                        {stats.services?.github?.connected ? (
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>{stats.services.github.commitStreak} Day Streak 🔥</div>
                                {stats.services.github.recentCommits?.[0] && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats.services.github.recentCommits[0].message}</div>}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Connect GitHub</div>
                        )}
                    </div>

                    {/* Spotify Tile */}
                    <div style={{ ...styles.previewCard, padding: 16 }} onClick={() => navigate('/connect')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Music size={16} color="#1DB954" /> <span style={{ fontSize: 13, fontWeight: 600 }}>Spotify</span>
                        </div>
                        {stats.services?.spotify?.connected ? (
                            stats.services.spotify.currentlyPlaying ? (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <img src={stats.services.spotify.currentlyPlaying.albumArt} style={{ width: 24, height: 24, borderRadius: 4 }} />
                                    <div style={{ overflow: 'hidden' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{stats.services.spotify.currentlyPlaying.trackName}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{stats.services.spotify.currentlyPlaying.artist}</div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Last: {stats.services.spotify.recentlyPlayed?.[0]?.name}</div>
                            )
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Connect Spotify</div>
                        )}
                    </div>

                    {/* Gmail Tile */}
                    <div style={{ ...styles.previewCard, padding: 16 }} onClick={() => navigate('/connect')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Mail size={16} color="#EA4335" /> <span style={{ fontSize: 13, fontWeight: 600 }}>Gmail</span>
                        </div>
                        {stats.services?.gmail?.connected ? (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{stats.services.gmail.unreadCount} unread</div>
                                {stats.services.gmail.emails?.[0] && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats.services.gmail.emails[0].subject}</div>}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Connect Gmail</div>
                        )}
                    </div>

                    {/* Calendar Tile */}
                    <div style={{ ...styles.previewCard, padding: 16 }} onClick={() => navigate('/connect')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <CalendarIcon size={16} color="#4285F4" /> <span style={{ fontSize: 13, fontWeight: 600 }}>Calendar</span>
                        </div>
                        {stats.services?.calendar?.connected ? (
                            stats.services.calendar.nextEvent ? (
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{new Date(stats.services.calendar.nextEvent.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats.services.calendar.nextEvent.title}</div>
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No events today</div>
                            )
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Connect Calendar</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

const styles = {
    page: {
        padding: '32px 40px',
        maxWidth: 960,
        animation: 'fadeUp 0.3s ease',
    },
    header: {
        marginBottom: 32,
    },
    greeting: {
        fontSize: 28,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: 'var(--text)',
        marginBottom: 4,
    },
    date: {
        fontSize: 14,
        color: 'var(--text-dim)',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 32,
    },
    statCard: {
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 20px',
        transition: 'border-color 0.15s ease',
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: 'var(--text)',
        letterSpacing: '-0.01em',
    },
    taskItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        transition: 'border-color 0.15s ease',
    },
    checkbox: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        opacity: 0.6,
        transition: 'opacity 0.15s ease',
    },
    addTaskForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginTop: 8,
    },
    input: {
        padding: '10px 12px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 14,
        color: 'var(--text)',
        outline: 'none',
        width: '100%',
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
        whiteSpace: 'nowrap',
    },
    cancelBtn: {
        padding: '10px 16px',
        background: 'transparent',
        color: 'var(--text-dim)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 13,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    addTaskBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'transparent',
        border: '1px dashed var(--border)',
        borderRadius: 10,
        color: 'var(--text-dim)',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        marginTop: 8,
        transition: 'all 0.15s ease',
        width: '100%',
    },
    secretaryInputWrap: {
        display: 'flex',
        gap: 8,
        marginTop: 12,
    },
    secretaryInput: {
        flex: 1,
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        fontSize: 14,
        color: 'var(--text)',
        outline: 'none',
    },
    sendBtn: {
        padding: '12px 16px',
        background: 'var(--accent)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
    },
    chipsRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 12,
    },
    chip: {
        padding: '8px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        fontSize: 13,
        color: 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
    },
    previewGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 32,
    },
    previewCard: {
        padding: '24px 20px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
    previewTitle: {
        fontSize: 15,
        fontWeight: 600,
        color: 'var(--text)',
        marginTop: 12,
        marginBottom: 6,
    },
    previewDesc: {
        fontSize: 13,
        color: 'var(--text-dim)',
        lineHeight: 1.4,
    },
}
