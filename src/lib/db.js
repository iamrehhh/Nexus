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
