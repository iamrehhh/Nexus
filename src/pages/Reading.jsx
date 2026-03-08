import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { loadBooks, createBook, updateBook, deleteBook, getBookStats, loadVocabulary, deleteWord } from '../lib/db'
import { supabase } from '../lib/supabase'
import { BookOpen, Plus, Upload, X, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const COVER_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

export default function Reading() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [tab, setTab] = useState('library')
    const [filter, setFilter] = useState('all')
    const [books, setBooks] = useState([])
    const [stats, setStats] = useState({ total: 0, pagesRead: 0, reading: 0, completed: 0 })
    const [loading, setLoading] = useState(true)
    const [showUpload, setShowUpload] = useState(false)
    const [editBook, setEditBook] = useState(null)
    // Vocabulary
    const [vocabWords, setVocabWords] = useState([])
    const [vocabSearch, setVocabSearch] = useState('')

    useEffect(() => {
        if (user) loadData()
    }, [user, filter])

    useEffect(() => {
        if (user && tab === 'vocabulary') loadVocab()
    }, [user, tab])

    const loadData = async () => {
        try {
            const [booksData, statsData] = await Promise.all([
                loadBooks(user.uid, { status: filter === 'all' ? undefined : filter }),
                getBookStats(user.uid),
            ])
            setBooks(booksData)
            setStats(statsData)
        } catch (err) {
            console.error('Failed to load books:', err)
        } finally {
            setLoading(false)
        }
    }

    // Polling for processing books
    useEffect(() => {
        const hasProcessing = books.some(b => b.status === 'processing' || b.status === 'partial')
        if (!hasProcessing) return

        const interval = setInterval(() => {
            loadData()
        }, 5000)

        return () => clearInterval(interval)
    }, [books, filter, user])

    const loadVocab = async () => {
        try {
            const words = await loadVocabulary(user.uid)
            setVocabWords(words)
        } catch (err) {
            console.error('Failed to load vocabulary:', err)
        }
    }

    const handleDeleteBook = async (book) => {
        if (!window.confirm(`Delete "${book.title}"? This cannot be undone.`)) return
        try {
            if (book.file_path) {
                await supabase.storage.from('books').remove([book.file_path])
            }
            await deleteBook(book.id)
            setBooks(prev => prev.filter(b => b.id !== book.id))
            toast.success('Book deleted')
        } catch (err) {
            toast.error('Failed to delete book')
        }
    }

    const handleDeleteWord = async (wordId) => {
        try {
            await deleteWord(wordId)
            setVocabWords(prev => prev.filter(w => w.id !== wordId))
        } catch (err) {
            toast.error('Failed to delete word')
        }
    }

    const filteredVocab = vocabWords.filter(w =>
        w.word.toLowerCase().includes(vocabSearch.toLowerCase())
    )

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
            <div style={styles.headerRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BookOpen size={22} style={{ color: 'var(--accent-blue)' }} />
                    <h1 style={styles.title}>Reading Room</h1>
                </div>
                <button onClick={() => setShowUpload(true)} style={styles.addBtn}>
                    <Plus size={16} />
                    <span>Add Book</span>
                </button>
            </div>

            {/* Tabs: Library / Vocabulary */}
            <div style={styles.tabRow}>
                <button onClick={() => setTab('library')} style={{ ...styles.mainTab, ...(tab === 'library' ? styles.mainTabActive : {}) }}>Library</button>
                <button onClick={() => setTab('vocabulary')} style={{ ...styles.mainTab, ...(tab === 'vocabulary' ? styles.mainTabActive : {}) }}>Vocabulary</button>
            </div>

            {tab === 'library' ? (
                <>
                    {/* Stats */}
                    <div style={styles.statsRow}>
                        {[
                            { label: 'Total Books', value: stats.total },
                            { label: 'Pages Read', value: stats.pagesRead },
                            { label: 'Reading', value: stats.reading },
                            { label: 'Completed', value: stats.completed },
                        ].map((s, i) => (
                            <div key={i} style={styles.statChip}>
                                <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{s.value}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={styles.filterRow}>
                        {['all', 'reading', 'completed', 'unread'].map(f => (
                            <button key={f} onClick={() => setFilter(f)} style={{
                                ...styles.filterChip,
                                ...(filter === f ? styles.filterActive : {}),
                            }}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Book Grid */}
                    {books.length === 0 ? (
                        <div style={styles.emptyState}>
                            <BookOpen size={48} style={{ color: 'var(--text-faint)', marginBottom: 16 }} />
                            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Your library is empty</h2>
                            <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 20 }}>Upload your first PDF to get started</p>
                            <button onClick={() => setShowUpload(true)} style={styles.addBtn}>
                                <Plus size={16} /><span>Add Book</span>
                            </button>
                        </div>
                    ) : (
                        <div style={styles.bookGrid}>
                            {books.map(book => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    user={user}
                                    onOpen={() => navigate(`/reading/${book.id}`)}
                                    onEdit={() => setEditBook(book)}
                                    onDelete={() => handleDeleteBook(book)}
                                />
                            ))}
                        </div>
                    )}
                </>
            ) : (
                /* Vocabulary Tab */
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{vocabWords.length} words saved</span>
                    </div>
                    <div style={{ position: 'relative', marginBottom: 16 }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                        <input
                            style={{ ...styles.input, paddingLeft: 36 }}
                            placeholder="Search words..."
                            value={vocabSearch}
                            onChange={e => setVocabSearch(e.target.value)}
                        />
                    </div>
                    {filteredVocab.length === 0 ? (
                        <div style={styles.emptyState}>
                            <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>
                                {vocabSearch ? 'No matching words' : 'No words saved yet. Tap any word while reading to look it up and save it.'}
                            </p>
                        </div>
                    ) : (
                        <div style={styles.vocabGrid}>
                            {filteredVocab.map(w => (
                                <div key={w.id} style={styles.vocabCard}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{w.word}</span>
                                        <button onClick={() => handleDeleteWord(w.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-faint)' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {w.definition && <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.4 }}>{w.definition}</p>}
                                    {w.books?.title && <span style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, display: 'block' }}>From: {w.books.title}</span>}
                                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(w.created_at).toLocaleDateString()}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Upload Modal */}
            {showUpload && (
                <UploadModal
                    user={user}
                    onClose={() => setShowUpload(false)}
                    onSuccess={(book) => {
                        setBooks(prev => [book, ...prev])
                        setShowUpload(false)
                        loadData()
                    }}
                />
            )}

            {/* Edit Modal */}
            {editBook && (
                <EditModal
                    book={editBook}
                    onClose={() => setEditBook(null)}
                    onSave={async (updates) => {
                        try {
                            await updateBook(editBook.id, updates)
                            setBooks(prev => prev.map(b => b.id === editBook.id ? { ...b, ...updates } : b))
                            setEditBook(null)
                            toast.success('Book updated')
                        } catch (err) {
                            toast.error('Failed to update')
                        }
                    }}
                />
            )}
        </div>
    )
}

// ── Book Card Component ────────────────────────────────────────
function BookCard({ book, onOpen, onEdit, onDelete, user }) {
    const [showMenu, setShowMenu] = useState(false)
    const [retrying, setRetrying] = useState(false)
    const progress = Math.round((book.progress || 0) * 100)

    // Custom status colors mapping
    const statusLabel = {
        unread: 'Unread',
        reading: 'Reading',
        completed: 'Completed',
        processing: 'Processing...',
        error: 'Processing failed',
        partial: 'Partial (Reading)'
    }
    const statusColors = {
        unread: 'var(--text-faint)',
        reading: 'var(--accent-blue)',
        completed: 'var(--accent-green)',
        processing: 'var(--accent)',
        error: 'var(--accent-red)',
        partial: 'var(--accent-blue)'
    }

    const handleRetry = async (e) => {
        e.stopPropagation()
        setRetrying(true)
        try {
            // Optimistically update
            await supabase.from('books').update({ status: 'processing', processing_error: null }).eq('id', book.id)

            // Retry extraction
            fetch('/api/pdf-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookId: book.id,
                    userId: user?.uid,
                    filePath: book.file_path,
                })
            }).catch(console.error)

        } catch (err) {
            console.error('Could not restart extraction', err)
        } finally {
            setRetrying(false)
        }
    }

    return (
        <div style={styles.bookCard} onContextMenu={e => { e.preventDefault(); setShowMenu(!showMenu) }}>
            {/* Cover */}
            <div style={{ ...styles.bookCover, background: book.cover_color || '#6366f1', opacity: (book.status === 'processing' || book.status === 'error') ? 0.6 : 1, cursor: (book.status === 'processing' || book.status === 'error') ? 'default' : 'pointer' }} onClick={() => (book.status !== 'processing' && book.status !== 'error') && onOpen()}>
                {book.status === 'processing' ? (
                    <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                ) : (
                    <>
                        <span style={styles.coverTitle}>{book.title}</span>
                        {book.author && <span style={styles.coverAuthor}>{book.author}</span>}
                    </>
                )}
            </div>

            {/* Info */}
            <div style={styles.bookInfo}>
                <h3 style={styles.bookTitle}>{book.title}</h3>
                {book.author && <p style={styles.bookAuthor}>{book.author}</p>}

                {/* Progress */}
                {book.status === 'processing' ? (
                    <div style={{ marginTop: 16 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>
                            Extracting pages... {book.last_processed_page ? `(${book.last_processed_page})` : ''}
                        </span>
                    </div>
                ) : book.status === 'error' ? (
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 500 }} title={book.processing_error || 'Extraction failed'}>
                            Processing failed
                        </span>
                        <button onClick={handleRetry} disabled={retrying} style={{ background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>
                            {retrying ? '...' : 'Retry'}
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={styles.progressBar}>
                            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                            <span style={{ ...styles.badge, color: statusColors[book.status] || statusColors.unread }}>
                                {statusLabel[book.status] || statusLabel.unread}
                            </span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{progress}%</span>
                        </div>
                        {book.last_read && (
                            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, display: 'block' }}>
                                Last read {new Date(book.last_read).toLocaleDateString()}
                            </span>
                        )}
                    </>
                )}
            </div>

            {/* Context Menu */}
            {showMenu && (
                <div style={styles.contextMenu} onMouseLeave={() => setShowMenu(false)}>
                    <button style={styles.menuItem} onClick={() => { setShowMenu(false); onEdit() }}>Edit details</button>
                    <button style={{ ...styles.menuItem, color: 'var(--accent-red)' }} onClick={() => { setShowMenu(false); onDelete() }}>Delete book</button>
                </div>
            )}
        </div>
    )
}

// ── Upload Modal ───────────────────────────────────────────────
function UploadModal({ user, onClose, onSuccess }) {
    const [file, setFile] = useState(null)
    const [title, setTitle] = useState('')
    const [author, setAuthor] = useState('')
    const [coverColor, setCoverColor] = useState('#6366f1')
    const [goalDate, setGoalDate] = useState('')

    // Upload state: 'idle' | 'uploading' | 'extracting' | 'saving' | 'done' | 'error'
    const [uploadState, setUploadState] = useState('idle')
    const [uploadProgress, setUploadProgress] = useState(0)
    const [extractProgress, setExtractProgress] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [statusText, setStatusText] = useState('')
    const [errorText, setErrorText] = useState('')
    const fileRef = useRef(null)
    const dropRef = useRef(null)

    const handleFile = (f) => {
        if (!f || !f.name.endsWith('.pdf')) {
            setErrorText('Only PDF files are accepted')
            return
        }
        if (f.size > 100 * 1024 * 1024) {
            setErrorText('File too large. Maximum 100MB.')
            return
        }
        setFile(f)
        setErrorText('')
        if (!title) setTitle(f.name.replace('.pdf', ''))
    }

    const handleDrop = (e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }

    const handleUpload = async () => {
        if (!file || !title.trim()) return
        setErrorText('')

        try {
            // STEP 1: Extract text in the browser using pdfjs-dist
            setUploadState('extracting')
            setStatusText('Reading PDF...')

            const pdfjsLib = await import('pdfjs-dist')
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

            const arrayBuffer = await file.arrayBuffer()
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
            const numPages = pdf.numPages
            setTotalPages(numPages)
            setStatusText(`Extracting pages... 0 of ${numPages}`)

            const pages = []
            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i)
                const textContent = await page.getTextContent()
                const pageText = textContent.items.map(item => item.str).join(' ').trim()
                pages.push(pageText)
                setExtractProgress(i)
                setStatusText(`Extracting pages... ${i} of ${numPages}`)
            }

            const totalWords = pages.reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0)

            // STEP 2: Upload PDF file to Supabase Storage
            setUploadState('uploading')
            setUploadProgress(0)
            setStatusText('Uploading PDF...')

            const tempId = crypto.randomUUID()
            const filePath = `${user.uid}/${tempId}.pdf`

            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    const next = prev + (100 - prev) * 0.15
                    return next > 92 ? 92 : next
                })
            }, 400)

            const { error: uploadErr } = await supabase.storage
                .from('books')
                .upload(filePath, file, { upsert: true, cacheControl: '3600' })

            clearInterval(progressInterval)
            if (uploadErr) throw uploadErr
            setUploadProgress(100)

            // STEP 3: Create book record
            setUploadState('saving')
            setStatusText('Saving book...')

            const { data: book, error: createError } = await supabase
                .from('books')
                .insert([{
                    user_id: user.uid,
                    title: title.trim(),
                    author: author.trim() || null,
                    cover_color: coverColor,
                    reading_goal_date: goalDate || null,
                    status: 'processing',
                    file_path: filePath,
                    total_pages: numPages,
                    word_count: totalWords,
                }])
                .select()
                .single()

            if (createError) throw createError

            // STEP 4: Save all pages directly to Supabase in chunks of 100
            setStatusText('Saving pages to library...')

            const CHUNK_SIZE = 100
            const allPageRows = pages.map((content, idx) => ({
                book_id: book.id,
                page_number: idx + 1,
                content,
                word_count: content.split(/\s+/).filter(Boolean).length,
            }))

            for (let i = 0; i < allPageRows.length; i += CHUNK_SIZE) {
                const chunk = allPageRows.slice(i, i + CHUNK_SIZE)
                const { error: insertErr } = await supabase
                    .from('book_pages')
                    .upsert(chunk, { onConflict: 'book_id,page_number' })
                if (insertErr) throw insertErr
            }

            // STEP 5: Mark book as ready
            await supabase
                .from('books')
                .update({
                    status: 'ready',
                    last_processed_page: numPages,
                    processing_error: null,
                })
                .eq('id', book.id)

            setUploadState('done')
            setStatusText(`Done! ${numPages} pages extracted.`)
            toast.success('Book ready to read!')
            onSuccess({ ...book, status: 'ready', total_pages: numPages })

        } catch (err) {
            console.error('Upload error:', err)
            setErrorText('Upload failed — ' + (err.message || 'file may be corrupted'))
            setUploadState('error')
        }
    }

    return (
        <div style={styles.modalOverlay} onClick={() => uploadState !== 'uploading' && uploadState !== 'extracting' && uploadState !== 'saving' ? onClose() : null}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Add Book</h2>
                    {uploadState !== 'uploading' && uploadState !== 'saving' && (
                        <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
                    )}
                </div>

                {/* Drop Zone */}
                {uploadState === 'idle' || uploadState === 'error' ? (
                    <div
                        ref={dropRef}
                        style={styles.dropZone}
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                    >
                        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                        {file ? (
                            <div style={{ textAlign: 'center' }}>
                                <BookOpen size={24} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                                <p style={{ fontSize: 14, color: 'var(--text)' }}>{file.name}</p>
                                <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                                    {(file.size / 1024 / 1024).toFixed(1)} MB
                                </p>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <Upload size={24} style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
                                <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>Drop your PDF here or click to browse</p>
                                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Up to 100MB</p>
                            </div>
                        )}
                    </div>
                ) : (
                    // Upload Progress View
                    <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ marginBottom: 16 }}>
                            {uploadState === 'done' ? (
                                <BookOpen size={32} style={{ color: 'var(--accent-green)', margin: '0 auto' }} />
                            ) : (
                                <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                            )}
                        </div>
                        {uploadState === 'extracting' && totalPages > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                                    <div style={{ width: `${Math.round((extractProgress / totalPages) * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease' }} />
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{extractProgress} / {totalPages} pages</span>
                            </div>
                        )}
                        {uploadState === 'uploading' && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                                </div>
                            </div>
                        )}
                        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{statusText}</p>
                        {uploadState === 'done' && (
                            <button onClick={() => onClose()} style={{ ...styles.addBtn, marginTop: 24, margin: '24px auto 0' }}>
                                View in Library
                            </button>
                        )}
                    </div>
                )}
                                <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                                </div>
                            )}
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{statusText}</p>
                        {uploadState === 'processing' && (
                            <button onClick={() => onClose()} style={{ ...styles.addBtn, marginTop: 24, margin: '24px auto 0' }}>
                                View in Library
                            </button>
                        )}
                    </div>
                )}


                {/* Fields */}
                {(uploadState === 'idle' || uploadState === 'error') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                        <input style={styles.input} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
                        <input style={styles.input} placeholder="Author (optional)" value={author} onChange={e => setAuthor(e.target.value)} />

                        {/* Color Picker */}
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>Cover Color</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {COVER_COLORS.map(c => (
                                    <button key={c} onClick={() => setCoverColor(c)} style={{
                                        width: 28, height: 28, borderRadius: 6, background: c, border: coverColor === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer',
                                    }} />
                                ))}
                            </div>
                        </div>

                        <input type="date" style={styles.input} value={goalDate} onChange={e => setGoalDate(e.target.value)} placeholder="Reading goal date (optional)" />
                    </div>
                )}

                {errorText && <p style={{ fontSize: 13, color: 'var(--accent-red)', marginTop: 12 }}>{errorText}</p>}

                {(uploadState === 'idle' || uploadState === 'error') && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                        {file && uploadState === 'error' && (
                            <button onClick={() => { setFile(null); setErrorText('') }} style={{ ...styles.uploadBtn, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', flex: 1 }}>
                                Use a different file
                            </button>
                        )}
                        <button onClick={handleUpload} disabled={!file || !title.trim()} style={{
                            ...styles.uploadBtn,
                            flex: 2,
                            opacity: (!file || !title.trim()) ? 0.5 : 1,
                        }}>
                            {uploadState === 'error' ? 'Try Again' : 'Upload & Process'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Edit Modal ─────────────────────────────────────────────────
function EditModal({ book, onClose, onSave }) {
    const [title, setTitle] = useState(book.title)
    const [author, setAuthor] = useState(book.author || '')
    const [coverColor, setCoverColor] = useState(book.cover_color || '#6366f1')
    const [goalDate, setGoalDate] = useState(book.reading_goal_date || '')

    return (
        <div style={styles.modalOverlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Edit Book</h2>
                    <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input style={styles.input} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
                    <input style={styles.input} placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)} />
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'block' }}>Cover Color</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {COVER_COLORS.map(c => (
                                <button key={c} onClick={() => setCoverColor(c)} style={{
                                    width: 28, height: 28, borderRadius: 6, background: c, border: coverColor === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer',
                                }} />
                            ))}
                        </div>
                    </div>
                    <input type="date" style={styles.input} value={goalDate} onChange={e => setGoalDate(e.target.value)} />
                </div>

                <button onClick={() => onSave({ title: title.trim(), author: author.trim(), cover_color: coverColor, reading_goal_date: goalDate || null })} style={styles.uploadBtn}>
                    Save Changes
                </button>
            </div>
        </div>
    )
}

const styles = {
    page: { padding: '32px 40px', maxWidth: 960, animation: 'fadeUp 0.3s ease' },
    headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 24, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' },
    addBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    tabRow: { display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', width: 'fit-content' },
    mainTab: { padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: 'none', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', transition: 'all 0.15s ease' },
    mainTabActive: { background: 'var(--accent)', color: '#fff' },
    statsRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
    statChip: { display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, minWidth: 100 },
    filterRow: { display: 'flex', gap: 8, marginBottom: 24 },
    filterChip: { padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', transition: 'all 0.15s ease' },
    filterActive: { background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', borderColor: 'var(--accent)' },
    bookGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 },
    bookCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', transition: 'all 0.15s ease', position: 'relative', cursor: 'pointer' },
    bookCover: { height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' },
    coverTitle: { fontSize: 15, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.3)', lineHeight: 1.3 },
    coverAuthor: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
    bookInfo: { padding: '12px 14px' },
    bookTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    bookAuthor: { fontSize: 12, color: 'var(--text-dim)', marginTop: 2 },
    progressBar: { height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 10, overflow: 'hidden' },
    progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' },
    badge: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
    contextMenu: { position: 'absolute', top: 8, right: 8, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', zIndex: 10, boxShadow: 'var(--shadow)' },
    menuItem: { display: 'block', width: '100%', padding: '10px 16px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' },
    emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' },
    vocabGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
    vocabCard: { padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 },
    // Modal
    modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
    modal: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' },
    closeBtn: { background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 },
    dropZone: { border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 20px', cursor: 'pointer', transition: 'border-color 0.15s ease', textAlign: 'center' },
    input: { width: '100%', padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', outline: 'none' },
    uploadBtn: { width: '100%', padding: '12px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 20 },
}
