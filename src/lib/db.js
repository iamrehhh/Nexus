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
      activePersonalityId: 'elena',
      theme: 'dark'
    }

    // Using simple keys as we'll map them from frontend if needed, 
    // but assuming Postgres case-insensitivity mapping
    // If the database has "activePersonalityId" we must write it like that if using double quotes in SQL
    // It's safer to pass exactly what the payload expects
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

export async function updateUserSettings(uid, data) {
  const { error } = await supabase
    .from('users')
    .update(data)
    .eq('id', uid)
  if (error) throw error
}

export async function getAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
  if (error) throw error
  return data || []
}

// ── Chat History ───────────────────────────────────────────────
export async function saveMessage(uid, personalityId, role, content, imageUrl = null) {
  const { error } = await supabase
    .from('messages')
    .insert([{
      uid,
      personalityId,
      role,
      content,
      imageUrl
    }])
  if (error) throw error
}

export async function loadMessages(uid, personalityId, limitCount = 80) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('uid', uid)
    .eq('personalityId', personalityId)
    .order('timestamp', { ascending: true })
    .limit(limitCount)
  if (error) throw error
  return data || []
}

export async function clearMessages(uid, personalityId) {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('uid', uid)
    .eq('personalityId', personalityId)
  if (error) throw error
}

// ── Custom Personalities ───────────────────────────────────────
export async function saveCustomPersonality(uid, personality) {
  const id = personality.id || Date.now().toString()
  const { error } = await supabase
    .from('personalities')
    .upsert([{ ...personality, id, uid }])
  if (error) throw error
  return id
}

export async function loadCustomPersonalities(uid) {
  const { data, error } = await supabase
    .from('personalities')
    .select('*')
    .eq('uid', uid)
  if (error) throw error
  return data || []
}

export async function deleteCustomPersonality(uid, id) {
  const { error } = await supabase
    .from('personalities')
    .delete()
    .eq('id', id)
    .eq('uid', uid)
  if (error) throw error
}

// ── Admin ──────────────────────────────────────────────────────
export async function isAdmin(uid) {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', uid)
    .single()
  if (error) return false
  return data?.role === 'admin'
}

export async function getUsageStats() {
  const users = await getAllUsers()

  // Get all messages to count per user
  const { data: messages, error } = await supabase
    .from('messages')
    .select('uid')

  if (error) throw error

  const stats = users.map(user => {
    const chatCount = messages.filter(m => m.uid === user.id).length
    return { ...user, chatCount }
  })

  return stats
}

