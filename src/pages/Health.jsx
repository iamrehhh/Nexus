import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getHealthMetricsConfig, saveHealthMetricsConfig, getHealthCheckins, saveHealthCheckin, deleteHealthCheckin, getLatestHealthInsight } from '../lib/db'
import { Activity, LayoutDashboard, CheckSquare, Settings2, Plus, Moon, Zap, Droplets, Smile, Brain, Heart, Coffee, Dumbbell, Apple, Trash2, Edit2, ChevronUp, ChevronDown, Minus, Bot, Calendar as CalendarIcon } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'

// Default metrics to seed for new users
const DEFAULT_METRICS = [
    { id: 'sleep', label: 'Sleep Quality', type: 'scale', min: 1, max: 10, unit: '', icon: 'moon', color: '#6366f1', description: 'How well did you sleep overall?' },
    { id: 'energy', label: 'Energy Level', type: 'scale', min: 1, max: 10, unit: '', icon: 'zap', color: '#f59e0b', description: 'How was your energy throughout the day?' },
    { id: 'exercise', label: 'Exercise', type: 'number', min: 0, max: 7, unit: 'days', icon: 'dumbbell', color: '#10b981', description: 'How many days did you exercise?' },
    { id: 'water', label: 'Water Intake', type: 'number', min: 0, max: 20, unit: 'glasses', icon: 'droplets', color: '#3b82f6', description: 'How many glasses of water per day?' },
    { id: 'mood', label: 'Overall Mood', type: 'scale', min: 1, max: 10, unit: '', icon: 'smile', color: '#ec4899', description: 'How was your mood this week overall?' },
    { id: 'stress', label: 'Stress Level', type: 'scale', min: 1, max: 10, unit: '', icon: 'brain', color: '#ef4444', description: 'How stressed did you feel? (1 = very calm, 10 = very stressed)' }
]

