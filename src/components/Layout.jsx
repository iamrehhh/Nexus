import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import {
    LayoutDashboard, Bot, BookOpen, Activity, Link2, Lock,
    Settings, Sun, Moon, LogOut, Layers, Bell, X, Plus, FileText, CheckSquare, Menu
} from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useCommandBar } from '../hooks/useCommandBar'

const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/secretary', icon: Bot, label: 'Secretary' },
    { to: '/reading', icon: BookOpen, label: 'Reading' },
    { to: '/health', icon: Activity, label: 'Health' },
    { to: '/connect', icon: Link2, label: 'Connect' },
    { to: '/vault', icon: Lock, label: 'Vault' },
]

const mobileNavItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    { to: '/secretary', icon: Bot, label: 'Secretary' },
    { to: '/reading', icon: BookOpen, label: 'Reading' },
    { to: '/health', icon: Activity, label: 'Health' },
    { isMenu: true, icon: Menu, label: 'Menu' },
]

// Inject responsive CSS once
if (typeof document !== 'undefined') {
    const id = 'nexus-layout-responsive'
    if (!document.getElementById(id)) {
        const el = document.createElement('style')
        el.id = id
        el.textContent = `
      @media (max-width: 768px) {
        .nexus-sidebar { display: none !important; }
        .nexus-main { margin-left: 0 !important; padding-bottom: 72px !important; }
        .nexus-mobile-nav { display: flex !important; }
      }
    `
        document.head.appendChild(el)
    }
}

