import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PRESET_PERSONALITIES } from '../lib/personalities'
import { loadPlaylist, loadCustomPersonalities, removeFromPlaylist } from '../lib/db'
import { ArrowLeft, Music, ExternalLink, Trash2 } from 'lucide-react'
import styles from './Playlist.module.css'

export default function Playlist() {
    const { personalityId } = useParams()
    const { user } = useAuth()
    const navigate = useNavigate()
    const [songs, setSongs] = useState([])
    const [personality, setPersonality] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            let p = PRESET_PERSONALITIES.find(x => x.id === personalityId)
            if (!p && user) {
                const custom = await loadCustomPersonalities(user.uid)
                p = custom.find(x => x.id === personalityId)
            }
            setPersonality(p)

            if (user && personalityId) {
                const data = await loadPlaylist(user.uid, personalityId)
                setSongs(data)
            }
            setLoading(false)
        }
        load()
    }, [user, personalityId])

    const handleRemove = async (id) => {
        try {
            await removeFromPlaylist(id)
            setSongs(prev => prev.filter(s => s.id !== id))
        } catch (e) { }
    }

    if (loading) return <div className={styles.page}><div className={styles.loading}><span className={styles.spinner} /></div></div>

    return (
        <div className={styles.page}>
            <div className={styles.glow} />
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(`/chat/${personalityId}`)}>
                    <ArrowLeft size={18} />
                </button>
                <div className={styles.headerInfo}>
                    <h1 className={styles.title}>
                        <Music size={18} /> Our Playlist
                    </h1>
                    <p className={styles.subtitle}>Songs {personality?.name} shared with you</p>
                </div>
            </header>

            <div className={styles.content}>
                {songs.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyEmoji}>🎵</div>
                        <p className={styles.emptyText}>No songs yet</p>
                        <p className={styles.emptySub}>When {personality?.name || 'she'} recommends a song, you can save it here</p>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {songs.map(song => (
                            <div key={song.id} className={styles.songCard}>
                                <div className={styles.songInfo}>
                                    <div className={styles.songName}>{song.song_name}</div>
                                    {song.her_message && (
                                        <div className={styles.herNote}>"{song.her_message}"</div>
                                    )}
                                    <div className={styles.songDate}>
                                        {new Date(song.added_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <div className={styles.songActions}>
                                    <a
                                        href={`https://open.spotify.com/search/${encodeURIComponent(song.song_name)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.spotifyBtn}
                                    >
                                        <ExternalLink size={14} /> Spotify
                                    </a>
                                    <button className={styles.removeBtn} onClick={() => handleRemove(song.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
