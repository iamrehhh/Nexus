import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loadSecretaryMessages, saveSecretaryMessage, loadUpcomingReminders, completeReminder, deleteReminder } from '../lib/db'
import { Bot, Send, Bell, CheckCircle, Trash2, Calendar as CalendarIcon } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Secretary() {
    const { user } = useAuth()
    const location = useLocation()
    const [messages, setMessages] = useState([])
    const [reminders, setReminders] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const chatEndRef = useRef(null)
    const textareaRef = useRef(null)
    const hasSentPrefill = useRef(false)

    const firstName = user?.displayName?.split(' ')[0] || 'User'

    useEffect(() => {
        if (user) loadData()
    }, [user])

    // Handle prefill from dashboard
    useEffect(() => {
        if (location.state?.prefill && !hasSentPrefill.current && !loading) {
            hasSentPrefill.current = true
            sendMessage(location.state.prefill)
        }
    }, [location.state, loading])

    const loadData = async () => {
        try {
            const [msgs, rems] = await Promise.all([
                loadSecretaryMessages(user.uid),
                loadUpcomingReminders(user.uid)
            ])
            setMessages(msgs)
            setReminders(rems)
        } catch (err) {
            console.error('Failed to load data:', err)
        } finally {
            setLoading(false)
        }
    }

    const scrollToBottom = () => {
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const sendMessage = async (overrideMessage) => {
        const messageText = overrideMessage || input.trim()
        if (!messageText || sending) return

        setInput('')
        setSending(true)

        // Optimistically add user message
        const userMsg = { id: Date.now(), role: 'user', content: messageText, created_at: new Date().toISOString() }
        setMessages(prev => [...prev, userMsg])
        scrollToBottom()

        try {
            // Build conversation history for API (last 20 messages)
            const recentHistory = [...messages, userMsg].slice(-20).map(m => ({
                role: m.role, content: m.content
            }))

            const res = await fetch('/api/secretary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    userId: user.uid,
                    conversationHistory: recentHistory,
                    userName: firstName,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
            })

            if (!res.ok) throw new Error('Failed to get response')
            const data = await res.json()

            const assistantMsg = { id: Date.now() + 1, role: 'assistant', content: data.reply, created_at: new Date().toISOString() }
            setMessages(prev => [...prev, assistantMsg])

            // Check if any reminders were scheduled (reload Reminders just in case)
            if (data.reply && data.reply.toLowerCase().includes('reminder')) {
                loadUpcomingReminders(user.uid).then(setReminders)
            }

        } catch (err) {
            console.error('Secretary error:', err)
            toast.error('Failed to get response')
            // Remove optimistic user message on error
            setMessages(prev => prev.filter(m => m.id !== userMsg.id))
        } finally {
            setSending(false)
        }
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const handleTextareaInput = (e) => {
        setInput(e.target.value)
        // Auto-grow
        const ta = textareaRef.current
        if (ta) {
            ta.style.height = 'auto'
            ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
        }
    }

    const handleCompleteReminder = async (id) => {
        try {
            await completeReminder(id)
            setReminders(prev => prev.filter(r => r.id !== id))
            toast.success('Reminder completed')
        } catch (e) { toast.error('Failed to complete') }
    }

    const handleDeleteReminder = async (id) => {
        try {
            await deleteReminder(id)
            setReminders(prev => prev.filter(r => r.id !== id))
            toast.success('Reminder deleted')
        } catch (e) { toast.error('Failed to delete') }
    }

    const quickActions = [
        'Remind me to call Mom tomorrow at 6pm',
        'Plan my week',
        'What do I have today?',
        'Add a task for me',
    ]

    const formatTime = (ts) => {
        return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }

    const formatReminderDate = (isoStr) => {
        const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        const d = new Date(isoStr)

        const todayStr = new Date().toLocaleDateString('en-US', { timeZone: userTz })
        const tmrw = new Date()
        tmrw.setDate(tmrw.getDate() + 1)
        const tmrwStr = tmrw.toLocaleDateString('en-US', { timeZone: userTz })
        const dStr = d.toLocaleDateString('en-US', { timeZone: userTz })

        let prefix = ''
        if (dStr === todayStr) prefix = 'Today, '
        else if (dStr === tmrwStr) prefix = 'Tomorrow, '
        else prefix = d.toLocaleDateString('en-US', { timeZone: userTz, month: 'short', day: 'numeric' }) + ', '

        return prefix + d.toLocaleTimeString('en-US', { timeZone: userTz, hour: 'numeric', minute: '2-digit' })
    }

    const showQuickActions = messages.length === 0 || (!input && !sending)

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
        )
    }

    return (
        <div style={styles.page}>
            {/* Header */}
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Bot size={20} style={{ color: 'var(--accent)' }} />
                    <div>
                        <h1 style={styles.title}>Secretary</h1>
                        <p style={styles.subtitle}>your personal AI chief of staff</p>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Chat Column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={styles.chatArea}>
                        {messages.length === 0 && (
                            <div style={styles.emptyState}>
                                <Bot size={40} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
                                <p style={{ fontSize: 15, color: 'var(--text-dim)', marginBottom: 4 }}>No messages yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Start a conversation with your secretary</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={msg.id || i} style={{
                                ...styles.messageRow,
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                animation: 'fadeUp 0.25s ease',
                            }}>
                                <div style={{
                                    ...styles.messageBubble,
                                    ...(msg.role === 'user' ? styles.userBubble : styles.assistantBubble),
                                }}>
                                    <p style={styles.messageText}>{msg.content}</p>
                                    <span style={styles.messageTime}>{formatTime(msg.created_at)}</span>
                                </div>
                            </div>
                        ))}

                        {sending && (
                            <div style={{ ...styles.messageRow, justifyContent: 'flex-start', animation: 'fadeUp 0.25s ease' }}>
                                <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
                                    <div style={styles.typingIndicator}>
                                        <span style={{ ...styles.dot, animationDelay: '0s' }} />
                                        <span style={{ ...styles.dot, animationDelay: '0.15s' }} />
                                        <span style={{ ...styles.dot, animationDelay: '0.3s' }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Area */}
                    <div style={styles.inputArea}>
                        {showQuickActions && messages.length === 0 && (
                            <div style={styles.chipsRow}>
                                {quickActions.map(a => (
                                    <button key={a} style={styles.chip} onClick={() => sendMessage(a)}>
                                        {a}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div style={styles.inputRow}>
                            <textarea
                                ref={textareaRef}
                                style={styles.textarea}
                                placeholder="Message your secretary..."
                                value={input}
                                onChange={handleTextareaInput}
                                onKeyDown={handleKeyDown}
                                rows={1}
                            />
                            <button
                                onClick={() => sendMessage()}
                                disabled={!input.trim() || sending}
                                style={{
                                    ...styles.sendBtn,
                                    opacity: (!input.trim() || sending) ? 0.5 : 1,
                                }}
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Side Panel: Reminders */}
                <div style={styles.remindersPanel}>
                    <div style={styles.remindersHeader}>
                        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Upcoming Reminders</h2>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface-hover)', padding: '2px 8px', borderRadius: 12 }}>
                            {reminders.length}
                        </span>
                    </div>

                    <div style={styles.remindersList}>
                        {reminders.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
                                <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                                <p style={{ fontSize: 13 }}>No upcoming reminders</p>
                                <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Ask your secretary to remind you about something.</p>
                            </div>
                        ) : (
                            reminders.map(rem => (
                                <div key={rem.id} style={styles.reminderCard}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                        <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{rem.title}</h3>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => handleCompleteReminder(rem.id)} style={{ ...styles.iconBtn, color: 'var(--accent-green)' }}>
                                                <CheckCircle size={16} />
                                            </button>
                                            <button onClick={() => handleDeleteReminder(rem.id)} style={{ ...styles.iconBtn, color: 'var(--text-faint)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    {rem.description && (
                                        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.4 }}>{rem.description}</p>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
                                        <CalendarIcon size={12} />
                                        <span>{formatReminderDate(rem.due_date)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}

const styles = {
    page: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
    },
    header: {
        padding: '20px 28px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexShrink: 0,
    },
    title: {
        fontSize: 18,
        fontWeight: 600,
        color: 'var(--text)',
        letterSpacing: '-0.01em',
    },
    subtitle: {
        fontSize: 12,
        color: 'var(--text-dim)',
        marginTop: 1,
    },
    chatArea: {
        flex: 1,
        overflowY: 'auto',
        padding: '20px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    emptyState: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
    },
    messageRow: {
        display: 'flex',
        width: '100%',
    },
    messageBubble: {
        maxWidth: '70%',
        padding: '12px 16px',
        borderRadius: 14,
        position: 'relative',
    },
    userBubble: {
        background: 'rgba(99,102,241,0.15)',
        borderBottomRightRadius: 4,
    },
    assistantBubble: {
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--text)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
    },
    messageTime: {
        fontSize: 10,
        color: 'var(--text-faint)',
        marginTop: 6,
        display: 'block',
    },
    typingIndicator: {
        display: 'flex',
        gap: 4,
        padding: '4px 0',
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--text-dim)',
        animation: 'bounce 1.2s infinite',
        display: 'inline-block',
    },
    inputArea: {
        padding: '12px 28px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        flexShrink: 0,
    },
    chipsRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 10,
    },
    chip: {
        padding: '7px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        fontSize: 12,
        color: 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
    },
    inputRow: {
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
    },
    textarea: {
        flex: 1,
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        fontSize: 14,
        color: 'var(--text)',
        resize: 'none',
        outline: 'none',
        lineHeight: 1.5,
        maxHeight: 120,
        minHeight: 44,
    },
    sendBtn: {
        padding: '12px 14px',
        background: 'var(--accent)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.15s ease',
        flexShrink: 0,
    },
    remindersPanel: {
        width: 340,
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
    },
    remindersHeader: {
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg)',
    },
    remindersList: {
        flex: 1,
        overflowY: 'auto',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    reminderCard: {
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    },
    iconBtn: {
        background: 'none',
        border: 'none',
        padding: 4,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        transition: 'background 0.15s ease',
    }
}
