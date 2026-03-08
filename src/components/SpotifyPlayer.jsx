// src/components/SpotifyPlayer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music, Maximize2, Minimize2, Volume2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function SpotifyPlayer() {
    const { user } = useAuth();
    const [playback, setPlayback] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const errorCountRef = useRef(0);
    const intervalRef = useRef(null);

    const fetchPlayback = async () => {
        if (errorCountRef.current >= 3) return;

        try {
            const res = await fetch(`/api/spotify?userId=${user.uid}`);
            if (res.ok) {
                const data = await res.json();
                setPlayback(data.playback);
                errorCountRef.current = 0; // Reset on success

                if (!intervalRef.current) {
                    intervalRef.current = setInterval(fetchPlayback, 5000);
                }
            } else if (res.status === 401) {
                setPlayback(null);
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                errorCountRef.current = 3; // Force stop on unauthorized
            } else {
                setPlayback(null);
                errorCountRef.current += 1;
                if (errorCountRef.current >= 3 && intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            }
        } catch (e) {
            console.error('Failed to fetch playback state', e);
            errorCountRef.current += 1;
            if (errorCountRef.current >= 3 && intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        errorCountRef.current = 0;
        fetchPlayback();

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [user]);

    const handleControl = async (action) => {
        // Optimistic UI updates
        if (playback) {
            if (action === 'play') setPlayback(p => ({ ...p, is_playing: true }));
            if (action === 'pause') setPlayback(p => ({ ...p, is_playing: false }));
        }

        try {
            const res = await fetch('/api/spotify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.uid, action })
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to control playback');
            }
            // Fetch true state after a short delay
            setTimeout(fetchPlayback, 1000);
        } catch (err) {
            toast.error(err.message);
            fetchPlayback(); // Revert optimistic update
        }
    };

    if (loading && !playback) return null;

    if (!playback && expanded) {
        return (
            <div style={s.expandedOverlay}>
                <div style={s.expandedCard}>
                    <button onClick={() => setExpanded(false)} style={s.closeBtn}><Minimize2 size={16} /></button>
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
                        <Music size={48} style={{ opacity: 0.5, margin: '0 auto 16px' }} />
                        <p>No active Spotify playback detected.</p>
                        <p style={{ fontSize: 12, marginTop: 8 }}>Open Spotify on any device and start playing to control it here.</p>
                    </div>
                </div>
            </div>
        );
    }

    // Removed: if (!playback) return null; (Player should persist in idle state)

    const trackName = playback?.item?.name || 'Spotify Idle';
    const artistName = playback?.item?.artists?.map(a => a.name).join(', ') || 'Open Spotify on a device to play';
    const albumArt = playback?.item?.album?.images?.[0]?.url;
    const isPlaying = playback?.is_playing || false;
    const progress = playback?.progress_ms || 0;
    const duration = playback?.item?.duration_ms || 1;
    const progressPct = playback ? (progress / duration) * 100 : 0;

    if (expanded) {
        return (
            <div style={s.expandedOverlay}>
                <div style={s.expandedCard}>
                    <button onClick={() => setExpanded(false)} style={s.closeBtn}><Minimize2 size={16} /></button>

                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', marginBottom: 24, background: 'var(--bg2)', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                        {albumArt ? (
                            <img src={albumArt} alt="Album Art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Music size={48} style={{ color: 'var(--text-faint)' }} />
                            </div>
                        )}
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                        <h3 style={{ fontSize: !trackName || trackName.length > 25 ? 18 : 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{trackName}</h3>
                        <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>{artistName}</p>
                    </div>

                    <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 24, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progressPct}%`, background: '#1DB954', transition: 'width 1s linear' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
                        <button onClick={() => handleControl('previous')} style={s.ctrlBtn}><SkipBack size={24} /></button>
                        <button onClick={() => handleControl(isPlaying ? 'pause' : 'play')} style={{ ...s.ctrlBtn, background: '#1DB954', color: '#000', width: 64, height: 64 }}>
                            {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: 4 }} />}
                        </button>
                        <button onClick={() => handleControl('next')} style={s.ctrlBtn}><SkipForward size={24} /></button>
                    </div>
                </div>
            </div>
        );
    }

    // Mini Player
    return (
        <motion.div
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
            style={{ ...s.miniPlayer, cursor: 'grab' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, overflow: 'hidden' }} onClick={() => setExpanded(true)}>
                <div style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', background: 'var(--bg2)', flexShrink: 0 }}>
                    {albumArt ? (
                        <img src={albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={16} style={{ color: 'var(--text-faint)' }} /></div>
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0, pointerEvents: 'none' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trackName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artistName}</div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onPointerDown={(e) => e.stopPropagation()}>
                <button onClick={() => handleControl('previous')} style={s.miniCtrlBtn}><SkipBack size={16} /></button>
                <button onClick={() => handleControl(isPlaying ? 'pause' : 'play')} style={s.miniPlayBtn}>
                    {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
                </button>
                <button onClick={() => handleControl('next')} style={s.miniCtrlBtn}><SkipForward size={16} /></button>
            </div>

            <div style={{ position: 'absolute', bottom: 0, left: 0, height: 2, background: '#1DB954', width: `${progressPct}%`, transition: 'width 1s linear' }} />
        </motion.div>
    );
}

const s = {
    miniPlayer: {
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '8px 16px 8px 8px', display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)', width: 'calc(100% - 48px)', maxWidth: 400,
        zIndex: 800, overflow: 'hidden', BackdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)'
    },
    miniCtrlBtn: {
        background: 'none', border: 'none', color: 'var(--text)', width: 32, height: 32,
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'background 0.2s'
    },
    miniPlayBtn: {
        background: 'var(--text)', color: 'var(--bg)', border: 'none', width: 36, height: 36,
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'transform 0.1s'
    },
    expandedOverlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 0.2s ease'
    },
    expandedCard: {
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 24,
        width: '100%', maxWidth: 360, padding: 32, position: 'relative',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    },
    closeBtn: {
        position: 'absolute', top: 20, right: 20, background: 'var(--surface)', border: 'none',
        width: 36, height: 36, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--text-dim)'
    },
    ctrlBtn: {
        background: 'var(--surface)', border: 'none', color: 'var(--text)', width: 48, height: 48,
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'transform 0.1s'
    }
};