export default function Layout({ children }) {
    const { user, logOut } = useAuth()
    const { theme, toggle } = useTheme()
    const location = useLocation()
    const navigate = useNavigate()
    const { open: openCommandBar } = useCommandBar()

    // Notifications State
    const [notifications, setNotifications] = useState([])
    const [showNotifications, setShowNotifications] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)

    // FAB State
    const [fabOpen, setFabOpen] = useState(false)
    const fabRef = useRef(null)

    // Mobile Menu State
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    // Click outside handler for FAB and Notifications
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (fabRef.current && !fabRef.current.contains(e.target)) {
                setFabOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        if (!user) return;

        const generateNotifications = async () => {
            const todayStr = new Date().toDateString();
            const lastChecked = localStorage.getItem('nexus_notif_checked');

            // Try to load existing local notifications
            let localNotifs = [];
            try {
                localNotifs = JSON.parse(localStorage.getItem('nexus_notifications')) || [];
            } catch (e) { }

            setNotifications(localNotifs);
            setUnreadCount(localNotifs.filter(n => !n.read).length);

            // Only run data checks once per day per device
            if (lastChecked === todayStr) return;

            const newNotifs = [];
            const addNotif = (title, message, url, iconType) => {
                // Check if similar notif exists in last 24h
                const duplicate = localNotifs.find(n => n.title === title && (Date.now() - n.timestamp < 24 * 60 * 60 * 1000));
                if (!duplicate) {
                    newNotifs.push({ id: crypto.randomUUID(), title, message, url, iconType, timestamp: Date.now(), read: false });
                }
            };

            try {
                // 1. Welcome Back (Check last active)
                const lastActiveStr = localStorage.getItem('nexus_last_active');
                if (lastActiveStr) {
                    const daysAway = Math.floor((Date.now() - parseInt(lastActiveStr)) / (1000 * 60 * 60 * 24));
                    if (daysAway >= 3) {
                        addNotif('Welcome back!', `You were away for ${daysAway} days.`, null, 'info');
                    }
                }
                localStorage.setItem('nexus_last_active', Date.now().toString());

                // 2. Tasks Overdue
                const { count: overdueCount } = await supabase
                    .from('tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.uid)
                    .eq('completed', false)
                    .lt('due_date', new Date().toISOString());

                if (overdueCount > 0) {
                    addNotif('Tasks Overdue', `You have ${overdueCount} overdue tasks.`, '/dashboard', 'warning');
                }

                // 3. Health Overdue
                const { data: latestHealth } = await supabase
                    .from('health_checkins')
                    .select('checkin_date')
                    .eq('user_id', user.uid)
                    .order('checkin_date', { ascending: false })
                    .limit(1);

                if (latestHealth && latestHealth[0]) {
                    const daysSinceHealth = Math.floor((Date.now() - new Date(latestHealth[0].checkin_date).getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSinceHealth >= 7) {
                        addNotif('Health Check-in Overdue', `Your last check-in was ${daysSinceHealth} days ago.`, '/health?tab=checkin', 'warning');
                    }
                }

                // 4. Reading Goal Behind
                const { data: readingBooks } = await supabase
                    .from('books')
                    .select('id, title, total_pages, current_page, reading_goal_date')
                    .eq('user_id', user.uid)
                    .eq('status', 'reading')
                    .not('reading_goal_date', 'is', null);

                if (readingBooks) {
                    readingBooks.forEach(b => {
                        const now = new Date();
                        const goalEnd = new Date(b.reading_goal_date);
                        if (goalEnd > now && b.total_pages > 0) {
                            const daysLeft = Math.ceil((goalEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                            const pagesLeft = b.total_pages - b.current_page;
                            const requiredPace = pagesLeft / daysLeft;

                            // Let's assume ideal pace was total_pages / total_duration. We don't have start date, 
                            // but if required pace is over some threshold (e.g., > 50 pages/day) maybe warn, 
                            // or just a simple check: if we need to read an unrealistic amount? 
                            // Simplified: Just warn if they are falling behind a nominal 20 pages/day pace needed
                            if (requiredPace > 25) {
                                addNotif('Reading Goal Alert', `You need to read ${Math.ceil(requiredPace)} pages/day to finish '${b.title}' by your goal.`, `/reading/${b.id}`, 'info');
                            }
                        }
                    });
                }

                if (newNotifs.length > 0) {
                    const combined = [...newNotifs, ...localNotifs].slice(0, 20);
                    setNotifications(combined);
                    setUnreadCount(combined.filter(n => !n.read).length);
                    localStorage.setItem('nexus_notifications', JSON.stringify(combined));
                }

                localStorage.setItem('nexus_notif_checked', todayStr);

            } catch (err) { console.error('Error generating notifications:', err) }
        };

        generateNotifications();

        // 5. Supabase Realtime Subscription for Reminders
        const channel = supabase.channel('reminders-notifs')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'reminders',
                filter: `user_id=eq.${user.uid}`
            }, (payload) => {
                const newReminder = payload.new;
                // Schedule local notification if supported
                if ('Notification' in window && Notification.permission === 'granted') {
                    const notifyTime = new Date(newReminder.due_date).getTime();
                    const now = Date.now();
                    const timeUntil = notifyTime - now;

                    if (timeUntil > 0 && timeUntil <= 24 * 60 * 60 * 1000) {
                        // Schedule a setTimeout for the notification if it's within 24 hours
                        setTimeout(() => {
                            new Notification("Secretary Reminder", {
                                body: newReminder.title + (newReminder.description ? `\n${newReminder.description}` : ''),
                                icon: '/favicon.ico'
                            });
                        }, timeUntil);
                    }
                }

                // Add to internal layout notifications with standard format
                setNotifications(prev => {
                    const newNotif = {
                        id: crypto.randomUUID(),
                        title: 'New Reminder Set',
                        message: `${newReminder.title} (Due: ${new Date(newReminder.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
                        url: '/secretary',
                        iconType: 'info',
                        timestamp: Date.now(),
                        read: false
                    };
                    const updated = [newNotif, ...prev].slice(0, 20);
                    setUnreadCount(updated.filter(n => !n.read).length);
                    localStorage.setItem('nexus_notifications', JSON.stringify(updated));
                    return updated;
                });
            })
            .subscribe();

        // Request Browser Notification Permission on mount
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    const markAllRead = () => {
        const updated = notifications.map(n => ({ ...n, read: true }))
        setNotifications(updated)
        setUnreadCount(0)
        localStorage.setItem('nexus_notifications', JSON.stringify(updated))
    }

    const dismissNotif = (id, e) => {
        if (e) e.stopPropagation();
        const updated = notifications.filter(n => n.id !== id);
        setNotifications(updated);
        setUnreadCount(updated.filter(n => !n.read).length);
        localStorage.setItem('nexus_notifications', JSON.stringify(updated));
    }

    const firstName = user?.displayName?.split(' ')[0] || 'User'

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            {/* Desktop Sidebar */}
            <aside className="nexus-sidebar" style={{
                width: 240, flexShrink: 0, background: 'var(--bg2)',
                borderRight: '1px solid var(--border)', position: 'fixed',
                top: 0, left: 0, bottom: 0, zIndex: 100,
                display: 'flex', flexDirection: 'column', padding: '20px 12px',
            }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px', marginBottom: 28 }}>
                    <Layers size={20} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>Nexus</span>
                </div>

                {/* Navigation */}
                <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {navItems.map(item => {
                        const isActive = location.pathname === item.to
                        return (
                            <NavLink key={item.to} to={item.to} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: isActive ? '10px 10px 10px 10px' : '10px 12px',
                                borderRadius: 8, fontSize: 14, fontWeight: 500,
                                textDecoration: 'none', transition: 'all 0.15s ease',
                                background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                            }}>
                                <item.icon size={18} style={{ color: isActive ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }} />
                                <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-dim)' }}>{item.label}</span>
                            </NavLink>
                        )
                    })}
                </nav>

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Bottom */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <NavLink to="/settings" style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                        textDecoration: 'none', transition: 'all 0.15s ease',
                        background: location.pathname === '/settings' ? 'rgba(99,102,241,0.1)' : 'transparent',
                        borderLeft: location.pathname === '/settings' ? '2px solid var(--accent)' : '2px solid transparent',
                    }}>
                        <Settings size={18} style={{ color: location.pathname === '/settings' ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }} />
                        <span style={{ color: location.pathname === '/settings' ? 'var(--accent)' : 'var(--text-dim)' }}>Settings</span>
                    </NavLink>

                    <button onClick={toggle} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                        cursor: 'pointer', border: 'none', background: 'transparent', width: '100%',
                    }}>
                        {theme === 'dark'
                            ? <Sun size={18} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                            : <Moon size={18} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                        }
                        <span style={{ color: 'var(--text-dim)' }}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>

                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowNotifications(p => !p)} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            padding: '10px 12px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                            cursor: 'pointer', border: 'none', background: showNotifications ? 'var(--surface-hover)' : 'transparent', width: '100%',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Bell size={18} style={{ color: showNotifications ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }} />
                                <span style={{ color: showNotifications ? 'var(--text)' : 'var(--text-dim)' }}>Notifications</span>
                            </div>
                            {unreadCount > 0 && (
                                <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>
                                    {unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notification Panel */}
                        {showNotifications && (
                            <div style={{
                                position: 'absolute', bottom: '100%', left: 0, width: 320,
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                                marginBottom: 10, overflow: 'hidden', zIndex: 1000,
                                transformOrigin: 'bottom left', animation: 'scaleIn 0.2s ease'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Notifications</span>
                                    {unreadCount > 0 && (
                                        <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Mark all read</button>
                                    )}
                                </div>
                                <div style={{ maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}>
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                                            You're all caught up.
                                        </div>
                                    ) : notifications.map(n => (
                                        <div key={n.id} style={{
                                            padding: '12px 16px', display: 'flex', gap: 12, borderBottom: '1px solid var(--border)',
                                            background: n.read ? 'transparent' : 'rgba(99,102,241,0.05)',
                                            position: 'relative'
                                        }}>
                                            <div style={{ marginTop: 2 }}>
                                                {n.iconType === 'warning' ? <Activity size={16} style={{ color: 'var(--accent-amber)' }} /> : <Bell size={16} style={{ color: 'var(--accent-blue)' }} />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <span style={{ fontSize: 13, fontWeight: n.read ? 500 : 600, color: 'var(--text)' }}>{n.title}</span>
                                                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{Math.floor((Date.now() - n.timestamp) / (1000 * 60 * 60))}h ago</span>
                                                </div>
                                                <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 6px 0', lineHeight: 1.4 }}>{n.message}</p>
                                                {n.url && (
                                                    <a href={n.url} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Take action →</a>
                                                )}
                                            </div>
                                            <button onClick={(e) => dismissNotif(n.id, e)} style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', padding: 4, position: 'absolute', top: 8, right: 8 }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} referrerPolicy="no-referrer" />
                            ) : (
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                                    {firstName[0]}
                                </div>
                            )}
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{firstName}</span>
                        </div>
                        <button onClick={logOut} title="Sign out" style={{
                            padding: 6, borderRadius: 6, color: 'var(--text-dim)',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center',
                        }}>
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="nexus-main" style={{ flex: 1, marginLeft: 240, overflowY: 'auto', height: '100vh', background: 'var(--bg)' }}>
                {children}
            </main>

            {/* Mobile Bottom Nav */}
            <nav className="nexus-mobile-nav" style={{
                display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0,
                background: 'var(--bg2)', borderTop: '1px solid var(--border)',
                padding: '8px 0 env(safe-area-inset-bottom, 8px)',
                justifyContent: 'space-around', alignItems: 'center', zIndex: 950,
            }}>
                {mobileNavItems.map(item => {
                    if (item.isMenu) {
                        return (
                            <button key="menu" onClick={() => setMobileMenuOpen(true)} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                gap: 4, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer'
                            }}>
                                <item.icon size={20} style={{ color: 'var(--text-dim)' }} />
                            </button>
                        )
                    }

                    const isActive = location.pathname === item.to
                    return (
                        <NavLink key={item.to} to={item.to} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: 4, padding: '8px 12px', textDecoration: 'none',
                        }}>
                            <item.icon size={20} style={{ color: isActive ? 'var(--accent)' : 'var(--text-dim)' }} />
                            {isActive && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />}
                        </NavLink>
                    )
                })}
            </nav>

            {/* Mobile Bottom Sheet Menu */}
            {mobileMenuOpen && (
                <>
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998, animation: 'fadeIn 0.2s ease' }} onClick={() => setMobileMenuOpen(false)} />
                    <div style={{
                        position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)',
                        borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 20px',
                        zIndex: 999, animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        display: 'flex', flexDirection: 'column', gap: 16
                    }}>
                        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2, alignSelf: 'center', marginBottom: 8 }} />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {navItems.map(item => (
                                <NavLink key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '16px',
                                    background: 'var(--surface)', borderRadius: 12, textDecoration: 'none',
                                    border: '1px solid var(--border)'
                                }}>
                                    <item.icon size={20} style={{ color: 'var(--accent)' }} />
                                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{item.label}</span>
                                </NavLink>
                            ))}
                        </div>

                        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

                        <NavLink to="/settings" onClick={() => setMobileMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background: 'var(--surface)', borderRadius: 12, textDecoration: 'none', border: '1px solid var(--border)' }}>
                            <Settings size={20} style={{ color: 'var(--text-dim)' }} />
                            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Settings</span>
                        </NavLink>

                        <button onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                            {theme === 'dark' ? <Sun size={20} style={{ color: 'var(--text-dim)' }} /> : <Moon size={20} style={{ color: 'var(--text-dim)' }} />}
                            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                        </button>
                    </div>
                </>
            )}

            {/* Floating Action Button */}
            <div ref={fabRef} style={{
                position: 'fixed', right: 24, bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', zIndex: 900
            }}>
                {/* Radial Menu Options */}
                <div style={{
                    position: 'absolute', bottom: '100%', right: 0, marginBottom: 16,
                    display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end',
                    pointerEvents: fabOpen ? 'auto' : 'none',
                }}>
                    <button
                        onClick={() => { setFabOpen(false); navigate('/vault?action=new') }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)',
                            color: 'var(--text)', padding: '10px 16px', borderRadius: 24, cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', whiteSpace: 'nowrap',
                            opacity: fabOpen ? 1 : 0, transform: fabOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
                            transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.1s'
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 500 }}>New Note</span>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={14} style={{ color: 'var(--accent)' }} />
                        </div>
                    </button>
                    <button
                        onClick={() => {
                            setFabOpen(false);
                            openCommandBar();
                            // Very slight timeout to let command bar open, then simulate 'new task' typing
                            setTimeout(() => {
                                const input = document.querySelector('.nexus-command-input');
                                if (input) {
                                    input.value = 'new task';
                                    input.dispatchEvent(new Event('input', { bubbles: true }));
                                    setTimeout(() => {
                                        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                                    }, 50);
                                }
                            }, 100);
                        }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)',
                            color: 'var(--text)', padding: '10px 16px', borderRadius: 24, cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', whiteSpace: 'nowrap',
                            opacity: fabOpen ? 1 : 0, transform: fabOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
                            transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.05s'
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 500 }}>New Task</span>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckSquare size={14} style={{ color: 'var(--accent-green)' }} />
                        </div>
                    </button>
                    <button
                        onClick={() => { setFabOpen(false); navigate('/secretary') }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)',
                            color: 'var(--text)', padding: '10px 16px', borderRadius: 24, cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', whiteSpace: 'nowrap',
                            opacity: fabOpen ? 1 : 0, transform: fabOpen ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.8)',
                            transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0s'
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 500 }}>Ask Secretary</span>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Bot size={14} style={{ color: 'var(--accent-blue)' }} />
                        </div>
                    </button>
                </div>

                {/* Main FAB */}
                <button
                    onClick={() => setFabOpen(!fabOpen)}
                    style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: 'var(--accent)', color: '#fff',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                        transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = fabOpen ? 'rotate(45deg) scale(1.05)' : 'rotate(0deg) scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = fabOpen ? 'rotate(45deg) scale(1)' : 'rotate(0deg) scale(1)'}
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* Overlay for mobile tap out */}
            {fabOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 899 }} onClick={() => setFabOpen(false)} />
            )}
        </div>
    )
}
