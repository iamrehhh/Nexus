import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getAllUsers } from '../lib/db'
import { ArrowLeft, Users, MessageSquare, Shield } from 'lucide-react'
import styles from './Admin.module.css'

export default function Admin() {
  const { user, userData } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userData && userData.role !== 'admin') navigate('/')
  }, [userData])

  useEffect(() => {
    getAllUsers().then(data => {
      setUsers(data)
      setLoading(false)
    })
  }, [])

  const totalUsers = users.length
  const adminCount = users.filter(u => u.role === 'admin').length

  return (
    <div className={styles.page}>
      <div className={styles.glow} />
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={18}/>
        </button>
        <div className={styles.headerTitle}>
          <Shield size={18} color="var(--accent)" />
          <span>Admin Dashboard</span>
        </div>
      </header>

      <div className={styles.content}>
        {/* Stats */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <Users size={24} color="var(--accent)" />
            <div className={styles.statNum}>{totalUsers}</div>
            <div className={styles.statLabel}>Total Users</div>
          </div>
          <div className={styles.statCard}>
            <Shield size={24} color="var(--accent2)" />
            <div className={styles.statNum}>{adminCount}</div>
            <div className={styles.statLabel}>Admins</div>
          </div>
          <div className={styles.statCard}>
            <MessageSquare size={24} color="var(--accent3)" />
            <div className={styles.statNum}>{totalUsers - adminCount}</div>
            <div className={styles.statLabel}>Regular Users</div>
          </div>
        </div>

        {/* Users table */}
        <div className={styles.tableSection}>
          <h2 className={styles.tableTitle}>All Users</h2>
          {loading ? (
            <div className={styles.loading}><span className={styles.spinner} /></div>
          ) : (
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span>User</span>
                <span>Email</span>
                <span>Role</span>
                <span>Joined</span>
              </div>
              {users.map(u => (
                <div key={u.id} className={styles.tableRow}>
                  <div className={styles.userCell}>
                    <img src={u.photo} className={styles.userAvatar} alt="" onError={e => e.target.style.display='none'} />
                    <span>{u.name || '—'}</span>
                  </div>
                  <span className={styles.email}>{u.email}</span>
                  <span className={`${styles.role} ${u.role === 'admin' ? styles.adminRole : ''}`}>{u.role || 'user'}</span>
                  <span className={styles.date}>
                    {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.note}>
          <Shield size={14} />
          To make someone an admin, manually update their <code>role</code> field to <code>"admin"</code> in Firebase Firestore console.
        </div>
      </div>
    </div>
  )
}