// ── Memory ─────────────────────────────────────────────────────
export async function loadMemory(uid, personalityId) {
  const { data, error } = await supabase
    .from('user_memory')
    .select('*')
    .eq('uid', uid)
    .eq('personalityId', personalityId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function saveMemory(uid, personalityId, facts, lastExtractedAt) {
  const { error } = await supabase
    .from('user_memory')
    .upsert([{ uid, personalityId, facts, lastExtractedAt, updatedAt: new Date().toISOString() }],
      { onConflict: 'uid,personalityId' })
  if (error) throw error
}

// ── User Profile ───────────────────────────────────────────────
export async function loadProfile(uid, personalityId) {
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('uid', uid)
    .eq('personalityId', personalityId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function saveProfile(uid, personalityId, profile, lastAnalyzedAt) {
  const { error } = await supabase
    .from('user_profile')
    .upsert([{ uid, personalityId, profile, lastAnalyzedAt, updatedAt: new Date().toISOString() }],
      { onConflict: 'uid,personalityId' })
  if (error) throw error
}

// ── Engagement State ───────────────────────────────────────────
export async function loadEngagement(uid, personalityId) {
  const { data, error } = await supabase
    .from('engagement_state')
    .select('*')
    .eq('uid', uid)
    .eq('personalityId', personalityId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function saveEngagement(uid, personalityId, state) {
  const { error } = await supabase
    .from('engagement_state')
    .upsert([{ uid, personalityId, ...state, updatedAt: new Date().toISOString() }],
      { onConflict: 'uid,personalityId' })
  if (error) throw error
}

// ── Message Reactions ──────────────────────────────────────────
export async function addReaction(messageId, userId, emoji) {
  const { error } = await supabase
    .from('message_reactions')
    .insert([{ message_id: messageId, user_id: userId, emoji }])
  if (error) throw error
}

export async function removeReaction(messageId, userId, emoji) {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
  if (error) throw error
}

export async function loadReactions(messageIds) {
  if (!messageIds.length) return {}
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .in('message_id', messageIds)
  if (error) return {}
  // Group by message_id
  const grouped = {}
  for (const r of (data || [])) {
    if (!grouped[r.message_id]) grouped[r.message_id] = []
    grouped[r.message_id].push(r)
  }
  return grouped
}

// ── Active Game ────────────────────────────────────────────────
export async function loadActiveGame(uid, personalityId) {
  const { data, error } = await supabase
    .from('active_game')
    .select('*')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .single()
  if (error && error.code !== 'PGRST116') return null
  return data || null
}

export async function saveActiveGame(uid, personalityId, gameName) {
  const { error } = await supabase
    .from('active_game')
    .upsert([{ user_id: uid, personality_id: personalityId, game_name: gameName, started_at: new Date().toISOString() }],
      { onConflict: 'user_id,personality_id' })
  if (error) throw error
}

export async function clearActiveGame(uid, personalityId) {
  const { error } = await supabase
    .from('active_game')
    .delete()
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
  if (error) throw error
}

// ── Milestones ─────────────────────────────────────────────────
export async function loadMilestones(uid, personalityId) {
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .order('unlocked_at', { ascending: true })
  if (error) return []
  return data || []
}

export async function saveMilestone(uid, personalityId, levelReached) {
  const { error } = await supabase
    .from('milestones')
    .insert([{ user_id: uid, personality_id: personalityId, level_reached: levelReached }])
  if (error) throw error
}

// ── Conflict State ─────────────────────────────────────────────
export async function loadConflictState(uid, personalityId) {
  const { data, error } = await supabase
    .from('conflict_state')
    .select('*')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .single()
  if (error && error.code !== 'PGRST116') return null
  return data || null
}

export async function saveConflictState(uid, personalityId, stage) {
  const { error } = await supabase
    .from('conflict_state')
    .upsert([{ user_id: uid, personality_id: personalityId, stage, started_at: new Date().toISOString() }],
      { onConflict: 'user_id,personality_id' })
  if (error) throw error
}

export async function clearConflictState(uid, personalityId) {
  const { error } = await supabase
    .from('conflict_state')
    .delete()
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
  if (error) throw error
}

// ── Playlist ───────────────────────────────────────────────────
export async function loadPlaylist(uid, personalityId) {
  const { data, error } = await supabase
    .from('playlist')
    .select('*')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .order('added_at', { ascending: false })
  if (error) return []
  return data || []
}

export async function addToPlaylist(uid, personalityId, songName, herMessage) {
  const { error } = await supabase
    .from('playlist')
    .insert([{ user_id: uid, personality_id: personalityId, song_name: songName, her_message: herMessage }])
  if (error) throw error
}

export async function removeFromPlaylist(id) {
  const { error } = await supabase
    .from('playlist')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Diary Entries ──────────────────────────────────────────────
export async function loadDiaryEntries(uid, personalityId) {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .order('created_at', { ascending: false })
  if (error) return []
  return data || []
}

export async function saveDiaryEntry(uid, personalityId, entryText) {
  const { error } = await supabase
    .from('diary_entries')
    .insert([{ user_id: uid, personality_id: personalityId, entry_text: entryText }])
  if (error) throw error
}

export async function getLatestDiaryEntry(uid, personalityId) {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('created_at')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') return null
  return data || null
}

// ── User Settings (per personality) ────────────────────────────
export async function loadUserSettings(uid, personalityId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .single()
  if (error && error.code !== 'PGRST116') return null
  return data || null
}

export async function saveUserSettings(uid, personalityId, settings) {
  const { error } = await supabase
    .from('user_settings')
    .upsert([{ user_id: uid, personality_id: personalityId, ...settings, updated_at: new Date().toISOString() }],
      { onConflict: 'user_id,personality_id' })
  if (error) throw error
}

// ── Avatar Upload (Supabase Storage) ───────────────────────────
export async function uploadAvatar(uid, personalityId, file) {
  const path = `${uid}/${personalityId}`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function getAvatarUrl(uid, personalityId) {
  const path = `${uid}/${personalityId}`
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  // Check if file exists by trying to fetch
  try {
    const res = await fetch(data.publicUrl, { method: 'HEAD' })
    return res.ok ? data.publicUrl + '?t=' + Date.now() : null
  } catch {
    return null
  }
}

// ── User Fields (birthday, first_conversation_date) ────────────
export async function setFirstConversationDate(uid) {
  const { data } = await supabase
    .from('users')
    .select('first_conversation_date')
    .eq('id', uid)
    .single()
  if (data?.first_conversation_date) return // Already set
  await supabase
    .from('users')
    .update({ first_conversation_date: new Date().toISOString().split('T')[0] })
    .eq('id', uid)
}

export async function getFirstConversationDate(uid) {
  const { data } = await supabase
    .from('users')
    .select('first_conversation_date')
    .eq('id', uid)
    .single()
  return data?.first_conversation_date || null
}

export async function setBirthday(uid, birthday) {
  const { error } = await supabase
    .from('users')
    .update({ birthday })
    .eq('id', uid)
  if (error) throw error
}

export async function getBirthday(uid) {
  const { data } = await supabase
    .from('users')
    .select('birthday')
    .eq('id', uid)
    .single()
  return data?.birthday || null
}

// ── Communication Profile (adaptive tuning) ────────────────────
export async function loadCommunicationProfile(uid, personalityId) {
  const { data, error } = await supabase
    .from('user_communication_profile')
    .select('*')
    .eq('user_id', uid)
    .eq('personality_id', personalityId)
    .single()
  if (error && error.code !== 'PGRST116') return null
  return data || null
}

export async function saveCommunicationProfile(uid, personalityId, profile, lastAnalyzedAt) {
  const { error } = await supabase
    .from('user_communication_profile')
    .upsert([{
      user_id: uid,
      personality_id: personalityId,
      humor_style: profile.humor_style || null,
      engaging_topics: profile.engaging_topics || null,
      communication_style: profile.communication_style || null,
      emotional_tone: profile.emotional_tone || null,
      needs: profile.needs || null,
      responsiveness: profile.responsiveness || null,
      last_analyzed_at: lastAnalyzedAt,
      updated_at: new Date().toISOString()
    }], { onConflict: 'user_id,personality_id' })
  if (error) throw error
}
