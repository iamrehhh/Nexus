import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import {
    getBook, getBookPage, updateBook, loadAnnotations, saveAnnotation,
    deleteAnnotation, startReadingSession, endReadingSession, saveWord, isWordSaved
} from '../lib/db'
import { ArrowLeft, Settings, MessageSquare, Bot, Send, X, ChevronLeft, ChevronRight, Highlighter, StickyNote, BookOpen, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const HIGHLIGHT_COLORS = {
    yellow: 'rgba(250, 204, 21, 0.3)',
    blue: 'rgba(59, 130, 246, 0.3)',
    green: 'rgba(16, 185, 129, 0.3)',
}

export default function Reader() {
    const { bookId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { theme } = useTheme()

    const [book, setBook] = useState(null)
    const [page, setPage] = useState(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [loading, setLoading] = useState(true)
    const [annotations, setAnnotations] = useState([])

    // Word definition
    const [selectedWord, setSelectedWord] = useState(null)
    const [wordDef, setWordDef] = useState(null)
    const [wordLoading, setWordLoading] = useState(false)
    const [wordSaved, setWordSaved] = useState(false)
    const [wordPos, setWordPos] = useState({ top: 0, left: 0 })

    // Text selection / highlight toolbar
    const [selection, setSelection] = useState(null)
    const [toolbarPos, setToolbarPos] = useState(null)
    const [noteInput, setNoteInput] = useState('')
    const [showNoteInput, setShowNoteInput] = useState(false)

    // AI Assistant
    const [showAI, setShowAI] = useState(false)
    const [aiQuestion, setAiQuestion] = useState('')
    const [aiAnswer, setAiAnswer] = useState('')
    const [aiLoading, setAiLoading] = useState(false)

    // Reader settings
    const [showSettings, setShowSettings] = useState(false)
    const [fontSize, setFontSize] = useState(18)
    const [lineHeight, setLineHeight] = useState(1.8)
    const [readerTheme, setReaderTheme] = useState('auto')
    const [fontType, setFontType] = useState('serif')

    // Annotations sidebar
    const [showAnnotations, setShowAnnotations] = useState(false)
    const [allAnnotations, setAllAnnotations] = useState([])

    // Session tracking
    const sessionRef = useRef(null)
    const startPageRef = useRef(1)
    const pageInputRef = useRef(null)
    const [editingPage, setEditingPage] = useState(false)
    const [pageInputVal, setPageInputVal] = useState('')
    const contentRef = useRef(null)

    // Load settings from localStorage
    useEffect(() => {
        if (bookId) {
            const saved = localStorage.getItem(`reader-settings-${bookId}`)
            if (saved) {
                const s = JSON.parse(saved)
                if (s.fontSize) setFontSize(s.fontSize)
                if (s.lineHeight) setLineHeight(s.lineHeight)
                if (s.readerTheme) setReaderTheme(s.readerTheme)
                if (s.fontType) setFontType(s.fontType)
            }
        }
    }, [bookId])

    // Save settings to localStorage
    useEffect(() => {
        if (bookId) {
            localStorage.setItem(`reader-settings-${bookId}`, JSON.stringify({ fontSize, lineHeight, readerTheme, fontType }))
        }
    }, [fontSize, lineHeight, readerTheme, fontType, bookId])

    // Load book
    useEffect(() => {
        if (user && bookId) loadBook()
        return () => { endSession() }
    }, [user, bookId])

    const loadBook = async () => {
        try {
            const b = await getBook(bookId)
            setBook(b)
            const startPage = (b.current_page || 0) > 0 ? b.current_page : 1
            setCurrentPage(startPage)
            startPageRef.current = startPage
            await loadPage(bookId, startPage)
            // Start reading session
            if (b.status === 'unread') {
                await updateBook(bookId, { status: 'reading' })
            }
            const session = await startReadingSession(user.uid, bookId)
            sessionRef.current = session
        } catch (err) {
            console.error('Failed to load book:', err)
            toast.error('Failed to load book')
        } finally {
            setLoading(false)
        }
    }

    const loadPage = async (bId, pageNum) => {
        const p = await getBookPage(bId, pageNum)
        setPage(p)
        const anns = await loadAnnotations(user.uid, bId, pageNum)
        setAnnotations(anns)
        // Clear word popup
        setSelectedWord(null)
        setWordDef(null)
        setSelection(null)
        setToolbarPos(null)
    }

    const endSession = async () => {
        if (sessionRef.current) {
            const pagesRead = Math.abs(currentPage - startPageRef.current)
            try {
                await endReadingSession(sessionRef.current.id, pagesRead)
            } catch (e) { }
            sessionRef.current = null
        }
    }

    // Navigate page
    const goToPage = async (pageNum) => {
        if (!book || pageNum < 1 || pageNum > book.total_pages) return
        setCurrentPage(pageNum)
        await loadPage(bookId, pageNum)
        const progress = pageNum / book.total_pages
        await updateBook(bookId, { current_page: pageNum, progress, last_read: new Date().toISOString() })
        setBook(prev => ({ ...prev, current_page: pageNum, progress }))
        if (pageNum === book.total_pages) {
            await updateBook(bookId, { status: 'completed' })
            toast.success(`You finished "${book.title}"!`)
        }
        window.scrollTo(0, 0)
    }

    // Keyboard navigation
    useEffect(() => {
        const handler = (e) => {
            if (editingPage || showAI || showNoteInput) return
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPage + 1) }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToPage(currentPage - 1) }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [currentPage, book, editingPage, showAI, showNoteInput])

    // Touch swipe
    const touchStart = useRef(null)
    const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX }
    const handleTouchEnd = (e) => {
        if (!touchStart.current) return
        const diff = touchStart.current - e.changedTouches[0].clientX
        if (Math.abs(diff) > 80) {
            if (diff > 0) goToPage(currentPage + 1)
            else goToPage(currentPage - 1)
        }
        touchStart.current = null
    }

    // Word click handler
    const handleWordClick = async (word, e) => {
        const cleaned = word.replace(/[^a-zA-Z'-]/g, '')
        if (cleaned.length < 2) return
        setSelectedWord(cleaned)
        setWordDef(null)
        setWordLoading(true)
        setWordSaved(false)
        // Position popup near click
        const rect = e.target.getBoundingClientRect()
        setWordPos({ top: rect.bottom + 8, left: Math.min(rect.left, window.innerWidth - 320) })
        // Check if already saved
        const saved = await isWordSaved(user.uid, cleaned)
        setWordSaved(saved)
        // Fetch definition
        try {
            const context = page?.content?.substring(
                Math.max(0, page.content.indexOf(word) - 50),
                page.content.indexOf(word) + word.length + 50
            )
            const res = await fetch('/api/define-word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word: cleaned, context }),
            })
            const def = await res.json()
            setWordDef(def)
        } catch (err) {
            setWordDef({ definition: 'Could not load definition', partOfSpeech: '', simpleExplanation: '', exampleSentence: '' })
        } finally {
            setWordLoading(false)
        }
    }

    const handleSaveWord = async () => {
        if (!selectedWord || !wordDef) return
        try {
            await saveWord(user.uid, {
                bookId,
                word: selectedWord,
                definition: wordDef.definition,
                context: page?.content?.substring(0, 100),
            })
            setWordSaved(true)
            toast.success('Word saved')
        } catch (err) {
            toast.error('Failed to save word')
        }
    }

    // Text selection handler
    useEffect(() => {
        const handler = () => {
            const sel = window.getSelection()
            const text = sel?.toString().trim()
            if (text && text.length > 2 && contentRef.current?.contains(sel.anchorNode)) {
                setSelection(text)
                const range = sel.getRangeAt(0)
                const rect = range.getBoundingClientRect()
                setToolbarPos({ top: rect.top - 48, left: rect.left + rect.width / 2 - 80 })
            } else if (!showNoteInput) {
                setSelection(null)
                setToolbarPos(null)
            }
        }
        document.addEventListener('mouseup', handler)
        document.addEventListener('touchend', handler)
        return () => {
            document.removeEventListener('mouseup', handler)
            document.removeEventListener('touchend', handler)
        }
    }, [showNoteInput])

    const handleHighlight = async (color) => {
        if (!selection) return
        try {
            const ann = await saveAnnotation(user.uid, bookId, {
                pageNumber: currentPage,
                selectedText: selection,
                type: 'highlight',
                color,
            })
            setAnnotations(prev => [...prev, ann])
            setSelection(null)
            setToolbarPos(null)
            window.getSelection()?.removeAllRanges()
        } catch (err) {
            toast.error('Failed to save highlight')
        }
    }

    const handleAddNote = async () => {
        if (!selection || !noteInput.trim()) return
        try {
            const ann = await saveAnnotation(user.uid, bookId, {
                pageNumber: currentPage,
                selectedText: selection,
                note: noteInput.trim(),
                type: 'note',
                color: 'yellow',
            })
            setAnnotations(prev => [...prev, ann])
            setSelection(null)
            setToolbarPos(null)
            setShowNoteInput(false)
            setNoteInput('')
            window.getSelection()?.removeAllRanges()
        } catch (err) {
            toast.error('Failed to save note')
        }
    }

    // Load all annotations for sidebar
    const loadAllAnnotations = async () => {
        const anns = await loadAnnotations(user.uid, bookId)
        setAllAnnotations(anns)
    }

    // AI assistant
    const askAI = async (question) => {
        const q = question || aiQuestion.trim()
        if (!q || !page) return
        setAiLoading(true)
        setAiAnswer('')
        try {
            const res = await fetch('/api/book-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: q,
                    pageContent: page.content,
                    bookTitle: book?.title,
                    userId: user.uid,
                })
            })
            const data = await res.json()
            setAiAnswer(data.answer)
        } catch (err) {
            setAiAnswer('Failed to get answer.')
        } finally {
            setAiLoading(false)
        }
    }

    // Render text with highlights and clickable words
    const renderContent = () => {
        if (!page?.content) return <p style={{ color: 'var(--text-dim)' }}>No content on this page.</p>
        const text = page.content
        const words = text.split(/(\s+)/)

        return (
            <div ref={contentRef}>
                {words.map((segment, i) => {
                    if (/^\s+$/.test(segment)) {
                        return segment.includes('\n') ? <br key={i} /> : <span key={i}> </span>
                    }
                    // Check if this word/phrase is part of a highlight
                    const isHighlighted = annotations.find(a =>
                        a.selected_text && text.includes(a.selected_text) && a.selected_text.includes(segment.replace(/[^a-zA-Z]/g, ''))
                    )
                    return (
                        <span
                            key={i}
                            onClick={(e) => handleWordClick(segment, e)}
                            style={{
                                cursor: 'pointer',
                                transition: 'background 0.1s',
                                borderRadius: 2,
                                padding: '0 1px',
                                ...(isHighlighted ? { background: HIGHLIGHT_COLORS[isHighlighted.color] || HIGHLIGHT_COLORS.yellow } : {}),
                            }}
                        >
                            {segment}
                        </span>
                    )
                })}
            </div>
        )
    }

    // Reader theme colors
    const getThemeStyles = () => {
        const t = readerTheme === 'auto' ? theme : readerTheme
        if (t === 'sepia') return { bg: '#f4ecd8', text: '#3d2e1c' }
        if (t === 'light') return { bg: '#ffffff', text: '#1a1a1a' }
        return { bg: '#1a1a2e', text: '#e2e8f0' } // dark
    }
    const themeStyles = getThemeStyles()

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
                <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
        )
    }

    if (!book) return null

    const progress = book.total_pages > 0 ? (currentPage / book.total_pages) * 100 : 0

    return (
        <div style={{ background: themeStyles.bg, minHeight: '100vh', color: themeStyles.text, position: 'relative' }}
            onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

            {/* Top Bar */}
            <div style={s.topBar}>
                <button onClick={() => { endSession(); navigate('/reading') }} style={s.iconBtn}><ArrowLeft size={18} /></button>
                <span style={s.topTitle}>{book.title?.length > 30 ? book.title.slice(0, 30) + '...' : book.title}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <span style={s.pageInfo}>{currentPage}/{book.total_pages}</span>
                    <button onClick={() => { setShowAnnotations(!showAnnotations); if (!showAnnotations) loadAllAnnotations() }} style={s.iconBtn}>
                        <MessageSquare size={16} />
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} style={s.iconBtn}>
                        <Settings size={16} />
                    </button>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div style={s.settingsPanel}>
                    <label style={s.settLabel}>Font Size: {fontSize}px</label>
                    <input type="range" min="14" max="24" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '100%' }} />
                    <label style={s.settLabel}>Line Spacing</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[{ l: 'Compact', v: 1.5 }, { l: 'Comfortable', v: 1.8 }, { l: 'Relaxed', v: 2.1 }].map(o => (
                            <button key={o.l} onClick={() => setLineHeight(o.v)} style={{ ...s.settChip, ...(lineHeight === o.v ? { background: 'var(--accent)', color: '#fff' } : {}) }}>{o.l}</button>
                        ))}
                    </div>
                    <label style={s.settLabel}>Theme</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[{ l: 'Light', v: 'light' }, { l: 'Sepia', v: 'sepia' }, { l: 'Dark', v: 'dark' }].map(o => (
                            <button key={o.l} onClick={() => setReaderTheme(o.v)} style={{ ...s.settChip, ...(readerTheme === o.v ? { background: 'var(--accent)', color: '#fff' } : {}) }}>{o.l}</button>
                        ))}
                    </div>
                    <label style={s.settLabel}>Font</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setFontType('serif')} style={{ ...s.settChip, fontFamily: 'Georgia, serif', ...(fontType === 'serif' ? { background: 'var(--accent)', color: '#fff' } : {}) }}>Serif</button>
                        <button onClick={() => setFontType('sans')} style={{ ...s.settChip, fontFamily: 'Inter, sans-serif', ...(fontType === 'sans' ? { background: 'var(--accent)', color: '#fff' } : {}) }}>Sans</button>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div style={{
                maxWidth: 680, margin: '0 auto', padding: '80px 32px 100px',
                fontSize, lineHeight, fontFamily: fontType === 'serif' ? 'Georgia, "Times New Roman", serif' : '"Inter", sans-serif',
                letterSpacing: '0.01em',
            }}
                onClick={(e) => {
                    if (!e.target.closest('[data-popup]') && !e.target.closest('span')) {
                        setSelectedWord(null); setWordDef(null)
                    }
                }}
            >
                {renderContent()}
            </div>

            {/* Word Definition Popup */}
            {selectedWord && (
                <div data-popup style={{
                    ...s.wordPopup,
                    top: Math.min(wordPos.top, window.innerHeight - 280),
                    left: Math.max(16, Math.min(wordPos.left, window.innerWidth - 316)),
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{selectedWord}</h3>
                        <button onClick={() => { setSelectedWord(null); setWordDef(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2 }}><X size={14} /></button>
                    </div>
                    {wordLoading ? (
                        <div style={{ padding: '16px 0', textAlign: 'center' }}>
                            <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                        </div>
                    ) : wordDef ? (
                        <>
                            {wordDef.partOfSpeech && <span style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>{wordDef.partOfSpeech}</span>}
                            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginTop: 8 }}>{wordDef.definition}</p>
                            {wordDef.simpleExplanation && <p style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', marginTop: 8 }}>{wordDef.simpleExplanation}</p>}
                            {wordDef.exampleSentence && <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>"{wordDef.exampleSentence}"</p>}
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button onClick={handleSaveWord} disabled={wordSaved} style={{
                                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                                    background: wordSaved ? 'rgba(16,185,129,0.15)' : 'var(--accent)', color: wordSaved ? 'var(--accent-green)' : '#fff',
                                }}>
                                    {wordSaved ? 'Saved ✓' : 'Save Word'}
                                </button>
                                <button onClick={() => { setSelectedWord(null); setWordDef(null) }} style={{
                                    padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer',
                                }}>Dismiss</button>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {/* Selection Toolbar */}
            {selection && toolbarPos && !showNoteInput && (
                <div style={{ ...s.selToolbar, top: toolbarPos.top, left: toolbarPos.left }}>
                    {Object.keys(HIGHLIGHT_COLORS).map(c => (
                        <button key={c} onClick={() => handleHighlight(c)} title={c} style={{
                            width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer',
                            background: HIGHLIGHT_COLORS[c].replace('0.3', '0.8'),
                        }} />
                    ))}
                    <button onClick={() => setShowNoteInput(true)} style={s.selBtn}><StickyNote size={14} /></button>
                    <button onClick={() => { setSelection(null); setToolbarPos(null); window.getSelection()?.removeAllRanges() }} style={s.selBtn}><X size={14} /></button>
                </div>
            )}

            {/* Note Input */}
            {showNoteInput && (
                <div style={s.noteOverlay}>
                    <div style={s.noteModal}>
                        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>Add note for: "{selection?.slice(0, 60)}..."</p>
                        <textarea
                            style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', resize: 'none', outline: 'none' }}
                            rows={3}
                            value={noteInput}
                            onChange={e => setNoteInput(e.target.value)}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                            <button onClick={handleAddNote} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Note</button>
                            <button onClick={() => { setShowNoteInput(false); setNoteInput('') }} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Assistant Button */}
            <button onClick={() => setShowAI(!showAI)} style={s.aiFab}>
                <Bot size={20} />
            </button>

            {/* AI Panel */}
            {showAI && (
                <div style={s.aiPanel}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Ask about this page</span>
                        <button onClick={() => setShowAI(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {['Summarise this page', 'Explain the main concept', 'Key takeaways'].map(q => (
                            <button key={q} onClick={() => { setAiQuestion(q); askAI(q) }} style={{
                                padding: '5px 12px', borderRadius: 16, fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer',
                            }}>{q}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        <input
                            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', outline: 'none' }}
                            placeholder="Ask anything..."
                            value={aiQuestion}
                            onChange={e => setAiQuestion(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && askAI()}
                        />
                        <button onClick={() => askAI()} style={{ padding: '8px 10px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}><Send size={14} /></button>
                    </div>
                    {aiLoading && <div style={{ textAlign: 'center', padding: 12 }}><div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} /></div>}
                    {aiAnswer && <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, padding: '8px 0', whiteSpace: 'pre-wrap' }}>{aiAnswer}</div>}
                </div>
            )}

            {/* Annotations Sidebar */}
            {showAnnotations && (
                <div style={s.annSidebar}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Annotations</span>
                        <button onClick={() => setShowAnnotations(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                    {allAnnotations.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No annotations yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {allAnnotations.map(a => (
                                <div key={a.id} style={{ padding: '10px 12px', background: 'var(--surface-hover)', borderRadius: 8, borderLeft: `3px solid ${HIGHLIGHT_COLORS[a.color]?.replace('0.3', '0.8') || 'var(--accent)'}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 600 }}>Page {a.page_number}</span>
                                        <button onClick={async () => {
                                            await deleteAnnotation(a.id)
                                            setAllAnnotations(prev => prev.filter(x => x.id !== a.id))
                                            setAnnotations(prev => prev.filter(x => x.id !== a.id))
                                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2 }}><Trash2 size={12} /></button>
                                    </div>
                                    <p style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, lineHeight: 1.4 }}>"{a.selected_text?.slice(0, 100)}{a.selected_text?.length > 100 ? '...' : ''}"</p>
                                    {a.note && <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontStyle: 'italic' }}>{a.note}</p>}
                                    <button onClick={() => { goToPage(a.page_number); setShowAnnotations(false) }} style={{
                                        fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0,
                                    }}>Go to page →</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Bar */}
            <div style={s.bottomBar}>
                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} style={{ ...s.iconBtn, opacity: currentPage <= 1 ? 0.3 : 1 }}>
                    <ChevronLeft size={20} />
                </button>

                <div style={s.progressSection}>
                    <div style={s.progressBarBottom}>
                        <div style={{ ...s.progressFillBottom, width: `${progress}%` }} />
                    </div>
                    {editingPage ? (
                        <input
                            ref={pageInputRef}
                            style={s.pageInput}
                            value={pageInputVal}
                            onChange={e => setPageInputVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(pageInputVal); if (n) goToPage(n); setEditingPage(false) } if (e.key === 'Escape') setEditingPage(false) }}
                            onBlur={() => setEditingPage(false)}
                            autoFocus
                        />
                    ) : (
                        <button onClick={() => { setEditingPage(true); setPageInputVal(currentPage.toString()) }} style={s.pageLabel}>
                            <span className="mono">{currentPage}</span> <span style={{ color: 'var(--text-faint)' }}>/ {book.total_pages}</span>
                        </button>
                    )}
                </div>

                <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= book.total_pages} style={{ ...s.iconBtn, opacity: currentPage >= book.total_pages ? 0.3 : 1 }}>
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    )
}

const s = {
    topBar: { position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', zIndex: 50 },
    topTitle: { fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, margin: '0 12px' },
    pageInfo: { fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', padding: '0 8px' },
    iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center' },
    settingsPanel: { position: 'fixed', top: 48, right: 12, width: 260, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, zIndex: 60, boxShadow: 'var(--shadow)' },
    settLabel: { fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginTop: 12, marginBottom: 6 },
    settChip: { padding: '6px 12px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' },
    wordPopup: { position: 'fixed', width: 300, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, zIndex: 70, boxShadow: 'var(--shadow)', animation: 'fadeUp 0.2s ease' },
    selToolbar: { position: 'fixed', display: 'flex', gap: 6, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 70, boxShadow: 'var(--shadow)', alignItems: 'center' },
    selBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4, display: 'flex', alignItems: 'center' },
    noteOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80, padding: 20 },
    noteModal: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 },
    aiFab: { position: 'fixed', bottom: 80, right: 20, width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(99,102,241,0.3)', zIndex: 50 },
    aiPanel: { position: 'fixed', bottom: 60, right: 16, width: 320, maxHeight: 420, overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, zIndex: 60, boxShadow: 'var(--shadow)', animation: 'fadeUp 0.2s ease' },
    annSidebar: { position: 'fixed', top: 48, right: 0, bottom: 60, width: 320, background: 'var(--bg2)', borderLeft: '1px solid var(--border)', padding: 16, overflowY: 'auto', zIndex: 55, animation: 'fadeIn 0.2s ease' },
    bottomBar: { position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', zIndex: 50 },
    progressSection: { flex: 1, margin: '0 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
    progressBarBottom: { width: '100%', height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' },
    progressFillBottom: { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' },
    pageLabel: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 4, alignItems: 'center' },
    pageInput: { width: 60, padding: '2px 6px', background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 4, fontSize: 12, color: 'var(--text)', textAlign: 'center', outline: 'none' },
}
