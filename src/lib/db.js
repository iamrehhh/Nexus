import { db } from './firebase'
import {
  collection, doc, getDoc, setDoc, addDoc, updateDoc,
  query, orderBy, limit, getDocs, serverTimestamp,
  deleteDoc, where
} from 'firebase/firestore'

// ── Users ──────────────────────────────────────────────────────
export async function ensureUser(user) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      name: user.displayName,
      email: user.email,
      photo: user.photoURL,
      role: 'user',
      createdAt: serverTimestamp(),
      activePersonalityId: 'elena',
      theme: 'dark'
    })
  }
  return (await getDoc(ref)).data()
}

export async function updateUserSettings(uid, data) {
  await updateDoc(doc(db, 'users', uid), data)
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Chat History ───────────────────────────────────────────────
export async function saveMessage(uid, personalityId, role, content, imageUrl = null) {
  const colRef = collection(db, 'users', uid, 'chats', personalityId, 'messages')
  await addDoc(colRef, {
    role, content, imageUrl,
    timestamp: serverTimestamp()
  })
}

export async function loadMessages(uid, personalityId, limitCount = 80) {
  const colRef = collection(db, 'users', uid, 'chats', personalityId, 'messages')
  const q = query(colRef, orderBy('timestamp', 'asc'), limit(limitCount))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function clearMessages(uid, personalityId) {
  const colRef = collection(db, 'users', uid, 'chats', personalityId, 'messages')
  const snap = await getDocs(colRef)
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
}

// ── Custom Personalities ───────────────────────────────────────
export async function saveCustomPersonality(uid, personality) {
  const ref = doc(db, 'users', uid, 'personalities', personality.id || Date.now().toString())
  await setDoc(ref, { ...personality, createdAt: serverTimestamp() })
  return ref.id
}

export async function loadCustomPersonalities(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'personalities'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function deleteCustomPersonality(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'personalities', id))
}

// ── Admin ──────────────────────────────────────────────────────
export async function isAdmin(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() && snap.data().role === 'admin'
}

export async function getUsageStats() {
  const users = await getAllUsers()
  const stats = []
  for (const user of users) {
    const chats = await getDocs(collection(db, 'users', user.uid || user.id, 'chats'))
    stats.push({ ...user, chatCount: chats.size })
  }
  return stats
}
