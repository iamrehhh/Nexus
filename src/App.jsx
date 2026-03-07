import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import Login from './pages/Login'
import Home from './pages/Home'
import Chat from './pages/Chat'
import Create from './pages/Create'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import Playlist from './pages/Playlist'
import Diary from './pages/Diary'
import './styles/globals.css'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
  return user ? children : <Navigate to="/login" />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return null
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/chat/:personalityId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/create" element={<ProtectedRoute><Create /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/playlist/:personalityId" element={<ProtectedRoute><Playlist /></ProtectedRoute>} />
      <Route path="/diary/:personalityId" element={<ProtectedRoute><Diary /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-center" toastOptions={{
            style: { background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }
          }} />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
