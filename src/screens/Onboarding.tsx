import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { VeltrixLogo } from '@/components/brand/VeltrixLogo'
import { useAuthStore } from '@/store/authStore'
import { tap } from '@/lib/native'

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const LANGS = [
  { code: 'uz', label: "O'zbek" },
  { code: 'ru', label: 'Rus' },
  { code: 'kaa', label: 'Qoraqalpoq' },
]
const LEARNING = [
  { code: 'en', label: '🇬🇧 Ingliz' },
  { code: 'ru', label: '🇷🇺 Rus' },
  { code: 'de', label: '🇩🇪 Nemis' },
  { code: 'ar', label: '🇸🇦 Arab' },
]

/** Three steps, each under 15 seconds. No long carousel. */
export default function Onboarding() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const patchProfile = useAuthStore((s) => s.patchProfile)

  const [grade, setGrade] = useState<number | null>(profile?.grade ?? null)
  const [schoolLang, setSchoolLang] = useState('uz')
  const [learnLang, setLearnLang] = useState('en')
  const [saving, setSaving] = useState(false)

  const finish = async () => {
    if (!grade) return
    setSaving(true)
    void tap('medium')
    await patchProfile({
      grade,
      school_language: schoolLang,
      learning_language: learnLang,
      onboarding_done: true,
    })
    navigate('/chat', { replace: true })
  }

  return (
    <div style={{
      minHeight: '100dvh', padding: '32px 20px calc(32px + var(--safe-bottom))',
      display: 'grid', alignContent: 'start', gap: 26, maxWidth: 460, margin: '0 auto',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{ display: 'grid', justifyItems: 'center', gap: 10, paddingTop: 12 }}
      >
        <VeltrixLogo size={54} />
        <h1 style={{ fontSize: 'var(--fs-title)', fontWeight: 650, margin: 0, textAlign: 'center' }}>
          Salom{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋
        </h1>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 'var(--fs-body-sm)', textAlign: 'center' }}>
          Javoblarni sizga moslashtirishim uchun 3 ta savol.
        </p>
      </motion.div>

      <Group title="Nechanchi sinfdasiz?" hint="Javoblar shu darajaga moslashadi.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {GRADES.map((g) => (
            <Chip key={g} active={grade === g} onClick={() => { setGrade(g); void tap() }}>
              {g}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title="Maktab tili">
        <Row>
          {LANGS.map((l) => (
            <Chip key={l.code} active={schoolLang === l.code} onClick={() => setSchoolLang(l.code)} wide>
              {l.label}
            </Chip>
          ))}
        </Row>
      </Group>

      <Group title="Qaysi tilni o'rganyapsiz?">
        <Row>
          {LEARNING.map((l) => (
            <Chip key={l.code} active={learnLang === l.code} onClick={() => setLearnLang(l.code)} wide>
              {l.label}
            </Chip>
          ))}
        </Row>
      </Group>

      <button
        className="grad-cta press"
        disabled={!grade || saving}
        onClick={() => void finish()}
        style={{
          height: 52, borderRadius: 'var(--radius-pill)', fontSize: 'var(--fs-body-sm)',
          fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
          opacity: !grade || saving ? 0.45 : 1, marginTop: 4,
        }}
      >
        {saving ? 'Saqlanmoqda…' : 'Boshlash'}
      </button>

      <p style={{
        margin: 0, textAlign: 'center', fontSize: 'var(--fs-citation)', color: 'var(--text-2)',
      }}>
        Bularni keyin Sozlamalardan o'zgartirishingiz mumkin.
      </p>
    </div>
  )
}

function Group({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode
}) {
  return (
    <section style={{ display: 'grid', gap: 9 }}>
      <div>
        <strong style={{ fontSize: 'var(--fs-card)', fontWeight: 600 }}>{title}</strong>
        {hint && (
          <span style={{ display: 'block', fontSize: 'var(--fs-label)', color: 'var(--text-2)', marginTop: 2 }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
}

function Chip({ active, onClick, children, wide }: {
  active: boolean; onClick: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`press ${active ? 'pill-active' : ''}`}
      style={{
        height: 44, minWidth: wide ? 96 : undefined, paddingInline: wide ? 16 : 0,
        borderRadius: wide ? 'var(--radius-pill)' : 'var(--radius-sm)',
        border: `1px solid ${active ? 'color-mix(in srgb, var(--violet) 55%, transparent)' : 'var(--border)'}`,
        background: active ? 'color-mix(in srgb, var(--violet) 16%, var(--surface))' : 'var(--surface)',
        color: active ? 'var(--text)' : 'var(--text-2)',
        fontSize: 'var(--fs-body-sm)', fontWeight: active ? 600 : 500,
        fontFamily: 'var(--font)', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
