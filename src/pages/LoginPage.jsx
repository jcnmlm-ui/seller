import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { STORE } from '../config/store'

const REMEMBER_KEY = 'booth_remember_login'

export default function LoginPage() {
  const { session, signIn, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 載入時讀取已記住的帳密
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) {
        const { email: savedEmail, password: savedPassword } = JSON.parse(saved)
        setEmail(savedEmail || '')
        setPassword(savedPassword || '')
        setRemember(true)
      }
    } catch {}
  }, [])

  if (loading) return null
  if (session) return <Navigate to="/admin" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error: err } = await signIn(email, password)
    if (err) {
      setError('帳號或密碼錯誤，請重試')
    } else {
      // 記住密碼：勾選則儲存，取消勾選則清除
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }))
      } else {
        localStorage.removeItem(REMEMBER_KEY)
      }
      navigate('/admin')
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl fade-up">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🛍️</div>
          <h1 className="font-black text-xl text-stone-900">{STORE.name}</h1>
          <p className="text-sm text-stone-400 mt-1">後台管理登入</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">電子郵件</label>
            <input
              type="email"
              className="input"
              placeholder="admin@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">密碼</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {/* 記住密碼 */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="w-4 h-4 rounded accent-red-500"
            />
            <span className="text-sm text-stone-600">記住帳號密碼</span>
          </label>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-200">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                登入中…
              </span>
            ) : '登入後台'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a href="#/" className="text-xs text-stone-400 hover:text-stone-600">
            ← 回到顧客預購頁
          </a>
        </div>
      </div>
    </div>
  )
}
