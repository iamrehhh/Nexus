import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loadTasks, addTask, completeTask, getTodayTaskCount, getPendingTaskCount, getMemoryCount, loadUpcomingReminders, getLastReadBook, getHealthCheckins, getHealthMetricsConfig } from '../lib/db'
import { CheckSquare, Clock, Brain, Calendar as CalendarIcon, Plus, Send, BookOpen, Activity } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Dashboard() {
    const { user, userData } = useAuth()
    const navigate = useNavigate()

    // Core State
    const [todayTasks, setTodayTasks] = useState([])
    const [upcomingReminders, setUpcomingReminders] = useState([])
    const [stats, setStats] = useState({ todayCount: 0, pendingCount: 0, memoryCount: 0, daysActive: 0 })

    // UI State
    const [showAddTask, setShowAddTask] = useState(false)
    const [newTask, setNewTask] = useState({ title: '', dueDate: '', priority: 'medium' })
    const [secretaryInput, setSecretaryInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [windowWidth, setWindowWidth] = useState(window.innerWidth)

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])
    const isMobile = windowWidth < 768

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
            const [tasks, todayCount, pendingCount, memoryCount, lastBook, healthCheckins, healthConfig, reminders] = await Promise.all([
                loadTasks(user.uid, { pendingOnly: true }),
                getTodayTaskCount(user.uid),
                getPendingTaskCount(user.uid),
                getMemoryCount(user.uid),
                getLastReadBook(user.uid),
                getHealthCheckins(user.uid, 1).catch(() => []),
                getHealthMetricsConfig(user.uid).catch(() => null),
                loadUpcomingReminders(user.uid).catch(() => [])
            ])

            const today = new Date()
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
            setUpcomingReminders(reminders || [])
            setStats({
                todayCount, pendingCount, memoryCount, daysActive, lastBook, healthStats
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
        'Give me ideas',
    ]

    const priorityColors = { high: 'var(--accent-red)', medium: 'var(--accent-amber)', low: 'var(--accent-green)' }

    if (loading) {
        return (
            <div style={{ padding: isMobile ? '24px 20px' : '48px 64px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ height: 36, width: 250, background: 'var(--border)', borderRadius: 8, marginBottom: 12, animation: 'pulse 1.5s infinite ease-in-out' }} />
                <div style={{ height: 20, width: 180, background: 'var(--border)', borderRadius: 8, marginBottom: 48, animation: 'pulse 1.5s infinite ease-in-out' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 48 }}>
                    {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 80, background: 'var(--border)', borderRadius: 16, animation: 'pulse 1.5s infinite ease-in-out' }} />)}
                </div>
            </div>
        )
    }

    const daysSinceHealth = stats.healthStats?.lastDate ? Math.floor((Date.now() - new Date(stats.healthStats.lastDate).getTime()) / (1000 * 3600 * 24)) : null
    const bookProgress = stats.lastBook ? Math.round((stats.lastBook.progress || 0) * 100) : 0

    return (
        <div style={{ padding: isMobile ? '24px 20px' : '48px 64px', maxWidth: 1200, margin: '0 auto', animation: 'fadeUp 0.3s ease' }}>

            {/* HERO SECTION */}
            <div style={{ marginBottom: 48 }}>
                <h1 style={{ fontSize: isMobile ? 32 : 40, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>{getGreeting()}, {firstName}</h1>
                <p style={{ fontSize: 16, color: 'var(--text-faint)', marginBottom: 24 }}>{getFormattedDate()}</p>
                <div style={{ background: 'var(--surface)', padding: '16px 24px', borderRadius: 16, border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', boxShadow: '0 0 12px var(--accent)' }} />
                    <span style={{ fontSize: 15, color: 'var(--text-dim)', lineHeight: 1.5, maxWidth: 640 }}>
                        We have <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{stats.todayCount} tasks</strong> for today.
                        {daysSinceHealth !== null && <span> It's been <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{daysSinceHealth} days</strong> since your last check-in.</span>}
                        {stats.lastBook && <span> You're currently <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{bookProgress}%</strong> through '{stats.lastBook.title}'.</span>}
                    </span>
                </div>
            </div>

            {/* STATS ROW */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 48 }}>
                {[
                    { label: "Tasks Today", value: stats.todayCount, icon: CheckSquare },
                    { label: 'Pending', value: stats.pendingCount, icon: Clock },
                    { label: 'Memory Saved', value: stats.memoryCount, icon: Brain },
                    { label: 'Days Active', value: stats.daysActive, icon: CalendarIcon },
                ].map((stat, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <stat.icon size={20} style={{ color: 'var(--text-dim)' }} />
                        </div>
                        <div>
                            <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{stat.value}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 48, alignItems: 'flex-start' }}>

                {/* LEFT COLUMN */}
                <div style={{ flex: '8 1 0%', minWidth: 0, width: '100%' }}>

                    {/* Quick Secretary */}
                    <div style={{ marginBottom: 48 }}>
                        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Secretary</h2>
                        <div style={{ display: 'flex', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.03)', alignItems: 'center', transition: 'box-shadow 0.2s ease' }}>
                            <div style={{ padding: 8, background: 'var(--accent)15', borderRadius: 10, color: 'var(--accent)' }}>
                                <Brain size={20} />
                            </div>
                            <input
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text)' }}
                                placeholder="Ask your secretary anything..."
                                value={secretaryInput}
                                onChange={e => setSecretaryInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSecretarySubmit()}
                            />
                            <button onClick={() => handleSecretarySubmit()} disabled={!secretaryInput.trim()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: secretaryInput.trim() ? 'var(--accent)' : 'var(--border)', color: secretaryInput.trim() ? '#fff' : 'var(--text-dim)', border: 'none', width: 40, height: 40, borderRadius: 10, cursor: secretaryInput.trim() ? 'pointer' : 'default', transition: 'all 0.2s ease' }}>
                                <Send size={18} style={{ marginLeft: -2 }} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                            {quickActions.map(a => (
                                <button key={a} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 20, fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer', transition: 'all 0.15s ease' }} onClick={() => handleSecretarySubmit(a)}>
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Today's Tasks */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Priorities</h2>
                            <button onClick={() => setShowAddTask(!showAddTask)} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Plus size={14} /> Add
                            </button>
                        </div>

                        {showAddTask && (
                            <div style={{ display: 'flex', gap: 12, marginBottom: 24, padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
                                <input
                                    style={{ flex: 1, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text)', outline: 'none' }}
                                    placeholder="Task title..."
                                    value={newTask.title}
                                    onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                                    autoFocus
                                />
                                <input type="date" style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text)', outline: 'none' }} value={newTask.dueDate} onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))} />
                                <button onClick={handleAddTask} style={{ padding: '0 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                            </div>
                        )}

                        {todayTasks.length === 0 && !showAddTask ? (
                            <div style={{ padding: '32px 0', borderTop: '1px solid var(--border)40' }}>
                                <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>You're all caught up for today.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {todayTasks.map((task, i) => (
                                    <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0', borderTop: i === 0 ? '1px solid var(--border)' : '1px solid var(--border)40' }}>
                                        <button onClick={() => handleCompleteTask(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-dim)', opacity: 0.6, transition: 'opacity 0.15s ease' }} className="hover-opacity-100">
                                            <CheckSquare size={20} />
                                        </button>
                                        <span style={{ flex: 1, fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>{task.title}</span>
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: priorityColors[task.priority] || priorityColors.medium, background: `${priorityColors[task.priority] || priorityColors.medium}15`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {task.priority}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div style={{ flex: '5 1 0%', minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 48 }}>

                    {/* Upcoming Reminders */}
                    <div>
                        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Upcoming</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {upcomingReminders.length === 0 ? (
                                <p style={{ fontSize: 14, color: 'var(--text-faint)' }}>Nothing scheduled.</p>
                            ) : (
                                upcomingReminders.map(r => (
                                    <div key={r.id} style={{ display: 'flex', gap: 16, padding: '20px', background: 'var(--surface)', border: '1px solid var(--border)40', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-amber)', marginTop: 4, boxShadow: '0 0 8px var(--accent-amber)40' }} />
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>{r.title}</div>
                                            {r.description && <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.4 }}>{r.description}</div>}
                                            <div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{new Date(r.due_date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Currently Reading */}
                    <div>
                        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Reading</h2>
                        {stats.lastBook ? (
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)40', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.03)', cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }} onClick={() => navigate(`/reading/${stats.lastBook.id}`)}>
                                <div style={{ height: 140, background: stats.lastBook.cover_color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 20, textAlign: 'center', letterSpacing: '-0.01em', textShadow: '0 2px 12px rgba(0,0,0,0.3)', lineHeight: 1.3 }}>{stats.lastBook.title}</span>
                                </div>
                                <div style={{ padding: 24 }}>
                                    <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 20 }}>{stats.lastBook.author || 'Unknown Author'}</p>
                                    <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
                                        <div style={{ height: '100%', background: 'var(--accent)', width: `${bookProgress}%`, borderRadius: 3 }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>Page {stats.lastBook.current_page || 1}</span>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Continue &rarr;</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: 40, background: 'transparent', border: '1px dashed var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', cursor: 'pointer' }} onClick={() => navigate('/reading')}>
                                <BookOpen size={28} style={{ color: 'var(--text-faint)', marginBottom: 16 }} />
                                <p style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>No active books</p>
                                <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>Visit your library to start reading</span>
                            </div>
                        )}
                    </div>

                    {/* Health Snapshot */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health</h2>
                            {stats.healthStats?.isOverdue && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--accent-amber)', color: '#fff', padding: '4px 10px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Overdue
                                </span>
                            )}
                        </div>

                        <div style={{ padding: 24, background: 'var(--surface)', border: '1px solid var(--border)40', borderRadius: 16, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }} onClick={() => navigate(stats.healthStats?.isOverdue ? '/health?tab=checkin' : '/health')}>
                            {stats.healthStats?.data ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {stats.healthStats.metrics.map(m => (
                                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, boxShadow: `0 0 8px ${m.color}80` }} />
                                                <span style={{ fontSize: 15, color: 'var(--text-dim)', fontWeight: 500 }}>{m.label}</span>
                                            </div>
                                            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                                                {typeof stats.healthStats.data[m.id] === 'boolean'
                                                    ? (stats.healthStats.data[m.id] ? 'Yes' : 'No')
                                                    : stats.healthStats.data[m.id] ?? '--'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                    <Activity size={28} style={{ color: 'var(--text-faint)', marginBottom: 16, margin: '0 auto' }} />
                                    <p style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>No check-in data</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .hover-opacity-100:hover { opacity: 1 !important; }
            `}} />
        </div>
    )
}
