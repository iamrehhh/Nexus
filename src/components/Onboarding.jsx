import { useState } from 'react';
import { Bot, Check, ArrowRight } from 'lucide-react';
import { updateUserSettings } from '../lib/db';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export default function Onboarding({ onComplete }) {
    const { user, dbUser, setDbUser } = useAuth();
    const [step, setStep] = useState(1);

    // Data
    const [secretaryName, setSecretaryName] = useState('Nexus');
    const [tone, setTone] = useState('professional');
    const [theme, setTheme] = useState('dark');

    const handleComplete = async () => {
        try {
            const newSettings = {
                ...dbUser?.settings,
                onboardingCompleted: true,
                secretaryName,
                secretaryTone: tone,
                theme
            };

            await updateUserSettings(user.uid, newSettings);
            if (setDbUser) {
                setDbUser({ ...dbUser, settings: newSettings });
            }
            if (theme === 'light') {
                localStorage.setItem('nexus_theme', 'light');
                document.documentElement.setAttribute('data-theme', 'light');
            }
            toast.success('Welcome to Nexus!');
            onComplete();
        } catch (error) {
            console.error(error);
            toast.error('Failed to save settings');
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
            <div style={{
                width: '100%', maxWidth: 480, background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 24, padding: 40,
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
                    <div style={{ h: 4, flex: 1, background: step >= 1 ? 'var(--accent)' : 'var(--border)', borderRadius: 2, transition: 'background 0.3s' }} />
                    <div style={{ h: 4, flex: 1, background: step >= 2 ? 'var(--accent)' : 'var(--border)', borderRadius: 2, transition: 'background 0.3s' }} />
                </div>

                {step === 1 && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                            <Bot size={24} />
                        </div>
                        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Meet your Secretary</h2>
                        <p style={{ color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.5 }}>
                            Your AI secretary will manage your tasks, search your vault, and answer questions. How should they sound?
                        </p>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>Name</label>
                            <input
                                value={secretaryName}
                                onChange={e => setSecretaryName(e.target.value)}
                                style={{
                                    width: '100%', padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)',
                                    borderRadius: 8, color: 'var(--text)', fontSize: 15, outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: 32 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>Communication Style</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {['professional', 'casual', 'direct'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setTone(t)}
                                        style={{
                                            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                            border: tone === t ? '1px solid var(--accent)' : '1px solid var(--border)',
                                            background: tone === t ? 'rgba(99,102,241,0.1)' : 'var(--bg)',
                                            color: tone === t ? 'var(--accent)' : 'var(--text-dim)', textTransform: 'capitalize'
                                        }}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 12, background: 'var(--text)', color: 'var(--bg)',
                                border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                            }}
                        >
                            Next <ArrowRight size={18} />
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Final Touches</h2>
                        <p style={{ color: 'var(--text-dim)', marginBottom: 24, lineHeight: 1.5 }}>
                            Choose your preferred appearance. You can always change this later in settings.
                        </p>

                        <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
                            <div
                                onClick={() => setTheme('dark')}
                                style={{
                                    flex: 1, height: 120, borderRadius: 12, border: theme === 'dark' ? '2px solid var(--accent)' : '2px solid var(--border)',
                                    background: '#0a0a0f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                                }}
                            >
                                <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Dark</span>
                                {theme === 'dark' && <div style={{ position: 'absolute', top: 8, right: 8, color: 'var(--accent)' }}><Check size={16} /></div>}
                            </div>
                            <div
                                onClick={() => setTheme('light')}
                                style={{
                                    flex: 1, height: 120, borderRadius: 12, border: theme === 'light' ? '2px solid var(--accent)' : '2px solid var(--border)',
                                    background: '#f9f9fb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                                }}
                            >
                                <span style={{ color: '#000', fontSize: 13, fontWeight: 600 }}>Light</span>
                                {theme === 'light' && <div style={{ position: 'absolute', top: 8, right: 8, color: 'var(--accent)' }}><Check size={16} /></div>}
                            </div>
                        </div>

                        <button
                            onClick={handleComplete}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 12, background: 'var(--accent)', color: '#fff',
                                border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                            }}
                        >
                            Complete Setup <Check size={18} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
