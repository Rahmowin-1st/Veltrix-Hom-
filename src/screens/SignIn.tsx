import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { VeltrixLogo } from '@/components/brand/VeltrixLogo'
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

type Mode = 'choose' | 'signin' | 'signup'

export default function SignIn() {
  const session = useAuthStore((s) => s.session)
  const [mode, setMode] = useState<Mode>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)

  if (session) return <Navigate to="/chat" replace />

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(translateAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px 20px calc(32px + var(--safe-bottom))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ width: '100%', maxWidth: 380, display: 'grid', gap: 22, justifyItems: 'center' }}
      >
        <VeltrixLogo size={76} />

        <div style={{ textAlign: 'center', display: 'grid', gap: 6 }}>
          <h1 style={{ fontSize: 'var(--fs-title-lg)', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Veltrix Hom
          </h1>
          <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-body-sm)' }}>
            Homework. Aniq. Source bilan.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="solid"
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 'var(--fs-body-sm)',
              borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)',
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}

        {sent && (
          <div
            role="status"
            className="solid"
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 'var(--fs-body-sm)',
              borderColor: 'color-mix(in srgb, var(--success) 45%, transparent)',
            }}
          >
            📧 Emailingizga tasdiqlash havolasi yuborildi. Havolani bosing va qaytib keling.
          </div>
        )}

        {mode === 'choose' && (
          <div style={{ width: '100%', display: 'grid', gap: 10 }}>
            <button
              className="grad-cta press"
              disabled={busy}
              onClick={() => void run(signInWithGoogle)}
              style={primaryBtn}
            >
              <GoogleMark />
              Google bilan davom etish
            </button>

            <button className="solid press" onClick={() => setMode('signin')} style={secondaryBtn}>
              Email orqali kirish
            </button>

            <button
              onClick={() => setMode('signup')}
              style={{ ...linkBtn, marginTop: 2 }}
            >
              Hisobingiz yo'qmi? <strong style={{ color: 'var(--cyan)' }}>Ro'yxatdan o'ting</strong>
            </button>
          </div>
        )}

        {mode !== 'choose' && (
          <div style={{ width: '100%', display: 'grid', gap: 10 }}>
            {mode === 'signup' && (
              <Field label="Ismingiz" value={name} onChange={setName} autoComplete="name" />
            )}
            <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
            <Field
              label="Parol"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />

            <button
              className="grad-cta press"
              disabled={busy || !email || password.length < 6}
              onClick={() =>
                void run(async () => {
                  if (mode === 'signup') {
                    await signUpWithEmail(email, password, name)
                    setSent(true)
                  } else {
                    await signInWithEmail(email, password)
                  }
                })
              }
              style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
            >
              {mode === 'signup' ? "Ro'yxatdan o'tish" : 'Kirish'}
            </button>

            <button onClick={() => { setMode('choose'); setError(null) }} style={linkBtn}>
              ← Orqaga
            </button>
          </div>
        )}

        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-citation)',
            color: 'var(--text-2)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          Davom etish orqali siz maxfiylik siyosatiga rozilik bildirasiz.
          Yuklagan kitoblaringizni faqat siz ko'rasiz.
        </p>
      </motion.div>
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
}) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)', fontWeight: 500 }}>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 46,
          padding: '0 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          fontSize: 'var(--fs-body)',
          fontFamily: 'var(--font)',
        }}
      />
    </label>
  )
}

function GoogleMark() {
  return (
    <svg width={17} height={17} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFF" d="M44.5 20H24v8.5h11.8C34.7 33.4 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 6 1.1 8.2 2.9l6.2-6.2C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" />
    </svg>
  )
}

const primaryBtn: React.CSSProperties = {
  height: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 9,
  borderRadius: 'var(--radius-pill)',
  fontSize: 'var(--fs-body-sm)',
  fontWeight: 600,
  fontFamily: 'var(--font)',
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  color: 'var(--text)',
  background: 'var(--surface)',
}

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  fontSize: 'var(--fs-body-sm)',
  fontFamily: 'var(--font)',
  cursor: 'pointer',
  padding: 8,
}

/** Supabase speaks English. Users don't. */
function translateAuthError(e: unknown): string {
  const raw = e instanceof Error ? e.message.toLowerCase() : ''
  if (raw.includes('invalid login')) return '❌ Email yoki parol noto\'g\'ri.'
  if (raw.includes('already registered')) return '⚠️ Bu email allaqachon ro\'yxatdan o\'tgan. Kiring.'
  if (raw.includes('password')) return '🔑 Parol kamida 6 ta belgidan iborat bo\'lsin.'
  if (raw.includes('email')) return '📧 Email manzil noto\'g\'ri kiritilgan.'
  if (raw.includes('network') || raw.includes('fetch')) return '📡 Internet aloqasi yo\'q. Qayta urinib ko\'ring.'
  return '⚠️ Kirishda xatolik yuz berdi. Birozdan keyin urinib ko\'ring.'
}
