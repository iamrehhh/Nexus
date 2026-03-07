import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Link2, Github, Mail, Calendar as CalendarIcon, RefreshCw, LogOut, Code, Activity, Music, Inbox, Clock, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

const SpotifyIcon = ({ size, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.84.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z" />
    </svg>
)

export default function Connect() {
    const { user } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()

    const [services, setServices] = useState({
        github: { loading: true, data: null },
        spotify: { loading: true, data: null },
        gmail: { loading: true, data: null },
        calendar: { loading: true, data: null }
    })

    useEffect(() => {
        if (!user) return

        const connectedParam = searchParams.get('connected')
        if (connectedParam) {
            toast.success(`${connectedParam.charAt(0).toUpperCase() + connectedParam.slice(1)} connected successfully!`)
            window.history.replaceState({}, document.title, '/connect')
        }

        fetchAllServices()
    }, [user])

    const fetchAllServices = async () => {
        await Promise.allSettled([
            fetchService('github'),
            fetchService('spotify'),
            fetchService('gmail'),
            fetchService('calendar')
        ])
    }

    const fetchService = async (serviceName, forceRefresh = false) => {
        setServices(prev => ({ ...prev, [serviceName]: { ...prev[serviceName], loading: true } }))
        try {
            const res = await fetch(`/api/services/${serviceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, forceRefresh })
            })
            const data = await res.json()
            setServices(prev => ({ ...prev, [serviceName]: { loading: false, data } }))
        } catch (err) {
            console.error(`Error fetching ${serviceName}:`, err)
            setServices(prev => ({ ...prev, [serviceName]: { loading: false, data: { connected: true, error: true } } }))
        }
    }

    const handleDisconnect = async (serviceName) => {
        try {
            const endpoint = serviceName === 'gmail' || serviceName === 'calendar' ? 'google' : serviceName
            await fetch(`/api/auth/${endpoint}/disconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid })
            })

            if (endpoint === 'google') {
                setServices(prev => ({
                    ...prev,
                    gmail: { loading: false, data: { connected: false } },
                    calendar: { loading: false, data: { connected: false } }
                }))
            } else {
                setServices(prev => ({ ...prev, [serviceName]: { loading: false, data: { connected: false } } }))
            }
            toast.success(`${endpoint} disconnected`)
        } catch (err) {
            toast.error('Failed to disconnect')
        }
    }

    const connectUrl = (service) => `/api/auth/${service}/connect?userId=${user.uid}`

    const renderCardHeader = (icon, title, color, serviceKey) => {
        const { loading, data } = services[serviceKey]
        const isConnected = data?.connected

        return (
            <div style={s.cardHeader}>
                <div style={s.cardTitleWrap}>
                    <div style={{ ...s.iconWrap, background: `${color}15`, color }}>{icon}</div>
                    <h2 style={s.cardTitle}>{title}</h2>
                </div>
                {isConnected && !loading && (
                    <div style={s.connectedBadge}><CheckCircle2 size={12} /> Connected</div>
                )}
            </div>
        )
    }

    const renderActionRow = (serviceKey) => {
        const { loading, data } = services[serviceKey]
        if (!data?.connected) return null

        return (
            <div style={s.actionRow}>
                <button onClick={() => fetchService(serviceKey, true)} disabled={loading} style={s.iconBtn}>
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
                <button onClick={() => handleDisconnect(serviceKey)} style={s.disconnectBtn}>
                    <LogOut size={12} /> Disconnect
                </button>
            </div>
        )
    }

    return (
        <div style={s.page}>
            <div style={s.header}>
                <div style={{ padding: 10, background: 'var(--accent)20', borderRadius: 12, color: 'var(--accent)' }}>
                    <Link2 size={24} />
                </div>
                <div>
                    <h1 style={s.title}>Connect Hub</h1>
                    <p style={s.subtitle}>Connect your services to give your secretary full context about your life.</p>
                </div>
            </div>

            <div style={s.grid}>
                {/* GITHUB CARD */}
                <div style={s.card}>
                    {renderCardHeader(<Github size={20} />, 'GitHub', 'var(--text)', 'github')}

                    {services.github.loading && !services.github.data ? (
                        <div style={s.loadingState}>Loading...</div>
                    ) : !services.github.data?.connected ? (
                        <div style={s.notConnected}>
                            <p style={s.desc}>See your repos, recent commits, and contribution activity directly from Nexus.</p>
                            <a href={connectUrl('github')} style={s.connectBtn}>Connect GitHub</a>
                        </div>
                    ) : services.github.data?.error ? (
                        <div style={s.errorState}>Could not load GitHub data. <button onClick={() => fetchService('github', true)}>Retry</button></div>
                    ) : (
                        <div style={s.dataContent}>
                            <div style={s.profileRow}>
                                <img src={services.github.data.profile?.avatar_url} alt="github" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                <div>
                                    <h4 style={{ fontSize: 14, fontWeight: 600 }}>{services.github.data.profile?.login}</h4>
                                    <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>{services.github.data.profile?.publicRepos} repos</p>
                                </div>
                                <div style={{ marginLeft: 'auto', background: 'var(--accent-green)20', color: 'var(--accent-green)', padding: '4px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                                    {services.github.data.commitStreak} Day Streak 🔥
                                </div>
                            </div>

                            {services.github.data.recentCommits?.length > 0 && (
                                <div style={{ marginTop: 20 }}>
                                    <h5 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 12 }}>Recent Commits</h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {services.github.data.recentCommits.slice(0, 3).map((commit, i) => (
                                            <div key={i} style={{ fontSize: 13, lineHeight: 1.4 }}>
                                                <span style={{ fontWeight: 600 }}>{commit.repo}:</span>{' '}
                                                <span style={{ color: 'var(--text-dim)' }}>{commit.message.length > 50 ? commit.message.substring(0, 50) + '...' : commit.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <a href={`https://github.com/${services.github.data.profile?.login || ''}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12, color: 'var(--accent)', marginTop: 16 }}>Open GitHub →</a>
                        </div>
                    )}
                    {renderActionRow('github')}
                </div>

                {/* SPOTIFY CARD */}
                <div style={s.card}>
                    {renderCardHeader(<SpotifyIcon size={20} />, 'Spotify', '#1DB954', 'spotify')}

                    {services.spotify.loading && !services.spotify.data ? (
                        <div style={s.loadingState}>Loading...</div>
                    ) : !services.spotify.data?.connected ? (
                        <div style={s.notConnected}>
                            <p style={s.desc}>See what you're listening to, your top tracks and artists.</p>
                            <a href={connectUrl('spotify')} style={{ ...s.connectBtn, background: '#1DB954', color: '#000' }}>Connect Spotify</a>
                        </div>
                    ) : services.spotify.data?.error ? (
                        <div style={s.errorState}>Could not load Spotify data. <button onClick={() => fetchService('spotify', true)}>Retry</button></div>
                    ) : (
                        <div style={s.dataContent}>
                            {services.spotify.data.currentlyPlaying ? (
                                <div style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--surface-hover)', padding: 12, borderRadius: 12 }}>
                                    <img src={services.spotify.data.currentlyPlaying.albumArt} style={{ width: 48, height: 48, borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }} />
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: 11, color: '#1DB954', fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {services.spotify.data.currentlyPlaying.isPlaying && <div className="playing-indicator" />} Currently Playing
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{services.spotify.data.currentlyPlaying.trackName}</div>
                                        <div style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{services.spotify.data.currentlyPlaying.artist}</div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ background: 'var(--surface-hover)', padding: 12, borderRadius: 12 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Nothing playing right now.</div>
                                    {services.spotify.data.recentlyPlayed?.length > 0 && (
                                        <div style={{ fontSize: 13, marginTop: 4 }}>Last played: {services.spotify.data.recentlyPlayed[0].name}</div>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
                                <div>
                                    <h5 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 8 }}>Top Artists</h5>
                                    {services.spotify.data.topArtists?.slice(0, 3).map((a, i) => (
                                        <div key={i} style={{ fontSize: 13, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a}</div>
                                    ))}
                                </div>
                                <div>
                                    <h5 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 8 }}>Top Tracks</h5>
                                    {services.spotify.data.topTracks?.slice(0, 3).map((t, i) => (
                                        <div key={i} style={{ fontSize: 13, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                    ))}
                                </div>
                            </div>
                            <a href="https://open.spotify.com" target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12, color: 'var(--accent)', marginTop: 16 }}>Open Spotify →</a>
                        </div>
                    )}
                    {renderActionRow('spotify')}
                </div>

                {/* GMAIL CARD */}
                <div style={s.card}>
                    {renderCardHeader(<Mail size={20} />, 'Gmail', '#EA4335', 'gmail')}

                    {services.gmail.loading && !services.gmail.data ? (
                        <div style={s.loadingState}>Loading...</div>
                    ) : !services.gmail.data?.connected ? (
                        <div style={s.notConnected}>
                            <p style={s.desc}>See your unread emails and important messages natively.</p>
                            <a href={connectUrl('google')} style={{ ...s.connectBtn, background: '#EA4335' }}>Connect Gmail</a>
                            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>Also connects Google Calendar</p>
                        </div>
                    ) : services.gmail.data?.error ? (
                        <div style={s.errorState}>Could not load Gmail data. <button onClick={() => fetchService('gmail', true)}>Retry</button></div>
                    ) : (
                        <div style={s.dataContent}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>
                                    {services.gmail.data.unreadCount}
                                </div>
                                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>unread emails</div>
                            </div>

                            {services.gmail.data.emails?.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {services.gmail.data.emails.slice(0, 3).map(email => (
                                        <div key={email.id} style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 13, fontWeight: 600 }}>{email.from}</span>
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.subject}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, display: 'none' }} className="hide-on-mobile">{email.snippet.substring(0, 60)}...</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <a href="https://gmail.com" target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12, color: 'var(--accent)', marginTop: 16 }}>Open Gmail →</a>
                        </div>
                    )}
                    {renderActionRow('gmail')}
                </div>

                {/* CALENDAR CARD */}
                <div style={s.card}>
                    {renderCardHeader(<CalendarIcon size={20} />, 'Google Calendar', '#4285F4', 'calendar')}

                    {services.calendar.loading && !services.calendar.data ? (
                        <div style={s.loadingState}>Loading...</div>
                    ) : !services.calendar.data?.connected ? (
                        <div style={s.notConnected}>
                            <p style={s.desc}>See your upcoming events and today's schedule.</p>
                            <a href={connectUrl('google')} style={{ ...s.connectBtn, background: '#4285F4' }}>Connect Google</a>
                            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 12 }}>Also connects Gmail</p>
                        </div>
                    ) : services.calendar.data?.error ? (
                        <div style={s.errorState}>Could not load Calendar data. <button onClick={() => fetchService('calendar', true)}>Retry</button></div>
                    ) : (
                        <div style={s.dataContent}>
                            <div style={{ marginBottom: 20 }}>
                                <h5 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 8 }}>Today's Schedule</h5>
                                {services.calendar.data.todayEvents?.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {services.calendar.data.todayEvents.map((evt, i) => (
                                            <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                                                <span style={{ color: 'var(--accent)', fontWeight: 500, width: 50 }}>
                                                    {new Date(evt.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.title}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No events today.</div>
                                )}
                            </div>

                            {services.calendar.data.nextEvent && services.calendar.data.todayEvents?.length === 0 && (
                                <div>
                                    <h5 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 8 }}>Next Upcoming</h5>
                                    <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{services.calendar.data.nextEvent.title}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                            {new Date(services.calendar.data.nextEvent.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <a href="https://calendar.google.com" target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 12, color: 'var(--accent)', marginTop: 16 }}>Open Calendar →</a>
                        </div>
                    )}
                    {renderActionRow('calendar')}
                </div>
            </div>

            <style>{`
            .spin { animation: spin 1s linear infinite; }
            .playing-indicator { width: 8px; height: 8px; background: #1DB954; border-radius: 50%; opacity: 0; animation: pulsePlaying 1.5s infinite; }
            @keyframes pulsePlaying { 0% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.3; transform: scale(0.8); } }
            @media (max-width: 600px) {
                .hide-on-mobile { display: none !important; }
            }
            `}</style>
        </div>
    )
}

const s = {
    page: { padding: '32px 40px', maxWidth: 1040, margin: '0 auto', minHeight: '100vh', animation: 'fadeIn 0.3s ease' },
    header: { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 },
    title: { fontSize: 28, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 },
    subtitle: { fontSize: 14, color: 'var(--text-dim)' },

    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 24 },
    card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    cardTitleWrap: { display: 'flex', alignItems: 'center', gap: 12 },
    iconWrap: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 16, fontWeight: 600 },
    connectedBadge: { display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent-green)20', color: 'var(--accent-green)', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },

    notConnected: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px 0' },
    desc: { fontSize: 14, color: 'var(--text-dim)', marginBottom: 20, maxWidth: 240, lineHeight: 1.5 },
    connectBtn: { display: 'inline-flex', background: 'var(--text)', color: 'var(--bg)', padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' },

    dataContent: { flex: 1 },
    profileRow: { display: 'flex', alignItems: 'center', gap: 12 },

    actionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' },
    iconBtn: { background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', cursor: 'pointer' },
    disconnectBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--accent-red)', fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: 0.8 },
    loadingState: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 },
    errorState: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-red)', fontSize: 13 }
}
