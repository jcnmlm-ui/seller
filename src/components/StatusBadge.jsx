import { useState } from 'react'
import { STATUS_CONFIG } from '../config/store'

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-stone-100', text: 'text-stone-600' }
  return (
    <span className={`badge ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

let _setToasts = null
let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  _setToasts = setToasts

  return (
    <>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`toast-enter pointer-events-auto shadow-lg rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 max-w-xs
            ${t.type === 'error' ? 'bg-red-500 text-white' : t.type === 'success' ? 'bg-green-500 text-white' : 'bg-stone-800 text-white'}`}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'} {t.msg}
          </div>
        ))}
      </div>
    </>
  )
}

export function toast(msg, type = 'info', duration = 3000) {
  if (!_setToasts) return
  const id = ++_id
  _setToasts(prev => [...prev, { id, msg, type }])
  setTimeout(() => _setToasts(prev => prev.filter(t => t.id !== id)), duration)
}
