import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { CommandBarProvider } from './hooks/useCommandBar'
import React, { Suspense, lazy } from 'react'

const Layout = lazy(() => import('./components/Layout'))
const CommandBar = lazy(() => import('./components/CommandBar'))
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Secretary = lazy(() => import('./pages/Secretary'))
const Reading = lazy(() => import('./pages/Reading'))
const Reader = lazy(() => import('./pages/Reader'))
const Health = lazy(() => import('./pages/Health'))
const Connect = lazy(() => import('./pages/Connect'))
const Vault = lazy(() => import('./pages/Vault'))
const Settings = lazy(() => import('./pages/Settings'))
import Onboarding from './components/Onboarding'
import './styles/globals.css'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" />
}

// Reader uses full screen, so no Layout wrapper
function ReaderRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
  return user ? children : <Navigate to="/login" />
}

function AppRoutes() {
  const { user, dbUser, loading } = useAuth()
  if (loading) return null

  // Check if onboarding is needed
  const needsOnboarding = user && dbUser && !dbUser.settings?.onboardingCompleted

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/secretary" element={<ProtectedRoute><Secretary /></ProtectedRoute>} />
        <Route path="/reading" element={<ProtectedRoute><Reading /></ProtectedRoute>} />
        <Route path="/reading/:bookId" element={<ReaderRoute><Reader /></ReaderRoute>} />
        <Route path="/health" element={<ProtectedRoute><Health /></ProtectedRoute>} />
        <Route path="/connect" element={<ProtectedRoute><Connect /></ProtectedRoute>} />
        <Route path="/vault" element={<ProtectedRoute><Vault /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>

      {needsOnboarding && (
        <Onboarding onComplete={() => window.location.reload()} />
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CommandBarProvider>
            <Suspense fallback={null}>
              <AppRoutes />
              <CommandBar />
            </Suspense>
            <Toaster position="top-center" toastOptions={{
              style: { background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: '14px' }
            }} />
          </CommandBarProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