const ICONS = {
    moon: Moon, zap: Zap, activity: Activity, droplets: Droplets, smile: Smile,
    brain: Brain, heart: Heart, coffee: Coffee, dumbbell: Dumbbell, apple: Apple
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6']
const MOODS = ['😔', '😕', '😐', '🙂', '😄']

export default function Health() {
    const { user } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()

    // Get tab from URL or default to dashboard
    const activeTab = searchParams.get('tab') || 'dashboard'
    const setActiveTab = (tab) => setSearchParams({ tab })

    const [loading, setLoading] = useState(true)
    const [config, setConfig] = useState(null)
    const [checkins, setCheckins] = useState([])
    const [insight, setInsight] = useState(null)
    const [insightLoading, setInsightLoading] = useState(false)

    // Check-in Form State
    const [checkinDate, setCheckinDate] = useState(new Date().toISOString().split('T')[0])
    const [formData, setFormData] = useState({})
    const [notes, setNotes] = useState('')
    const [moodSummary, setMoodSummary] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    // Config Form State
    const [customMetrics, setCustomMetrics] = useState([])
    const [showMetricModal, setShowMetricModal] = useState(false)
    const [editingMetric, setEditingMetric] = useState(null)
    const [metricForm, setMetricForm] = useState({ label: '', description: '', type: 'scale', min: 1, max: 10, unit: '', icon: 'activity', color: '#6366f1' })
    const [schedule, setSchedule] = useState('weekly')

    useEffect(() => {
        if (user) loadData()
    }, [user])

    // Load existing check-in data when date changes
    useEffect(() => {
        if (!config) return
        const existing = checkins.find(c => c.checkin_date === checkinDate)
        if (existing) {
            setFormData(existing.data || {})
            setNotes(existing.notes || '')
            setMoodSummary(existing.mood_summary || '')
        } else {
            // Setup defaults based on config
            const defaults = {}
            config.metrics.forEach(m => {
                if (m.type === 'scale') defaults[m.id] = Math.max(m.min, Math.min(5, m.max))
                else if (m.type === 'number') defaults[m.id] = m.min || 0
                else if (m.type === 'boolean') defaults[m.id] = false
                else defaults[m.id] = ''
            })
            setFormData(defaults)
            setNotes('')
            setMoodSummary('')
        }
    }, [checkinDate, checkins, config])

    const loadData = async () => {
        try {
            setLoading(true)
            let currConfig = await getHealthMetricsConfig(user.uid)

            // Seed defaults if no config
            if (!currConfig || !currConfig.metrics || currConfig.metrics.length === 0) {
                currConfig = await saveHealthMetricsConfig(user.uid, DEFAULT_METRICS, 'weekly', 0)
            }

            setConfig(currConfig)
            setCustomMetrics(currConfig.metrics)
            setSchedule(currConfig.checkin_schedule)

            const [pastCheckins, latestInsight] = await Promise.all([
                getHealthCheckins(user.uid, 12),
                getLatestHealthInsight(user.uid)
            ])
            setCheckins(pastCheckins)
            setInsight(latestInsight)

        } catch (err) {
            console.error(err)
            toast.error('Failed to load health data')
        } finally {
            setLoading(false)
        }
    }

    // --- CHECK-IN ACTIONS ---
    const handleSaveCheckin = async () => {
        if (Object.keys(formData).length === 0) return toast.error('Check-in form is empty')
        try {
            setIsSaving(true)
            const saved = await saveHealthCheckin(user.uid, checkinDate, formData, notes, moodSummary)

            // Update local state
            const updatedCheckins = [...checkins]
            const idx = updatedCheckins.findIndex(c => c.checkin_date === checkinDate)
            if (idx >= 0) updatedCheckins[idx] = saved
            else updatedCheckins.unshift(saved)

            // Re-sort
            updatedCheckins.sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date))
            setCheckins(updatedCheckins)

            toast.success('Check-in saved!')
            setActiveTab('dashboard')

            // Trigger background AI refresh if enough data
            if (updatedCheckins.length >= 3) {
                generateInsight(updatedCheckins)
            }

        } catch (err) {
            toast.error('Failed to save check-in')
        } finally {
            setIsSaving(false)
        }
    }

    const handleChangeForm = (id, val) => {
        setFormData(prev => ({ ...prev, [id]: val }))
    }

    // --- AI INSIGHTS ---
    const generateInsight = async (checkinsToUse = checkins) => {
        if (checkinsToUse.length < 3) return toast.error('Complete at least 3 check-ins to generate insights')
        try {
            setInsightLoading(true)
            const res = await fetch('/api/health-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.uid,
                    checkins: checkinsToUse.slice(0, 8),
                    metricsConfig: config.metrics
                })
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setInsight({ insight_text: data.insight, generated_at: data.generatedAt })
        } catch (err) {
            console.error(err)
            toast.error('Failed to generate insights')
        } finally {
            setInsightLoading(false)
        }
    }

    // --- CONFIG ACTIONS ---
    const handleSaveConfig = async () => {
        try {
            await saveHealthMetricsConfig(user.uid, customMetrics, schedule, 0)
            setConfig({ ...config, metrics: customMetrics, checkin_schedule: schedule })
            toast.success('Configuration saved')
        } catch (err) {
            toast.error('Failed to save configuration')
        }
    }

    const openMetricModal = (metric = null) => {
        if (metric) {
            setEditingMetric(metric)
            setMetricForm({ ...metric })
        } else {
            setEditingMetric(null)
            setMetricForm({ label: '', description: '', type: 'scale', min: 1, max: 10, unit: '', icon: 'activity', color: COLORS[Math.floor(Math.random() * COLORS.length)] })
        }
        setShowMetricModal(true)
    }

    const submitMetricForm = () => {
        if (!metricForm.label.trim()) return toast.error('Label is required')

        const newMetric = {
            ...metricForm,
            id: editingMetric ? editingMetric.id : `metric_${Date.now()}`
        }

        if (editingMetric) {
            setCustomMetrics(prev => prev.map(m => m.id === editingMetric.id ? newMetric : m))
        } else {
            setCustomMetrics(prev => [...prev, newMetric])
        }
        setShowMetricModal(false)
    }

    const removeMetric = (id) => {
        setCustomMetrics(prev => prev.filter(m => m.id !== id))
    }

    const addPreset = (preset) => {
        if (customMetrics.some(m => m.id === preset.id)) return
        setCustomMetrics(prev => [...prev, preset])
    }

    const moveMetric = (index, direction) => {
        if ((direction === -1 && index === 0) || (direction === 1 && index === customMetrics.length - 1)) return
        const newMetrics = [...customMetrics]
        const temp = newMetrics[index]
        newMetrics[index] = newMetrics[index + direction]
        newMetrics[index + direction] = temp
        setCustomMetrics(newMetrics)
    }

    // --- RENDER HELPERS ---
    const chartData = useMemo(() => {
        return [...checkins].reverse().map(c => {
            const dateStr = new Date(c.checkin_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return { name: dateStr, ...c.data }
        })
    }, [checkins])

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
                <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--accent-green)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
        )
    }

    return (
        <div style={s.page}>
            {/* Header */}
            <div style={s.header}>
                <div>
                    <h1 style={s.title}>Health Tracking</h1>
                    <p style={s.subtitle}>Monitor and improve your wellbeing</p>
                </div>
                <div style={s.tabs}>
                    <button onClick={() => setActiveTab('dashboard')} style={{ ...s.tabBtn, ...(activeTab === 'dashboard' ? s.activeTab : {}) }}>
                        <LayoutDashboard size={14} /> Dashboard
                    </button>
                    <button onClick={() => setActiveTab('checkin')} style={{ ...s.tabBtn, ...(activeTab === 'checkin' ? s.activeTab : {}) }}>
                        <CheckSquare size={14} /> Check-in
                    </button>
                    <button onClick={() => setActiveTab('configure')} style={{ ...s.tabBtn, ...(activeTab === 'configure' ? s.activeTab : {}) }}>
                        <Settings2 size={14} /> Configure
                    </button>
                </div>
            </div>

            {/* TAB: DASHBOARD */}
            {activeTab === 'dashboard' && (
                <div style={s.fadeContent}>
                    {checkins.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                            <Activity size={48} style={{ color: 'var(--text-faint)', margin: '0 auto 16px' }} />
                            <h2 style={{ fontSize: 18, color: 'var(--text)', marginBottom: 8, fontWeight: 600 }}>No health data yet</h2>
                            <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 24, maxWidth: 300, marginсылка: '0 auto 24px' }}>Complete your first check-in to start tracking your wellbeing.</p>
                            <button onClick={() => setActiveTab('checkin')} style={s.primaryBtn}>Start Check-in</button>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                                    Last check-in: {new Date(checkins[0].checkin_date).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </span>
                                <button onClick={() => setActiveTab('checkin')} style={s.primaryBtnSmall}>Check In Now</button>
                            </div>

                            {/* Latest Snapshot */}
                            <div style={s.snapshotGrid}>
                                {config?.metrics.slice(0, 4).map(m => {
                                    const latestVal = checkins[0]?.data[m.id]
                                    const prevVal = checkins[1]?.data[m.id]
                                    const IconInfo = ICONS[m.icon] || Activity

                                    let trend = null
                                    if (prevVal !== undefined && typeof latestVal === 'number' && typeof prevVal === 'number') {
                                        if (latestVal > prevVal) trend = <ChevronUp size={14} style={{ color: 'var(--accent-green)' }} />
                                        else if (latestVal < prevVal) trend = <ChevronDown size={14} style={{ color: 'var(--accent-red)' }} />
                                        else trend = <Minus size={14} style={{ color: 'var(--text-faint)' }} />
                                    }

                                    return (
                                        <div key={m.id} style={s.snapCard}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                <IconInfo size={14} style={{ color: m.color }} />
                                                <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500, flex: 1 }}>{m.label}</span>
                                                {trend}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                                <span style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>
                                                    {latestVal !== undefined ? (typeof latestVal === 'boolean' ? (latestVal ? 'Yes' : 'No') : latestVal) : '--'}
                                                </span>
                                                {m.unit && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{m.unit}</span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* AI Insights */}
                            <div style={s.insightCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-green)20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Bot size={16} style={{ color: 'var(--accent-green)' }} />
                                        </div>
                                        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Secretary's Analysis</h3>
                                    </div>
                                    <button
                                        onClick={() => generateInsight()}
                                        disabled={insightLoading || checkins.length < 3}
                                        style={s.refreshBtn}
                                    >
                                        {insightLoading ? 'Analysing...' : 'Refresh Analysis'}
                                    </button>
                                </div>

                                {insight ? (
                                    <>
                                        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                            {insight.insight_text}
                                        </div>
                                        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 16 }}>
                                            Generated {new Date(insight.generated_at).toLocaleString()}
                                        </p>
                                    </>
                                ) : (
                                    <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                                        {checkins.length < 3 ? 'Complete at least 3 check-ins to generate AI insights.' : 'Click Refresh Analysis to generate your first insight.'}
                                    </p>
                                )}
                            </div>

                            {/* Charts Grid */}
                            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Trends</h3>
                            <div style={s.chartsGrid}>
                                {config?.metrics.filter(m => m.type === 'scale' || m.type === 'number').map(m => {
                                    const IconInfo = ICONS[m.icon] || Activity
                                    return (
                                        <div key={m.id} style={{ ...s.chartCard, borderTop: `2px solid ${m.color}60` }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                                                <IconInfo size={14} style={{ color: m.color }} />
                                                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.label}</span>
                                            </div>
                                            {chartData.length < 2 ? (
                                                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Need more check-ins to show trends</span>
                                                </div>
                                            ) : (
                                                <div style={{ height: 160 }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={chartData}>
                                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-faint)' }} dy={10} />
                                                            <YAxis hide domain={[m.min || 0, m.max || 'dataMax']} />
                                                            <Tooltip
                                                                contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                                                                itemStyle={{ color: 'var(--text)' }}
                                                                labelStyle={{ color: 'var(--text-dim)', marginBottom: 4 }}
                                                            />
                                                            <Line type="monotone" dataKey={m.id} stroke={m.color} strokeWidth={2} dot={{ r: 3, fill: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 5 }} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                        </>
                    )}
                </div>
            )}

            {/* TAB: CHECKIN */}
            {activeTab === 'checkin' && (
                <div style={{ ...s.fadeContent, maxWidth: 640, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Weekly Check-in</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <CalendarIcon size={14} style={{ color: 'var(--text-dim)' }} />
                            <input
                                type="date"
                                value={checkinDate}
                                onChange={e => setCheckinDate(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, outline: 'none' }}
                            />
                        </div>
                    </div>

                    {checkins.some(c => c.checkin_date === checkinDate) && (
                        <div style={{ padding: '10px 16px', background: 'var(--accent-amber)10', borderLeft: '3px solid var(--accent-amber)', borderRadius: 4, marginBottom: 24, fontSize: 13, color: 'var(--text)' }}>
                            You are editing an existing check-in for this date.
                        </div>
                    )}

                    {!config?.metrics || config.metrics.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                            <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 16 }}>You haven't configured your health metrics yet.</p>
                            <button onClick={() => setActiveTab('configure')} style={s.primaryBtnSmall}>Set Up Metrics</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {config.metrics.map(m => (
                                <div key={m.id} style={s.formGroup}>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{m.label}</label>
                                        {m.description && <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{m.description}</p>}
                                    </div>

                                    {m.type === 'scale' && (
                                        <div style={{ padding: '10px 0' }}>
                                            <div style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, color: m.color, marginBottom: 8 }}>
                                                {formData[m.id]}
                                            </div>
                                            <input
                                                type="range"
                                                min={m.min} max={m.max}
                                                value={formData[m.id] || m.min}
                                                onChange={e => handleChangeForm(m.id, Number(e.target.value))}
                                                style={{ ...s.slider, accentColor: m.color }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-faint)' }}>
                                                <span>{m.min}</span><span>{m.max}</span>
                                            </div>
                                        </div>
                                    )}

                                    {m.type === 'number' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                                <button onClick={() => handleChangeForm(m.id, Math.max(m.min, (formData[m.id] || 0) - 1))} style={s.numBtn}>-</button>
                                                <input
                                                    type="number"
                                                    min={m.min} max={m.max}
                                                    value={formData[m.id] === undefined ? '' : formData[m.id]}
                                                    onChange={e => handleChangeForm(m.id, Number(e.target.value))}
                                                    style={{ width: 60, textAlign: 'center', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 16, outline: 'none' }}
                                                />
                                                <button onClick={() => handleChangeForm(m.id, Math.min(m.max, (formData[m.id] || 0) + 1))} style={s.numBtn}>+</button>
                                            </div>
                                            {m.unit && <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>{m.unit}</span>}
                                        </div>
                                    )}

                                    {m.type === 'boolean' && (
                                        <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 12 }}>
                                            <input
                                                type="checkbox"
                                                checked={!!formData[m.id]}
                                                onChange={e => handleChangeForm(m.id, e.target.checked)}
                                                style={{ width: 22, height: 22, accentColor: m.color, cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: 15, color: formData[m.id] ? 'var(--text)' : 'var(--text-dim)' }}>
                                                {formData[m.id] ? 'Yes' : 'No'}
                                            </span>
                                        </label>
                                    )}

                                    {m.type === 'text' && (
                                        <input
                                            type="text"
                                            value={formData[m.id] || ''}
                                            onChange={e => handleChangeForm(m.id, e.target.value)}
                                            style={{ width: '100%', padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' }}
                                            placeholder="Enter value..."
                                        />
                                    )}
                                </div>
                            ))}

                            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />

                            <div style={s.formGroup}>
                                <label style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12, display: 'block' }}>How are you feeling overall?</label>
                                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                                    {MOODS.map(emoji => (
                                        <button
                                            key={emoji}
                                            onClick={() => setMoodSummary(emoji)}
                                            style={{
                                                fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', transition: 'transform 0.15s ease',
                                                transform: moodSummary === emoji ? 'scale(1.2)' : 'scale(1)',
                                                opacity: moodSummary === emoji ? 1 : 0.5,
                                                filter: moodSummary === emoji ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' : 'none'
                                            }}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    placeholder="Any notes about this week? (optional)"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={4}
                                    style={{ width: '100%', padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, resize: 'vertical', outline: 'none' }}
                                />
                            </div>

                            <button onClick={handleSaveCheckin} disabled={isSaving} style={{ ...s.primaryBtn, padding: '14px 24px', fontSize: 15, width: '100%', marginTop: 10 }}>
                                {isSaving ? 'Saving...' : 'Save Check-in'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: CONFIGURE */}
            {activeTab === 'configure' && (
                <div style={{ ...s.fadeContent, maxWidth: 640, margin: '0 auto' }}>
                    <div style={{ marginBottom: 32 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Configure Your Metrics</h2>
                        <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>Choose what health metrics matter to you. You can add, remove, and reorder them.</p>
                    </div>

                    <div style={{ marginBottom: 40 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Active Metrics</h3>
                            <button onClick={() => openMetricModal()} style={s.addBtn}><Plus size={14} /> Custom Metric</button>
                        </div>

                        {customMetrics.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--text-dim)', padding: 20, textAlign: 'center', background: 'var(--surface)', borderRadius: 8 }}>No active metrics. Add some below!</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {customMetrics.map((m, i) => {
                                    const IconInfo = ICONS[m.icon] || Activity
                                    return (
                                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <button onClick={() => moveMetric(i, -1)} disabled={i === 0} style={{ border: 'none', background: 'none', padding: 2, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.2 : 1, color: 'var(--text-dim)' }}><ChevronUp size={16} /></button>
                                                <button onClick={() => moveMetric(i, 1)} disabled={i === customMetrics.length - 1} style={{ border: 'none', background: 'none', padding: 2, cursor: i === customMetrics.length - 1 ? 'default' : 'pointer', opacity: i === customMetrics.length - 1 ? 0.2 : 1, color: 'var(--text-dim)' }}><ChevronDown size={16} /></button>
                                            </div>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${m.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <IconInfo size={16} style={{ color: m.color }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {m.label}
                                                    <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg)', borderRadius: 4, color: 'var(--text-dim)', border: '1px solid var(--border)' }}>{m.type}</span>
                                                </div>
                                                {m.description && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>{m.description}</div>}
                                            </div>
                                            <button onClick={() => openMetricModal(m)} style={s.iconBtn}><Edit2 size={16} /></button>
                                            <button onClick={() => removeMetric(m.id)} style={{ ...s.iconBtn, color: 'var(--accent-red)' }}><Trash2 size={16} /></button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: 40 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Presets</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                            {DEFAULT_METRICS.map(preset => {
                                const isAdded = customMetrics.some(m => m.id === preset.id)
                                const IconInfo = ICONS[preset.icon] || Activity
                                return (
                                    <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                        <IconInfo size={18} style={{ color: preset.color }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{preset.label}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{preset.type}</div>
                                        </div>
                                        <button
                                            onClick={() => addPreset(preset)}
                                            disabled={isAdded}
                                            style={{ ...s.smallBtn, ...(isAdded ? { background: 'transparent', color: 'var(--accent-green)', borderColor: 'var(--accent-green)40' } : {}) }}
                                        >
                                            {isAdded ? 'Added ✓' : 'Add'}
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div style={{ marginBottom: 40 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>Check-in Schedule</h3>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {['daily', 'weekly'].map(sch => (
                                <button key={sch} onClick={() => setSchedule(sch)} style={{ ...s.radioBtn, ...(schedule === sch ? s.radioBtnActive : {}) }}>
                                    <div style={s.radioCircle}>
                                        {schedule === sch && <div style={s.radioCircleInner} />}
                                    </div>
                                    {sch.charAt(0).toUpperCase() + sch.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleSaveConfig} style={{ ...s.primaryBtn, width: '100%', padding: '14px 24px', fontSize: 15 }}>
                        Save Configuration
                    </button>
                </div>
            )}

            {/* ADD/EDIT METRIC MODAL */}
            {showMetricModal && (
                <div style={s.modalOverlay}>
                    <div style={s.modal}>
                        <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>{editingMetric ? 'Edit Metric' : 'New Custom Metric'}</h3>

                        <div style={s.formGroup}>
                            <label style={s.label}>Label</label>
                            <input style={s.input} value={metricForm.label} onChange={e => setMetricForm({ ...metricForm, label: e.target.value })} placeholder="e.g. Caffeine Intake" />
                        </div>

                        <div style={s.formGroup}>
                            <label style={s.label}>Description (optional)</label>
                            <input style={s.input} value={metricForm.description} onChange={e => setMetricForm({ ...metricForm, description: e.target.value })} placeholder="e.g. Cups of coffee today" />
                        </div>

                        <div style={s.formGroup}>
                            <label style={s.label}>Input Type</label>
                            <select style={s.input} value={metricForm.type} onChange={e => setMetricForm({ ...metricForm, type: e.target.value })}>
                                <option value="scale">Rating Scale (1-10)</option>
                                <option value="number">Number input</option>
                                <option value="boolean">Yes/No toggle</option>
                                <option value="text">Text input</option>
                            </select>
                        </div>

                        {(metricForm.type === 'scale' || metricForm.type === 'number') && (
                            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={s.label}>Min Value</label>
                                    <input type="number" style={s.input} value={metricForm.min} onChange={e => setMetricForm({ ...metricForm, min: Number(e.target.value) })} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={s.label}>Max Value</label>
                                    <input type="number" style={s.input} value={metricForm.max} onChange={e => setMetricForm({ ...metricForm, max: Number(e.target.value) })} />
                                </div>
                            </div>
                        )}

                        {metricForm.type === 'number' && (
                            <div style={s.formGroup}>
                                <label style={s.label}>Unit Label (optional)</label>
                                <input style={s.input} value={metricForm.unit} onChange={e => setMetricForm({ ...metricForm, unit: e.target.value })} placeholder="e.g. cups, hours, km" />
                            </div>
                        )}

                        <div style={s.formGroup}>
                            <label style={s.label}>Icon</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {Object.keys(ICONS).map(id => {
                                    const IconInfo = ICONS[id]
                                    return (
                                        <button key={id} onClick={() => setMetricForm({ ...metricForm, icon: id })} style={{ ...s.swatchBtn, ...(metricForm.icon === id ? { borderColor: 'var(--accent)' } : {}) }}>
                                            <IconInfo size={16} style={{ color: metricForm.icon === id ? 'var(--accent)' : 'var(--text-dim)' }} />
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div style={s.formGroup}>
                            <label style={s.label}>Color</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {COLORS.map(c => (
                                    <button key={c} onClick={() => setMetricForm({ ...metricForm, color: c })} style={{ ...s.colorCircle, background: c, ...(metricForm.color === c ? { boxShadow: `0 0 0 2px var(--bg2), 0 0 0 4px ${c}` } : {}) }} />
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
                            <button onClick={submitMetricForm} style={{ ...s.primaryBtn, flex: 1 }}>Save Metric</button>
                            <button onClick={() => setShowMetricModal(false)} style={{ ...s.secondaryBtn, flex: 1 }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const s = {
    page: { padding: '32px 40px', maxWidth: 1040, margin: '0 auto', minHeight: '100vh', animation: 'fadeIn 0.3s ease' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, flexWrap: 'wrap', gap: 20 },
    title: { fontSize: 28, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 },
    subtitle: { fontSize: 14, color: 'var(--text-dim)' },
    tabs: { display: 'flex', background: 'var(--surface)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' },
    tabBtn: { padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s ease' },
    activeTab: { background: 'var(--surface-hover)', color: 'var(--text)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
    fadeContent: { animation: 'fadeUp 0.3s ease' },

    primaryBtn: { padding: '10px 20px', background: 'var(--accent-green)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    primaryBtnSmall: { padding: '8px 16px', background: 'var(--accent-green)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
    secondaryBtn: { padding: '10px 20px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    smallBtn: { padding: '6px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 500, color: 'var(--text)', cursor: 'pointer' },
    addBtn: { padding: '6px 12px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 },
    iconBtn: { background: 'none', border: 'none', color: 'var(--text-dim)', padding: 6, cursor: 'pointer', borderRadius: 6 },
    refreshBtn: { fontSize: 12, fontWeight: 500, color: 'var(--accent-green)', background: 'transparent', border: '1px solid var(--accent-green)40', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s ease' },

    snapshotGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 },
    snapCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 },

    insightCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 32, position: 'relative', overflow: 'hidden' },
    chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 40 },
    chartCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 },

    formGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
    label: { fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' },
    input: { padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none' },
    slider: { width: '100%', cursor: 'pointer', marginBottom: 8 },
    numBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18 },

    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 },
    modal: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 16 },
    swatchBtn: { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' },
    colorCircle: { width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', border: 'none' },

    radioBtn: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text)', fontSize: 14, fontWeight: 500, flex: 1 },
    radioBtnActive: { borderColor: 'var(--accent)', background: 'var(--accent)10' },
    radioCircle: { width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    radioCircleInner: { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }
}
