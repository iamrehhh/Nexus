import { supabase } from './supabase'

// ── Users ──────────────────────────────────────────────────────
export async function ensureUser(user) {
    const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

    if (checkError && checkError.code !== 'PGRST116') {
        console.error("Error checking user:", checkError)
        throw checkError
    }

    if (!existingUser) {
        const newUser = {
            id: user.id,
            name: user.user_metadata?.full_name || user.email,
            email: user.email,
            photo: user.user_metadata?.avatar_url || '',
            role: 'user',
            settings: {}
        }

        const { data: insertedUser, error } = await supabase
            .from('users')
            .insert([newUser])
            .select()
            .single()

        if (error) throw error
        return insertedUser
    }
    return existingUser
}

export async function updateUser(uid, data) {
    const { error } = await supabase
        .from('users')
        .update(data)
        .eq('id', uid)
    if (error) throw error
}

export async function getUserSettings(uid) {
    const { data, error } = await supabase
        .from('users')
        .select('settings')
        .eq('id', uid)
        .single()
    if (error) return {}
    return data?.settings || {}
}

export async function updateUserSettings(uid, settings) {
    const { data: current } = await supabase
        .from('users')
        .select('settings')
        .eq('id', uid)
        .single()

    const merged = { ...(current?.settings || {}), ...settings }
    const { error } = await supabase
        .from('users')
        .update({ settings: merged })
        .eq('id', uid)
    if (error) throw error
}

// ── Secretary Messages ─────────────────────────────────────────
export async function loadSecretaryMessages(uid, limit = 60) {
    const { data, error } = await supabase
        .from('secretary_messages')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(limit)
    if (error) throw error
    return (data || []).reverse()
}

export async function saveSecretaryMessage(uid, role, content) {
    const { error } = await supabase
        .from('secretary_messages')
        .insert([{ user_id: uid, role, content }])
    if (error) throw error
}

export async function clearSecretaryMessages(uid) {
    const { error } = await supabase
        .from('secretary_messages')
        .delete()
        .eq('user_id', uid)
    if (error) throw error
}

// ── Secretary Memory ───────────────────────────────────────────
export async function getMemoryCount(uid) {
    const { count, error } = await supabase
        .from('secretary_memory')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
    if (error) return 0
    return count || 0
}

export async function clearSecretaryMemory(uid) {
    const { error } = await supabase
        .from('secretary_memory')
        .delete()
        .eq('user_id', uid)
    if (error) throw error
}

// ── Tasks ──────────────────────────────────────────────────────
export async function loadTasks(uid, { todayOnly = false, pendingOnly = false } = {}) {
    let query = supabase
        .from('tasks')
        .select('*')
        .eq('user_id', uid)

    if (pendingOnly) {
        query = query.eq('completed', false)
    }

    if (todayOnly) {
        const today = new Date()
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
        query = query.or(`due_date.gte.${startOfDay},due_date.lt.${endOfDay},due_date.is.null`)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) throw error
    return data || []
}

export async function getTodayTaskCount(uid) {
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

    const { count, error } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('completed', false)
        .gte('due_date', startOfDay)
        .lt('due_date', endOfDay)
    if (error) return 0
    return count || 0
}

export async function getPendingTaskCount(uid) {
    const { count, error } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('completed', false)
    if (error) return 0
    return count || 0
}

export async function addTask(uid, { title, description, dueDate, priority = 'medium', tags = [] }) {
    const { data, error } = await supabase
        .from('tasks')
        .insert([{
            user_id: uid,
            title,
            description: description || null,
            due_date: dueDate || null,
            priority,
            tags,
            completed: false
        }])
        .select()
        .single()
    if (error) throw error
    return data
}

export async function completeTask(taskId) {
    const { error } = await supabase
        .from('tasks')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', taskId)
    if (error) throw error
}

export async function uncompleteTask(taskId) {
    const { error } = await supabase
        .from('tasks')
        .update({ completed: false, completed_at: null })
        .eq('id', taskId)
    if (error) throw error
}

export async function deleteTask(taskId) {
    const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)
    if (error) throw error
}

