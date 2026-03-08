import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
    loadVaultFolders, createVaultFolder, updateVaultFolder, deleteVaultFolder,
    loadVaultNotes, saveVaultNote, deleteVaultNote
} from '../lib/db'
import toast from 'react-hot-toast'
import JSZip from 'jszip'
import {
    Lock, Folder, Search, Pin, Archive, Plus, MoreVertical,
    Bookmark, Palette, Download, Upload, X, Check, Bold, Italic,
    Underline, Strikethrough, Code, Link as LinkIcon, Heading1, Heading2,
    List, ListOrdered, Quote, HelpCircle, ChevronLeft, Menu, Minus, Trash2
} from 'lucide-react'

// NOTE_COLORS and FOLDER_COLORS are no longer needed for new clean look

export default function Vault() {
    const { user } = useAuth()
    const navigate = useNavigate()

    // Screen size for responsive layout
    const [windowWidth, setWindowWidth] = useState(window.innerWidth)
    const [mobileView, setMobileView] = useState('left') // left, middle, right
    const [tabletNavOpen, setTabletNavOpen] = useState(false)

    // Data State
    const [folders, setFolders] = useState([])
    const [stats, setStats] = useState({ all: 0, pinned: 0, archived: 0 })
    const [notes, setNotes] = useState([])
    const [currentView, setCurrentView] = useState({ id: 'All Notes', name: 'All Notes' }) // Folders or 'All Notes', 'Pinned', 'Archived'

    // Note Editor State
    const [selectedNote, setSelectedNote] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    const editorRef = useRef(null)
    const titleRef = useRef(null)
    const saveTimeout = useRef(null)

    // Search State
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState(null)
    const [isSearching, setIsSearching] = useState(false)
    const searchTimeout = useRef(null)

    // UI States
    const [loading, setLoading] = useState(true)
    const [showShortcuts, setShowShortcuts] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')
    const [showNewFolder, setShowNewFolder] = useState(false)

    // Editor Tag State
    const [newTag, setNewTag] = useState('')

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const isMobile = windowWidth < 768
    const isTablet = windowWidth >= 768 && windowWidth < 1024

    useEffect(() => {
        if (user) loadInitialData()
    }, [user])

    useEffect(() => {
        if (user) loadNotesForView()
    }, [currentView, user])

    const loadInitialData = async () => {
        try {
            const data = await loadVaultFolders(user.uid)
            let userFolders = data.folders

            // Seed default folders if empty
            if (userFolders.length === 0) {
                await Promise.all([
                    createVaultFolder(user.uid, 'General', 'folder', '#6366f1'),
                    createVaultFolder(user.uid, 'Ideas', 'lightbulb', '#f59e0b'),
                    createVaultFolder(user.uid, 'Work', 'briefcase', '#3b82f6'),
                    createVaultFolder(user.uid, 'Personal', 'user', '#10b981')
                ])
                const newData = await loadVaultFolders(user.uid)
                userFolders = newData.folders
            }

            setFolders(userFolders)
            setStats({ all: data.allCount, pinned: data.pinnedCount, archived: data.archivedCount })
        } catch (err) {
            toast.error('Failed to load vault folders')
        } finally {
            setLoading(false)
        }
    }

    const loadNotesForView = async () => {
        try {
            const data = await loadVaultNotes(user.uid, { folder: currentView.id })
            setNotes(data || [])
        } catch (err) {
            toast.error('Failed to load notes')
        }
    }

    // --- Search Logic ---
    useEffect(() => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current)
        if (!searchQuery.trim()) {
            setSearchResults(null)
            setIsSearching(false)
            return
        }

        setIsSearching(true)
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch('/api/vault', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'search', query: searchQuery, userId: user.uid, mode: 'both' })
                })
                const data = await res.json()
                setSearchResults(data.results || [])
            } catch (err) {
                console.error('Search failed', err)
            } finally {
                setIsSearching(false)
            }
        }, 400)
    }, [searchQuery, user])

    // --- Note Editing & Auto-save ---
    const handleNoteChange = () => {
        if (!selectedNote) return

        setIsSaving(true)
        if (saveTimeout.current) clearTimeout(saveTimeout.current)

        saveTimeout.current = setTimeout(async () => {
            await saveCurrentNote()
        }, 1500)
    }

    const saveCurrentNote = async () => {
        if (!selectedNote) {
            setIsSaving(false)
            return
        }

        const title = titleRef.current?.innerText || 'Untitled'
        const content = editorRef.current?.innerHTML || ''
        const wordCount = editorRef.current?.innerText.trim().split(/\s+/).filter(w => w.length > 0).length || 0

        const updates = {
            id: selectedNote.id,
            title,
            content,
            folder_id: selectedNote.folder_id || null,
            is_pinned: selectedNote.is_pinned || false
        }

        try {
            const savedNote = await saveVaultNote(user.uid, updates)
            setSelectedNote(prev => ({ ...prev, updated_at: savedNote.updated_at }))

            // Background embedding
            fetch('/api/vault', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'embed', noteId: savedNote.id, userId: user.uid, title, content })
            }).catch(e => console.error('Embed failed', e))

            // Update in list
            setNotes(prev => prev.map(n => n.id === savedNote.id ? savedNote : n))

            // Refresh counts if needed (naive)
            loadInitialData()
        } catch (err) {
            toast.error('Failed to save note')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCreateNote = async () => {
        const folderId = (currentView.id !== 'All Notes' && currentView.id !== 'Pinned' && currentView.id !== 'Archived') ? currentView.id : null
        try {
            const newNote = await saveVaultNote(user.uid, {
                title: '',
                content: '',
                folder_id: folderId,
                is_pinned: currentView.id === 'Pinned'
            })
            setNotes([newNote, ...notes])
            setSelectedNote(newNote)
            if (isMobile) setMobileView('right')
            setTimeout(() => {
                if (titleRef.current) titleRef.current.focus()
            }, 100)
            loadInitialData()
        } catch (err) {
            toast.error('Failed to create note')
        }
    }

    const handleDeleteNote = async (noteId) => {
        if (!window.confirm('Delete this note permanently?')) return
        try {
            await deleteVaultNote(noteId)
            setNotes(prev => prev.filter(n => n.id !== noteId))
            if (selectedNote?.id === noteId) {
                setSelectedNote(null)
                if (isMobile) setMobileView('middle')
            }
            toast.success('Note deleted')
            loadInitialData()
        } catch (err) {
            toast.error('Failed to delete note')
        }
    }

    const execCmd = (cmd, val = null) => {
        document.execCommand(cmd, false, val)
        if (editorRef.current) editorRef.current.focus()
        handleNoteChange()
    }

    // --- Format Handlers ---
    const insertCodeBlock = () => {
        const html = `<pre style="background:var(--bg);padding:12px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:13px;overflow-x:auto;"><code>\n</code></pre><p><br></p>`
        execCmd('insertHTML', html)
    }

    const insertDivider = () => {
        execCmd('insertHTML', '<hr style="border:none;border-top:1px solid var(--border);margin:24px 0;"/><p><br></p>')
    }

    const insertBlockquote = () => {
        execCmd('formatBlock', 'blockquote')
    }

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault()
                handleCreateNote()
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault()
                document.getElementById('vault-search-input')?.focus()
            }
            if (e.key === 'Escape') {
                setSearchQuery('')
                setShowNewFolder(false)
                setIsSearching(false)
            }

            // Editor formatting
            if (selectedNote && document.activeElement === editorRef.current) {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault()
                    saveCurrentNote()
                    toast.success('Note saved')
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedNote, currentView])

    // --- Export / Import ---
    const handleExportNote = (note) => {
        const blob = new Blob([`${note.title}\n\n${note.content.replace(/<[^>]+>/g, '')}`], { type: 'text/plain' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${note.title || 'Untitled'}.txt`
        a.click()
    }

    const handleExportAll = async () => {
        try {
            const allNotes = await loadVaultNotes(user.uid, { folder: 'All Notes' })
            const zip = new JSZip()

            allNotes.forEach(note => {
                const folderName = note.folder || 'General'
                const content = `${note.title}\n\n${note.content.replace(/<[^>]+>/g, '')}`
                zip.folder(folderName).file(`${note.title || 'Untitled_' + note.id.substring(0, 4)}.txt`, content)
            })

            const content = await zip.generateAsync({ type: 'blob' })
            const url = window.URL.createObjectURL(content)
            const a = document.createElement('a')
            a.href = url
            a.download = `Nexus_Vault_Export.zip`
            a.click()
            toast.success('Vault exported')
        } catch (err) {
            toast.error('Failed to export vault')
            console.error(err)
        }
    }

    const handleImportNotes = async (e) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        let successCount = 0
        setLoading(true)
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const text = await file.text()
            const name = file.name.replace(/\.(txt|md)$/i, '')
            try {
                await saveVaultNote(user.uid, {
                    title: name,
                    content: text.replace(/\n/g, '<br>'),
                    folder_id: null,
                    is_pinned: false
                })
                successCount++
            } catch (err) { console.error('Import err', err) }
        }

        if (successCount > 0) {
            toast.success(`Imported ${successCount} notes`)
            loadInitialData()

            // Re-fetch notes if we are in General or All Notes
            if (currentView.id === 'General' || currentView.id === 'All Notes') {
                loadNotesForView()
            }
        } else {
            toast.error('Failed to import notes')
        }
        e.target.value = null
        setLoading(false)
    }

    // --- Render Logic ---
    const renderFolderList = () => (
        <div style={{ ...styles.column, ...styles.leftColumn, display: (!isMobile || mobileView === 'left' || (isTablet && tabletNavOpen)) ? 'flex' : 'none' }}>
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Lock size={20} style={{ color: 'var(--accent)' }} />
                    <h2 style={{ fontSize: 18, fontWeight: 600 }}>Vault</h2>
                </div>
                {isMobile && <button onClick={() => navigate('/dashboard')} style={styles.iconBtn}><X size={18} /></button>}
                {isTablet && <button onClick={() => setTabletNavOpen(false)} style={styles.iconBtn}><ChevronLeft size={18} /></button>}
            </div>

            <div style={styles.searchWrapper}>
                <Search size={16} style={styles.searchIcon} />
                <input
                    id="vault-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes..."
                    style={styles.searchInput}
                />
                {isSearching && <div style={styles.spinnerWrapper}><div style={styles.spinner} /></div>}
                {searchQuery && !isSearching && <button onClick={() => setSearchQuery('')} style={styles.clearSearchBtn}><X size={14} /></button>}
            </div>

            <div style={styles.folderScroll}>
                {searchQuery ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {searchResults?.length === 0 ? (
                            <p style={styles.emptyText}>No results found.</p>
                        ) : (
                            searchResults?.map(res => (
                                <div key={res.noteId} style={styles.searchResultItem} onClick={() => {
                                    // Hacky way to open note from search
                                    loadVaultNotes(user.uid, { folder: 'All Notes' }).then(n => {
                                        const note = n.find(x => x.id === res.noteId)
                                        if (note) {
                                            setSelectedNote(note)
                                            if (isMobile) setMobileView('right')
                                        }
                                    })
                                }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{res.title || 'Untitled'}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>In {res.folder}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.contentPreview}</div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <>
                        <FolderItem icon={Folder} label="All Notes" count={stats.all} active={currentView.id === 'All Notes'} onClick={() => { setCurrentView({ id: 'All Notes', name: 'All Notes' }); if (isMobile) setMobileView('middle') }} />
                        <FolderItem icon={Pin} label="Pinned" count={stats.pinned} active={currentView.id === 'Pinned'} onClick={() => { setCurrentView({ id: 'Pinned', name: 'Pinned' }); if (isMobile) setMobileView('middle') }} />
                        <FolderItem icon={Archive} label="Archived" count={stats.archived} active={currentView.id === 'Archived'} onClick={() => { setCurrentView({ id: 'Archived', name: 'Archived' }); if (isMobile) setMobileView('middle') }} />

                        <div style={styles.divider} />

                        {folders.map(f => (
                            <div key={f.id} style={{ display: 'flex', alignItems: 'center' }}>
                                <FolderItem
                                    icon={Folder}
                                    iconColor={f.color}
                                    label={f.name}
                                    count={f.note_count}
                                    active={currentView.id === f.id}
                                    onClick={() => { setCurrentView({ id: f.id, name: f.name }); if (isMobile) setMobileView('middle') }}
                                />
                                <button onClick={(e) => { e.stopPropagation(); deleteVaultFolder(user.uid, f.id, f.name, false).then(loadInitialData) }} style={{ ...styles.iconBtn, opacity: 0.5, marginLeft: 'auto' }}>
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}

                        {showNewFolder ? (
                            <input
                                autoFocus
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={async e => {
                                    if (e.key === 'Enter' && newFolderName.trim()) {
                                        await createVaultFolder(user.uid, newFolderName.trim())
                                        setNewFolderName('')
                                        setShowNewFolder(false)
                                        loadInitialData()
                                    }
                                    if (e.key === 'Escape') setShowNewFolder(false)
                                }}
                                onBlur={() => setShowNewFolder(false)}
                                placeholder="Folder name..."
                                style={styles.newFolderInput}
                            />
                        ) : (
                            <button onClick={() => setShowNewFolder(true)} style={styles.newFolderBtn}>
                                <Plus size={16} /> New Folder
                            </button>
                        )}
                    </>
                )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                <label style={{ ...styles.actionLink, cursor: 'pointer' }}>
                    <Upload size={14} /> Import Notes
                    <input type="file" multiple accept=".txt,.md" style={{ display: 'none' }} onChange={handleImportNotes} />
                </label>
                <button onClick={handleExportAll} style={styles.actionLink}><Download size={14} /> Export All</button>
            </div>
        </div>
    )

    const renderNotesList = () => (
        <div style={{ ...styles.column, ...styles.middleColumn, display: (!isMobile || mobileView === 'middle') ? 'flex' : 'none' }}>
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {(isMobile || isTablet) && (
                        <button onClick={() => isMobile ? setMobileView('left') : setTabletNavOpen(true)} style={styles.iconBtn}>
                            {isMobile ? <ChevronLeft size={18} /> : <Menu size={18} />}
                        </button>
                    )}
                    <h2 style={{ fontSize: 16, fontWeight: 600 }}>{currentView.name}</h2>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>{notes.length} notes</span>
                    <button onClick={handleCreateNote} style={styles.iconBtn}><Plus size={18} /></button>
                </div>
            </div>

            <div style={styles.notesScroll}>
                {notes.length === 0 ? (
                    <div style={styles.emptyState}>
                        <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12 }}>Nothing here yet.</p>
                        <button onClick={handleCreateNote} style={styles.primaryBtn}>Create your first note</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {notes.filter(n => n.is_pinned).length > 0 && currentView.id !== 'Pinned' && (
                            <div style={styles.sectionTitle}>Pinned</div>
                        )}
                        {notes.map(note => (
                            <div
                                key={note.id}
                                style={{
                                    ...styles.noteItem,
                                    background: selectedNote?.id === note.id ? 'var(--surface-hover)' : 'var(--surface)',
                                    border: selectedNote?.id === note.id ? '1px solid var(--accent)' : '1px solid var(--border)'
                                }}
                                onClick={() => {
                                    setSelectedNote(note)
                                    if (isMobile) setMobileView('right')
                                    setTimeout(() => {
                                        if (editorRef.current) {
                                            editorRef.current.innerHTML = note.content || ''
                                            titleRef.current.innerText = note.title || ''
                                        }
                                    }, 50)
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{note.title || 'Untitled'}</h3>
                                    {note.is_pinned && <Pin size={12} style={{ color: 'var(--accent)', marginLeft: 8, flexShrink: 0 }} />}
                                </div>
                                <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4, height: 34, overflow: 'hidden', marginBottom: 8 }}>{note.content_preview || 'Empty note...'}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {currentView.id === 'All Notes' && (
                                            <span style={styles.badge}>{note.folder || 'Uncategorized'}</span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                                        {new Date(note.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )

    const renderEditor = () => (
        <div style={{ ...styles.column, ...styles.rightColumn, background: 'var(--bg)', display: (!isMobile || mobileView === 'right') ? 'flex' : 'none' }}>
            {!selectedNote ? (
                <div style={styles.emptyEditor}>
                    <Lock size={32} style={{ color: 'var(--text-faint)', marginBottom: 16 }} />
                    <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>Select a note to start reading or editing</p>
                </div>
            ) : (
                <>
                    <div style={styles.editorTopbar}>
                        {isMobile && <button onClick={() => { saveCurrentNote(); setMobileView('middle') }} style={styles.iconBtn}><ChevronLeft size={20} /></button>}
                        <div style={{ display: 'flex', flex: 1, gap: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{isSaving ? 'Saving...' : 'Saved'}</span>
                            <button onClick={() => { setSelectedNote(p => ({ ...p, is_pinned: !p.is_pinned })); handleNoteChange() }} style={{ ...styles.iconBtn, color: selectedNote.is_pinned ? 'var(--accent)' : 'inherit' }}>
                                <Bookmark size={18} fill={selectedNote.is_pinned ? 'currentColor' : 'none'} />
                            </button>
                            <button onClick={() => { setSelectedNote(p => ({ ...p, is_archived: !p.is_archived })); handleNoteChange(); toast.success(!selectedNote.is_archived ? 'Archived' : 'Unarchived') }} style={styles.iconBtn}>
                                <Archive size={18} />
                            </button>
                            <button onClick={() => handleDeleteNote(selectedNote.id)} style={{ ...styles.iconBtn, color: 'var(--accent-red)' }}>
                                <MoreVertical size={18} />
                            </button>
                        </div>
                    </div>

                    <div style={styles.editorScroll}>
                        <div style={styles.editorContent}>
                            <h1
                                ref={titleRef}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={handleNoteChange}
                                onBlur={saveCurrentNote}
                                style={styles.titleInput}
                                data-placeholder="Note title..."
                            />

                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
                                <span style={styles.tagPill}>
                                    <Folder size={12} style={{ marginRight: 4 }} />
                                    {selectedNote.folder || 'Uncategorized'}
                                </span>
                            </div>

                            {/* Toolbar */}
                            <div style={styles.toolbar}>
                                <button onMouseDown={e => { e.preventDefault(); execCmd('bold') }} style={styles.toolBtn}><Bold size={14} /></button>
                                <button onMouseDown={e => { e.preventDefault(); execCmd('italic') }} style={styles.toolBtn}><Italic size={14} /></button>
                                <button onMouseDown={e => { e.preventDefault(); execCmd('underline') }} style={styles.toolBtn}><Underline size={14} /></button>
                                <button onMouseDown={e => { e.preventDefault(); execCmd('strikeThrough') }} style={styles.toolBtn}><Strikethrough size={14} /></button>
                                <div style={styles.toolDivider} />
                                <button onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'H1') }} style={styles.toolBtn}><Heading1 size={14} /></button>
                                <button onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'H2') }} style={styles.toolBtn}><Heading2 size={14} /></button>
                                <div style={styles.toolDivider} />
                                <button onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList') }} style={styles.toolBtn}><List size={14} /></button>
                                <button onMouseDown={e => { e.preventDefault(); execCmd('insertOrderedList') }} style={styles.toolBtn}><ListOrdered size={14} /></button>
                                <div style={styles.toolDivider} />
                                <button onMouseDown={e => { e.preventDefault(); insertBlockquote() }} style={styles.toolBtn}><Quote size={14} /></button>
                                <button onMouseDown={e => { e.preventDefault(); insertCodeBlock() }} style={styles.toolBtn}><Code size={14} /></button>
                                <button onMouseDown={e => { e.preventDefault(); insertDivider() }} style={styles.toolBtn}><Minus size={14} /></button>
                            </div>

                            <div
                                ref={editorRef}
                                contentEditable
                                suppressContentEditableWarning
                                onInput={handleNoteChange}
                                onBlur={saveCurrentNote}
                                style={styles.richEditor}
                                data-placeholder="Start typing..."
                            />
                        </div>
                    </div>

                    <div style={styles.editorBottomBar}>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{editorRef.current?.innerText.trim().split(/\s+/).filter(w => w.length > 0).length || 0} words</span>
                    </div>
                </>
            )}
        </div>
    )

    // --- Touch Swipe Gestures ---
    const touchStartX = useRef(null)
    const touchEndX = useRef(null)

    const handleTouchStart = (e) => {
        touchStartX.current = e.targetTouches[0].clientX
    }

    const handleTouchMove = (e) => {
        touchEndX.current = e.targetTouches[0].clientX
    }

    const handleTouchEnd = () => {
        if (!touchStartX.current || !touchEndX.current) return
        const distance = touchStartX.current - touchEndX.current
        const isSwipeRight = distance < -60 // Swipe right to go back

        if (isMobile && isSwipeRight) {
            if (mobileView === 'right') {
                saveCurrentNote()
                setMobileView('middle')
            } else if (mobileView === 'middle') {
                setMobileView('left')
            }
        }

        touchStartX.current = null
        touchEndX.current = null
    }

    if (loading) return <div style={styles.loading}><div style={styles.spinner} /></div>

    return (
        <div
            style={styles.page}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {renderFolderList()}
            {renderNotesList()}
            {renderEditor()}

            <button onClick={() => setShowShortcuts(true)} style={styles.helpBtn}>
                <HelpCircle size={16} />
            </button>

            {showShortcuts && (
                <div style={styles.modalOverlay} onClick={() => setShowShortcuts(false)}>
                    <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Keyboard Shortcuts</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[['New Note', 'Cmd/Ctrl + N'], ['Search Vault', 'Cmd/Ctrl + F'], ['Force Save', 'Cmd/Ctrl + S'], ['Bold', 'Cmd/Ctrl + B'], ['Italic', 'Cmd/Ctrl + I'], ['Underline', 'Cmd/Ctrl + U'], ['Close Search', 'Esc']].map(s => (
                                <div key={s[0]} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: 'var(--text-dim)' }}>{s[0]}</span>
                                    <span style={{ background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>{s[1]}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowShortcuts(false)} style={{ ...styles.primaryBtn, width: '100%', marginTop: 24 }}>Got it</button>
                    </div>
                </div>
            )}
        </div>
    )
}

const FolderItem = ({ icon: Icon, iconColor, label, count, active, onClick }) => (
    <div style={{ ...styles.folderItem, background: active ? 'var(--surface-hover)' : 'transparent' }} onClick={onClick}>
        <Icon size={16} color={iconColor || (active ? 'var(--text)' : 'var(--text-dim)')} />
        <span style={{ flex: 1, fontSize: 14, color: active ? 'var(--text)' : 'var(--text-dim)', fontWeight: active ? 500 : 400 }}>{label}</span>
        {count > 0 && <span style={styles.folderCount}>{count}</span>}
    </div>
)

const styles = {
    page: { display: 'flex', height: '100dvh', width: '100%', background: 'var(--bg)', overflow: 'hidden' },
    column: { height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' },
    leftColumn: { flex: '0 0 240px', background: 'var(--surface)', zIndex: 10 },
    middleColumn: { flex: '0 0 320px', background: 'var(--bg)', zIndex: 5 },
    rightColumn: { flex: 1, borderRight: 'none', position: 'relative' },
    header: { padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
    iconBtn: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, transition: 'color 0.15s' },
    searchWrapper: { margin: '0 16px 16px', position: 'relative', display: 'flex', alignItems: 'center' },
    searchIcon: { position: 'absolute', left: 10, color: 'var(--text-faint)', pointerEvents: 'none' },
    searchInput: { width: '100%', padding: '8px 32px 8px 32px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', outline: 'none' },
    clearSearchBtn: { position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 2 },
    spinnerWrapper: { position: 'absolute', right: 8, display: 'flex' },
    spinner: { width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' },
    folderScroll: { flex: 1, overflowY: 'auto', padding: '0 12px' },
    folderItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s', height: 36 },
    folderCount: { fontSize: 11, background: 'var(--bg)', color: 'var(--text-dim)', padding: '2px 6px', borderRadius: 12, fontWeight: 500 },
    divider: { height: 1, background: 'var(--border)', margin: '12px 12px' },
    newFolderBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', marginTop: 8 },
    newFolderInput: { width: 'calc(100% - 24px)', margin: '8px 12px', padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 6, fontSize: 13, color: 'var(--text)', outline: 'none' },
    actionLink: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', borderTop: '1px solid var(--border)' },
    notesScroll: { flex: 1, overflowY: 'auto', padding: '0 16px 24px' },
    emptyState: { padding: '40px 20px', textAlign: 'center' },
    primaryBtn: { padding: '10px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
    sectionTitle: { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px 4px' },
    noteItem: { padding: 16, borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s ease', marginBottom: 8 },
    badge: { fontSize: 10, background: 'var(--bg)', color: 'var(--text-dim)', padding: '2px 6px', borderRadius: 4, fontWeight: 500, opacity: 0.8 },
    emptyEditor: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    editorTopbar: { display: 'flex', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)40', flexShrink: 0 },
    editorScroll: { flex: 1, overflowY: 'auto' },
    editorContent: { maxWidth: 680, margin: '0 auto', padding: '40px 32px 80px', width: '100%' },
    titleInput: { fontSize: 28, fontWeight: 700, color: 'var(--text)', border: 'none', outline: 'none', background: 'transparent', width: '100%', marginBottom: 16 },
    tagPill: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: 'var(--surface-hover)', padding: '4px 8px', borderRadius: 12, color: 'var(--text-dim)' },
    tagRemove: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 },
    tagInput: { width: 100, fontSize: 11, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)' },
    toolbar: { display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 24, flexWrap: 'wrap' },
    toolBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'none', border: 'none', borderRadius: 4, color: 'var(--text-dim)', cursor: 'pointer' },
    toolDivider: { width: 1, height: 16, background: 'var(--border)', margin: '0 4px' },
    richEditor: { fontSize: 15, lineHeight: 1.8, color: 'var(--text)', outline: 'none', minHeight: 300, paddingBottom: 100 },
    editorBottomBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderTop: '1px solid var(--border)40', background: 'transparent' },
    helpBtn: { position: 'absolute', bottom: 20, right: 20, width: 32, height: 32, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', cursor: 'pointer', zIndex: 50 },
    modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modalContent: { background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
    searchResultItem: { padding: 12, borderRadius: 8, background: 'var(--surface-hover)', cursor: 'pointer', transition: 'background 0.15s' },
    emptyText: { fontSize: 13, color: 'var(--text-dim)', padding: '12px', textAlign: 'center' },
    loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw' }
}
