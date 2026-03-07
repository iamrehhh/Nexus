import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandBar } from '../hooks/useCommandBar';
import { useAuth } from '../hooks/useAuth';
import { Search, FileText, CheckSquare, Bot, ArrowRight, X, Clock, Plus, Activity, BookOpen, Link2, Settings } from 'lucide-react';
import { loadVaultNotes, loadTasks, addTask } from '../lib/db';
import toast from 'react-hot-toast';

function fuzzyMatch(pattern, str) {
    let patternIdx = 0;
    let strIdx = 0;
    let score = 0;
    const p = pattern.toLowerCase();
    const s = str.toLowerCase();

    while (patternIdx < p.length && strIdx < s.length) {
        if (p[patternIdx] === s[strIdx]) {
            score += (1 / (strIdx + 1));
            patternIdx++;
        }
        strIdx++;
    }
    return patternIdx === p.length ? score : 0;
}

export default function CommandBar() {
    const { isOpen, close } = useCommandBar();
    const { user } = useAuth();
    const navigate = useNavigate();
    const inputRef = useRef(null);

    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mode, setMode] = useState('default'); // 'default', 'task'

    // Data
    const [notes, setNotes] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [recentNotes, setRecentNotes] = useState([]);

    // Task specific state
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDate, setNewTaskDate] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState('medium');

    // Load data when opened
    useEffect(() => {
        if (isOpen && user) {
            loadVaultNotes(user.uid, { folder: 'All Notes' }).then(setNotes).catch(console.error);
            loadTasks(user.uid, { pendingOnly: true }).then(setTasks).catch(console.error);

            const stored = localStorage.getItem('nexus_recent_notes');
            if (stored) {
                try { setRecentNotes(JSON.parse(stored)); } catch (e) { }
            }

            setQuery('');
            setMode('default');
            setSelectedIndex(0);
            setNewTaskTitle('');
            setNewTaskDate('');

            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, user]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [query, mode]);

    const handleClose = () => {
        setQuery('');
        setMode('default');
        close();
    };

    const navItems = [
        { id: 'nav-dashboard', label: 'Go to Dashboard', icon: Activity, type: 'Navigation', get action() { return () => navigate('/dashboard') } },
        { id: 'nav-secretary', label: 'Go to Secretary', icon: Bot, type: 'Navigation', get action() { return () => navigate('/secretary') } },
        { id: 'nav-reading', label: 'Go to Reading', icon: BookOpen, type: 'Navigation', get action() { return () => navigate('/reading') } },
        { id: 'nav-health', label: 'Go to Health', icon: Activity, type: 'Navigation', get action() { return () => navigate('/health') } },
        { id: 'nav-vault', label: 'Go to Vault', icon: FileText, type: 'Navigation', get action() { return () => navigate('/vault') } },
        { id: 'nav-connect', label: 'Go to Connect', icon: Link2, type: 'Navigation', get action() { return () => navigate('/connect') } },
        { id: 'nav-settings', label: 'Go to Settings', icon: Settings, type: 'Navigation', get action() { return () => navigate('/settings') } }
    ];

    const actionItems = [
        { id: 'act-new-note', label: 'New note', icon: Plus, type: 'Action', get action() { return () => navigate('/vault?action=new') } },
        { id: 'act-new-task', label: 'New task', icon: CheckSquare, type: 'Action', action: () => setMode('task') },
        { id: 'act-health', label: 'Health check-in', icon: Activity, type: 'Action', get action() { return () => navigate('/health?tab=checkin') } },
        { id: 'act-book', label: 'Add book', icon: BookOpen, type: 'Action', get action() { return () => navigate('/reading') } }
    ];

    let results = [];
    if (mode === 'default') {
        if (!query.trim()) {
            results = [...actionItems.slice(0, 3), ...navItems];
        } else {
            const sq = query.trim().toLowerCase();

            // Notes filtering
            const noteRes = notes.filter(n => fuzzyMatch(sq, n.title) > 0 || String(n.content_preview || '').toLowerCase().includes(sq))
                .map(n => ({ id: `note-${n.id}`, label: n.title, sub: n.folder, icon: FileText, type: 'Note', action: () => navigate(`/vault?note=${n.id}`) }));

            // Tasks filtering
            const taskRes = tasks.filter(t => fuzzyMatch(sq, t.title) > 0)
                .map(t => ({ id: `task-${t.id}`, label: t.title, sub: new Date(t.due_date).toLocaleDateString(), icon: CheckSquare, type: 'Task', action: () => navigate('/dashboard') }));

            // Actions
            const actRes = [...actionItems, ...navItems].filter(a => fuzzyMatch(sq, a.label) > 0).sort((a, b) => fuzzyMatch(sq, b.label) - fuzzyMatch(sq, a.label));

            results = [...noteRes, ...taskRes, ...actRes];

            // Always add secretary fallback if they typed something
            results.push({
                id: 'sec-ask',
                label: `Ask secretary: "${query}"`,
                icon: Bot,
                type: 'Secretary',
                color: 'var(--accent)',
                action: () => navigate('/secretary', { state: { prefill: query } })
            });
        }
    }

    const maxIndex = mode === 'default' ? Math.max(0, results.length - 1) : 0;

    useEffect(() => {
        const handleKeyDown = async (e) => {
            if (!isOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                if (mode === 'task') setMode('default');
                else handleClose();
                return;
            }

            if (mode === 'default') {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex(p => Math.min(p + 1, maxIndex));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(p => Math.max(p - 1, 0));
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const item = results[selectedIndex];
                    if (item && item.action) {
                        item.action();
                        if (item.id !== 'act-new-task') close();
                    }
                }
            } else if (mode === 'task') {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!newTaskTitle.trim()) return;
                    try {
                        await addTask(user.uid, {
                            title: newTaskTitle.trim(),
                            dueDate: newTaskDate ? new Date(newTaskDate).toISOString() : new Date().toISOString(),
                            priority: newTaskPriority
                        });
                        toast.success('Task created');
                        handleClose();
                    } catch (err) {
                        toast.error('Failed to create task');
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, mode, selectedIndex, results, maxIndex, close, newTaskTitle, newTaskDate, newTaskPriority, user]);

    if (!isOpen) return null;

    return (
        <div style={styles.overlay} onClick={handleClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <div style={styles.inputWrap}>
                    <Search size={20} style={{ color: 'var(--text-dim)', marginRight: 12 }} />
                    <input
                        ref={inputRef}
                        className="nexus-command-input"
                        style={styles.input}
                        placeholder="Search or type a command..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <button onClick={handleClose} style={styles.closeBtn}>
                        <X size={16} />
                    </button>
                </div>

                <div style={styles.results}>
                    {mode === 'task' ? (
                        <div style={{ padding: '20px' }}>
                            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckSquare size={16} /> Create new task
                            </div>
                            <input
                                autoFocus
                                style={{ ...styles.input, fontSize: 24, marginBottom: 16 }}
                                placeholder="Task title..."
                                value={newTaskTitle}
                                onChange={e => setNewTaskTitle(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <input
                                    type="date"
                                    style={{ ...styles.input, fontSize: 14, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, flex: 1 }}
                                    value={newTaskDate}
                                    onChange={e => setNewTaskDate(e.target.value)}
                                />
                                <select
                                    style={{ ...styles.input, fontSize: 14, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, flex: 1 }}
                                    value={newTaskPriority}
                                    onChange={e => setNewTaskPriority(e.target.value)}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                            <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Press Enter to save, Esc to cancel</span>
                                <button onClick={() => setMode('default')} style={{ padding: '10px 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                                <button onClick={() => {
                                    /* trigger save manually via event simulation or just call the logic */
                                    const e = new KeyboardEvent('keydown', { key: 'Enter' });
                                    window.dispatchEvent(e);
                                }} style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Save Task</button>
                            </div>
                        </div>
                    ) : results.length > 0 ? (
                        <div style={{ padding: 8 }}>
                            {results.map((item, index) => {
                                const isSelected = index === selectedIndex;
                                return (
                                    <div
                                        key={item.id}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                        onClick={() => {
                                            item.action();
                                            if (item.id !== 'act-new-task') close();
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '12px 16px',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            background: isSelected ? 'var(--surface-hover)' : 'transparent',
                                            transition: 'background 0.1s ease',
                                            gap: 16
                                        }}
                                    >
                                        <item.icon size={18} style={{ color: item.color || (isSelected ? 'var(--text)' : 'var(--text-dim)') }} />
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: 14, fontWeight: 500, color: item.color || 'var(--text)' }}>{item.label}</span>
                                            {item.sub && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{item.sub}</span>}
                                        </div>
                                        {item.type && (
                                            <span style={{ fontSize: 11, background: 'var(--bg)', padding: '2px 8px', borderRadius: 12, color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                                                {item.type}
                                            </span>
                                        )}
                                        {isSelected && item.type === 'Navigation' && (
                                            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>↵ Enter</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
                            No results found for "{query}"
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh'
    },
    modal: {
        width: '100%',
        maxWidth: 600,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        animation: 'slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
    },
    inputWrap: {
        display: 'flex',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)'
    },
    input: {
        flex: 1,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        fontSize: 18,
        color: 'var(--text)',
        fontFamily: 'inherit'
    },
    closeBtn: {
        background: 'transparent',
        border: 'none',
        color: 'var(--text-dim)',
        cursor: 'pointer',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    results: {
        maxHeight: '60vh',
        overflowY: 'auto',
        padding: 8
    }
};