// ── Books ──────────────────────────────────────────────────────
export async function loadBooks(uid, { status } = {}) {
    let query = supabase
        .from('books')
        .select('*')
        .eq('user_id', uid)
        .order('last_read', { ascending: false, nullsFirst: false })

    if (status && status !== 'all') {
        query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
}

export async function getBook(bookId) {
    const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single()
    if (error) throw error
    return data
}

export async function createBook(uid, { title, author, coverColor, readingGoalDate }) {
    const { data, error } = await supabase
        .from('books')
        .insert([{
            user_id: uid,
            title,
            author: author || null,
            cover_color: coverColor || '#6366f1',
            reading_goal_date: readingGoalDate || null,
            status: 'unread',
        }])
        .select()
        .single()
    if (error) throw error
    return data
}

export async function updateBook(bookId, updates) {
    const { error } = await supabase
        .from('books')
        .update(updates)
        .eq('id', bookId)
    if (error) throw error
}

export async function deleteBook(bookId) {
    // Delete annotations, sessions, pages, then book
    await supabase.from('book_annotations').delete().eq('book_id', bookId)
    await supabase.from('reading_sessions').delete().eq('book_id', bookId)
    await supabase.from('book_pages').delete().eq('book_id', bookId)
    await supabase.from('vocabulary').delete().eq('book_id', bookId)
    const { error } = await supabase.from('books').delete().eq('id', bookId)
    if (error) throw error
}

export async function getBookStats(uid) {
    const { data: books } = await supabase.from('books').select('status, current_page').eq('user_id', uid)
    if (!books) return { total: 0, pagesRead: 0, reading: 0, completed: 0 }
    return {
        total: books.length,
        pagesRead: books.reduce((sum, b) => sum + (b.current_page || 0), 0),
        reading: books.filter(b => b.status === 'reading').length,
        completed: books.filter(b => b.status === 'completed').length,
    }
}

export async function getLastReadBook(uid) {
    const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', uid)
        .eq('status', 'reading')
        .order('last_read', { ascending: false, nullsFirst: false })
        .limit(1)
        .single()
    if (error) return null
    return data
}

// ── Book Pages ─────────────────────────────────────────────────
export async function getBookPage(bookId, pageNumber) {
    const { data, error } = await supabase
        .from('book_pages')
        .select('*')
        .eq('book_id', bookId)
        .eq('page_number', pageNumber)
        .single()
    if (error) return null
    return data
}

// ── Reading Sessions ───────────────────────────────────────────
export async function startReadingSession(uid, bookId) {
    const { data, error } = await supabase
        .from('reading_sessions')
        .insert([{ user_id: uid, book_id: bookId }])
        .select()
        .single()
    if (error) throw error
    return data
}

export async function endReadingSession(sessionId, pagesRead) {
    const { error } = await supabase
        .from('reading_sessions')
        .update({
            ended_at: new Date().toISOString(),
            pages_read: pagesRead,
            duration_minutes: 0, // calculated from timestamps
        })
        .eq('id', sessionId)
    if (error) throw error
}

// ── Annotations ────────────────────────────────────────────────
export async function loadAnnotations(uid, bookId, pageNumber) {
    let query = supabase
        .from('book_annotations')
        .select('*')
        .eq('user_id', uid)
        .eq('book_id', bookId)
        .order('created_at', { ascending: true })

    if (pageNumber !== undefined) {
        query = query.eq('page_number', pageNumber)
    }

    const { data, error } = await query
    if (error) return []
    return data || []
}

export async function saveAnnotation(uid, bookId, { pageNumber, selectedText, note, type, color }) {
    const { data, error } = await supabase
        .from('book_annotations')
        .insert([{
            user_id: uid,
            book_id: bookId,
            page_number: pageNumber,
            selected_text: selectedText,
            note: note || null,
            type: type || 'highlight',
            color: color || 'yellow',
        }])
        .select()
        .single()
    if (error) throw error
    return data
}

export async function deleteAnnotation(annotationId) {
    const { error } = await supabase.from('book_annotations').delete().eq('id', annotationId)
    if (error) throw error
}

// ── Vocabulary ─────────────────────────────────────────────────
export async function loadVocabulary(uid) {
    const { data, error } = await supabase
        .from('vocabulary')
        .select('*, books(title)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
    if (error) return []
    return data || []
}

export async function saveWord(uid, { bookId, word, definition, context }) {
    const { data, error } = await supabase
        .from('vocabulary')
        .insert([{
            user_id: uid,
            book_id: bookId || null,
            word,
            definition,
            context: context || null,
        }])
        .select()
        .single()
    if (error) throw error
    return data
}

export async function deleteWord(wordId) {
    const { error } = await supabase.from('vocabulary').delete().eq('id', wordId)
    if (error) throw error
}

export async function isWordSaved(uid, word) {
    const { data } = await supabase
        .from('vocabulary')
        .select('id')
        .eq('user_id', uid)
        .ilike('word', word)
        .limit(1)
    return data && data.length > 0
}

// ── Reading Books for Secretary Context ────────────────────────
export async function getCurrentlyReadingBooks(uid) {
    const { data, error } = await supabase
        .from('books')
        .select('title, author, progress, last_read')
        .eq('user_id', uid)
        .eq('status', 'reading')
        .order('last_read', { ascending: false, nullsFirst: false })
        .limit(3)
    if (error) return []
    return data || []
}

// -----------------------------------------------------
// HEALTH DASHBOARD HELPERS
// -----------------------------------------------------

export async function getHealthMetricsConfig(userId) {
    const { data, error } = await supabase
        .from('health_metrics_config')
        .select('*')
        .eq('user_id', userId)
        .single()

    // It's normal for this to be empty initially, handle in frontend
    if (error && error.code !== 'PGRST116') {
        throw error
    }
    return data
}

export async function saveHealthMetricsConfig(userId, metrics, schedule = 'weekly', day = 0) {
    const { data, error } = await supabase
        .from('health_metrics_config')
        .upsert({
            user_id: userId,
            metrics,
            checkin_schedule: schedule,
            checkin_day: day,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select()
        .single()

    if (error) throw error
    return data
}

export async function getHealthCheckins(userId, limit = 8) {
    const { data, error } = await supabase
        .from('health_checkins')
        .select('*')
        .eq('user_id', userId)
        .order('checkin_date', { ascending: false })
        .limit(limit)

    if (error) throw error
    return data
}

export async function saveHealthCheckin(userId, dateStr, checkinData, notes, mood) {
    const { data, error } = await supabase
        .from('health_checkins')
        .upsert({
            user_id: userId,
            checkin_date: dateStr,
            data: checkinData,
            notes,
            mood_summary: mood,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,checkin_date' })
        .select()
        .single()

    if (error) throw error
    return data
}

export async function deleteHealthCheckin(id) {
    const { error } = await supabase
        .from('health_checkins')
        .delete()
        .eq('id', id)

    if (error) throw error
    return true
}

export async function getLatestHealthInsight(userId) {
    const { data, error } = await supabase
        .from('health_insights')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
}

// -----------------------------------------------------
// VAULT HELPERS
// -----------------------------------------------------

export async function loadVaultFolders(userId) {
    const { data: folders, error: fError } = await supabase
        .from('vault_folders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

    if (fError) throw fError

    const { data: notes, error: nError } = await supabase
        .from('vault_notes')
        .select('folder, is_archived, is_pinned')
        .eq('user_id', userId)

    if (nError) throw nError

    const counts = {}
    let allCount = 0
    let pinnedCount = 0
    let archivedCount = 0

    notes.forEach(n => {
        if (n.is_archived) {
            archivedCount++
        } else {
            allCount++
            counts[n.folder] = (counts[n.folder] || 0) + 1
            if (n.is_pinned) pinnedCount++
        }
    })

    const updatedFolders = (folders || []).map(f => ({
        ...f,
        note_count: counts[f.name] || 0
    }))

    return { folders: updatedFolders, allCount, pinnedCount, archivedCount, notes }
}

export async function createVaultFolder(userId, name, icon = 'folder', color = '#6366f1') {
    const { data, error } = await supabase
        .from('vault_folders')
        .insert([{ user_id: userId, name, icon, color }])
        .select()
        .single()
    if (error) throw error
    return data
}

export async function updateVaultFolder(folderId, updates) {
    const { data, error } = await supabase
        .from('vault_folders')
        .update(updates)
        .eq('id', folderId)
        .select()
        .single()
    if (error) throw error
    return data
}

export async function deleteVaultFolder(userId, folderId, folderName, deleteNotes) {
    if (!deleteNotes) {
        await supabase
            .from('vault_notes')
            .update({ folder: 'General' })
            .eq('user_id', userId)
            .eq('folder', folderName)
    } else {
        await supabase
            .from('vault_notes')
            .delete()
            .eq('user_id', userId)
            .eq('folder', folderName)
    }
    const { error } = await supabase.from('vault_folders').delete().eq('id', folderId)
    if (error) throw error
}

export async function loadVaultNotes(userId, query = {}) {
    let q = supabase
        .from('vault_notes')
        .select('*')
        .eq('user_id', userId)

    if (query.folder && query.folder !== 'All Notes' && query.folder !== 'Pinned' && query.folder !== 'Archived') {
        q = q.eq('folder', query.folder)
    }

    if (query.folder === 'Archived') {
        q = q.eq('is_archived', true)
    } else {
        q = q.eq('is_archived', false)
    }

    if (query.folder === 'Pinned') {
        q = q.eq('is_pinned', true)
    }

    q = q.order('is_pinned', { ascending: false }).order('updated_at', { ascending: false })

    const { data, error } = await q
    if (error) throw error
    return data
}

export async function saveVaultNote(userId, noteData) {
    const { id, ...updates } = noteData

    // Create preview
    let preview = updates.content ? updates.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
    updates.content_preview = preview.substring(0, 200)

    if (id) {
        const { data, error } = await supabase
            .from('vault_notes')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data
    } else {
        const { data, error } = await supabase
            .from('vault_notes')
            .insert([{ ...updates, user_id: userId }])
            .select()
            .single()
        if (error) throw error
        return data
    }
}

export async function deleteVaultNote(noteId) {
    const { error } = await supabase.from('vault_notes').delete().eq('id', noteId)
    if (error) throw error
}
