import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ensureUser } from '../lib/db'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleUser(session?.user ?? null)
    })

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleUser(session?.user ?? null)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleUser = async (supabaseUser) => {
    if (supabaseUser) {
      try {
        const data = await ensureUser(supabaseUser)
        setUser({
          ...supabaseUser,
          uid: supabaseUser.id, // Map id to uid for backward compatibility
          displayName: supabaseUser.user_metadata?.full_name || supabaseUser.email,
          photoURL: supabaseUser.user_metadata?.avatar_url || ''
        })
        setUserData(data)
      } catch (err) {
        console.error("Error ensuring user:", err)
        setUser(null)
        setUserData(null)
      }
    } else {
      setUser(null)
      setUserData(null)
    }
    setLoading(false)
  }

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (error) {
      console.error("Error signing in:", error)
    }
  }

  const logOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserData(null)
  }

  return (
    <AuthContext.Provider value={{ user, userData, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
