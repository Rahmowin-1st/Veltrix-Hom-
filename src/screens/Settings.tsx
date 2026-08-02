import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Sliders, Volume2, Languages, BookOpen, Palette, ShieldCheck, Search, Check, LogOut,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { signOut } from '@/lib/supabase'
import { sourceApi } from '@/lib/api'
import type { Subject, UserSettings } from '@/types'

type GroupId = 'account' | 'profile' | 'ai' | 'voice' | 'translate' | 'subjects' | 'appearance' | 'privacy'

const GROUPS: { id: GroupId; label: string; Icon: typeof User }[] = [
  { id: 'account', label: 'Hisob', Icon: User },
  { id: 'profile', label: 'Profil', Icon: User },
  { id: 'ai', label: 'AI javoblari', Icon: Sliders },
  { id: 'voice', label: 'Ovoz', Icon: Volume2 },
  { id: 'translate', label: 'Tarjima', Icon: Languages },
  { id: 'subjects', label: 'Fanlar', Icon: BookOpen },
  { id: 'appearance', label: "Ko'rinish", Icon: Palette },
  { id: 'privacy', label: 'Maxfiylik', Icon: ShieldCheck },
]

export default function Settings() {
  const [active, setActive] = useState<GroupId>('account')
  const [q, setQ] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [saved, setSaved] = useState(false)

  const profile = useAuthStore((s) => s.profile)
  const settings = useAuthStore((s) => s.settings)
  const patchSettings = useAuthStore((s) => s.patchSettings)
  const patchProfile = useAuthStore((s) => s.patchProfile)
  const navigate = useNavigate()

  useEffect(() => { sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {}) }, [])

  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1500) }
  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => {
    void patchSettings({ [k]: v } as Partial<UserSettings>); flash()
  }

  const visible = useMemo(() => {
    if (!q.trim()) return GROUPS
    const t = q.toLowerCase()
    return GROUPS.filter((g) => g.label.toLowerCase().includes(t))
  }, [q])

  if (!settings || !profile) {
    return <div style={{ padding: 24, display: 'grid', gap: 10 }}>
      {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 56 }} />)}
    </div>
  }

  return (
    <div className="settings-layout" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {/* nav */}
      <nav className="settings-nav hide-sb" aria-label="Sozlamalar bo'limlari">
        <div className="row surface-quiet" style={{ padding: '0 10px', height: 38, margin: '0 0 10px' }}>
          <Search size={15} style={{ color: 'var(--text-3)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish"
            aria-label="Sozlamalarni qidirish"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 'var(--fs-label)', fontFamily: 'var(--font)' }} />
        </div>
        {visible.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActive(id)} aria-current={active === id ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%',
              padding: '9px 11px', minHeight: 42, borderRadius: 'var(--r-sm)',
              background: active === id ? 'var(--bg-active)' : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              color: active === id ? 'var(--text)' : 'var(--text-2)',
              fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
              fontWeight: active === id ? 560 : 470,
            }}>
            <Icon size={17} />{label}
          </button>
        ))}
      </nav>

      {/* panel */}
      <div className="hide-sb" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--s-5)' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', display: 'grid', gap: 'var(--s-4)' }}>
          {saved && (
            <div role="status" className="chip chip-strong" style={{ justifySelf: 'start' }}>
              <Check size={13} /> Saqlandi
            </div>
          )}

          {active === 'account' && (
            <Card title="Hisob">
              <Row label="Ism" value={profile.full_name ?? '—'} />
              <Row label="Google" value="Ulangan" />
              <p className="micro" style={{ lineHeight: 1.6, margin: 0 }}>
                Chatlar, manbalar va sozlamalar hisobingizga saqlanadi — boshqa qurilmadan
                kirsangiz ham o'shalar ko'rinadi.
              </p>
              <button className="btn btn-outline" style={{ justifySelf: 'start', color: 'var(--danger)' }}
                onClick={async () => { await signOut(); navigate('/kirish', { replace: true }) }}>
                <LogOut size={15} /> Chiqish
              </button>
            </Card>
          )}

          {active === 'profile' && (
            <Card title="Profil">
              <Text label="Ismingiz" value={profile.preferred_name ?? profile.full_name ?? ''}
                onSave={(v) => { void patchProfile({ preferred_name: v }); flash() }} />
              <Select label="Sinf" value={String(profile.grade ?? '')}
                options={[['', '—'], ...Array.from({ length: 11 }, (_, i) => [String(i + 1), `${i + 1}-sinf`] as [string, string])]}
                onChange={(v) => { void patchProfile({ grade: v ? Number(v) : null }); flash() }} />
              <Select label="Maktab tili" value={profile.school_language}
                options={[['uz', "O'zbek"], ['ru', 'Rus'], ['kaa', 'Qoraqalpoq']]}
                onChange={(v) => { void patchProfile({ school_language: v }); flash() }} />
            </Card>
          )}

          {active === 'ai' && (
            <Card title="AI javoblari">
              <Segment label="Javob uzunligi" value={settings.answer_length}
                options={[['short', 'Faqat javob'], ['normal', 'Muvozanatli'], ['detailed', 'Batafsil']]}
                onChange={(v) => set('answer_length', v as UserSettings['answer_length'])} />
              <Toggle label="Ustoz rejimi" hint="Avval ishora beradi, keyin yechimni ko'rsatadi"
                value={settings.teacher_mode} onChange={(v) => set('teacher_mode', v)} />
              <Toggle label="Manbani avtomatik tanlash" hint="Kitob biriktirilmasa, mosini o'zi topadi"
                value={settings.auto_source} onChange={(v) => set('auto_source', v)} />
              <Toggle label="Iqtibos majburiy" hint="Har bir dalil uchun bet raqami"
                value={settings.citation_required} onChange={(v) => set('citation_required', v)} />
              <Toggle label="Yoshga moslash" value={settings.age_adapted}
                onChange={(v) => set('age_adapted', v)} />
            </Card>
          )}

          {active === 'voice' && <VoiceSettings settings={settings} set={set} />}

          {active === 'translate' && (
            <Card title="Tarjima">
              <Select label="Manba tili" value={settings.tr_source_lang}
                options={[['auto', 'Avto aniqlash'], ['uz', "O'zbek"], ['en', 'Ingliz'], ['ru', 'Rus']]}
                onChange={(v) => set('tr_source_lang', v)} />
              <Select label="Maqsad tili" value={settings.tr_target_lang}
                options={[['uz', "O'zbek"], ['en', 'Ingliz'], ['ru', 'Rus']]}
                onChange={(v) => set('tr_target_lang', v)} />
              <Toggle label="Asl matnni ko'rsatish" value={settings.tr_show_original}
                onChange={(v) => set('tr_show_original', v)} />
              <Toggle label="Oxirgi tanlovni eslab qolish" value={settings.tr_remember_last}
                onChange={(v) => set('tr_remember_last', v)} />
            </Card>
          )}

          {active === 'subjects' && (
            <Card title="Fanlar">
              <p className="micro" style={{ margin: 0, lineHeight: 1.6 }}>
                {subjects.length} ta fan mavjud. AI fanni o'zi aniqlaydi — bu ro'yxat
                loyihalar va manbalarni tartiblash uchun.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {subjects.map((s) => <span key={s.id} className="chip">{s.emoji} {s.name}</span>)}
              </div>
            </Card>
          )}

          {active === 'appearance' && (
            <Card title="Ko'rinish">
              <Segment label="Mavzu" value={settings.theme}
                options={[['system', 'Tizim'], ['light', 'Yorug\''], ['dark', 'Qorong\'i']]}
                onChange={(v) => set('theme', v as UserSettings['theme'])} />
              <Toggle label="Ixcham rejim" hint="Elementlar orasidagi masofa kamayadi"
                value={settings.compact_mode} onChange={(v) => set('compact_mode', v)} />
              <Toggle label="Animatsiyani kamaytirish" value={settings.reduced_motion}
                onChange={(v) => set('reduced_motion', v)} />
              <Slider label="Shrift o'lchami" value={settings.font_scale ?? 1}
                min={0.9} max={1.25} step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => {
                  document.documentElement.style.setProperty('--font-scale', String(v))
                  set('font_scale', v)
                }} />
            </Card>
          )}

          {active === 'privacy' && (
            <Card title="Ma'lumot va maxfiylik">
              <Row label="Chat tarixi" value="Hisobda saqlanadi" />
              <Row label="Yuklangan kitoblar" value="Faqat siz ko'rasiz" />
              <p className="micro" style={{ margin: 0, lineHeight: 1.6 }}>
                Har bir jadval satr darajasida himoyalangan (RLS) — boshqa foydalanuvchi
                sizning ma'lumotingizni o'qiy olmaydi.
              </p>
              <button className="btn btn-outline" style={{ justifySelf: 'start' }}
                onClick={() => {
                  localStorage.removeItem('veltrix:ui')
                  localStorage.removeItem('veltrix:seen')
                  flash()
                }}>
                Qurilma keshini tozalash
              </button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* -------- voice: only real device voices, never invented labels -------- */
function VoiceSettings({ settings, set }: {
  settings: UserSettings
  set: <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => void
}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const read = () => setVoices(window.speechSynthesis.getVoices())
    read()
    window.speechSynthesis.addEventListener('voiceschanged', read)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', read)
  }, [])

  if (!('speechSynthesis' in window)) {
    return <Card title="Ovoz">
      <p className="micro" style={{ margin: 0 }}>Bu qurilma ovozli o'qishni qo'llab-quvvatlamaydi.</p>
    </Card>
  }

  return (
    <Card title="Ovoz">
      <p className="micro" style={{ margin: 0, lineHeight: 1.6 }}>
        Ovozlar qurilmangizdan olinadi — boshqa telefonda ro'yxat boshqacha bo'lishi mumkin.
      </p>
      {voices.length === 0
        ? <p className="micro" style={{ margin: 0 }}>Ovoz topilmadi.</p>
        : <p className="micro" style={{ margin: 0 }}>{voices.length} ta ovoz mavjud.</p>}

      <Slider label="Tezlik" value={settings.voice_rate} min={0.6} max={1.6} step={0.1}
        format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set('voice_rate', v)} />
      <Toggle label="Javobni avtomatik o'qish" value={settings.auto_read}
        onChange={(v) => set('auto_read', v)} />

      <button className="btn btn-outline" style={{ justifySelf: 'start' }}
        disabled={voices.length === 0}
        onClick={() => {
          const u = new SpeechSynthesisUtterance('Salom! Men Veltrix Hom yordamchisiman.')
          u.rate = settings.voice_rate
          u.lang = 'uz-UZ'
          window.speechSynthesis.speak(u)
        }}>
        Ovozni sinash
      </button>
    </Card>
  )
}

/* ------------------------------ primitives ---------------------------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface" style={{ padding: 'var(--s-5)', display: 'grid', gap: 'var(--s-4)' }}>
      <h2 style={{ fontSize: 'var(--fs-section)' }}>{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>{label}</span>
      <span className="truncate" style={{ fontSize: 'var(--fs-sm)' }}>{value}</span>
    </div>
  )
}

function Toggle({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 14 }}>
      <span className="col" style={{ gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
        {hint && <span className="micro">{hint}</span>}
      </span>
      <button role="switch" aria-checked={value} aria-label={label}
        onClick={() => onChange(!value)}
        style={{
          width: 46, height: 27, flexShrink: 0, borderRadius: 99, cursor: 'pointer',
          border: '1px solid var(--border)', padding: 2,
          background: value ? 'var(--brand-600)' : 'var(--bg-hover)',
          transition: 'background var(--t-hover) var(--ease)',
        }}>
        <span style={{
          display: 'block', width: 21, height: 21, borderRadius: '50%', background: '#fff',
          transform: value ? 'translateX(19px)' : 'translateX(0)',
          transition: 'transform var(--t-hover) var(--ease)',
        }} />
      </button>
    </div>
  )
}

function Segment({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
      <div className="row" style={{ gap: 4, background: 'var(--bg-hover)', padding: 3, borderRadius: 'var(--r-md)' }}>
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
            style={{
              flex: 1, minHeight: 36, borderRadius: 'var(--r-xs)', cursor: 'pointer',
              border: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-label)',
              background: value === v ? 'var(--bg-elevated)' : 'transparent',
              color: value === v ? 'var(--text)' : 'var(--text-2)',
              fontWeight: value === v ? 560 : 470,
              boxShadow: value === v ? 'var(--shadow-sm)' : 'none',
            }}>{l}</button>
        ))}
      </div>
    </div>
  )
}

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          height: 42, padding: '0 12px', borderRadius: 'var(--r-md)',
          background: 'var(--bg-input)', border: '1px solid var(--border)',
          color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
        }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function Text({ label, value, onSave }: {
  label: string; value: string; onSave: (v: string) => void
}) {
  const [v, setV] = useState(value)
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        style={{
          height: 42, padding: '0 12px', borderRadius: 'var(--r-md)',
          background: 'var(--bg-input)', border: '1px solid var(--border)',
          color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
        }} />
    </label>
  )
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  format: (v: number) => string; onChange: (v: number) => void
}) {
  const [local, setLocal] = useState(value)
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
        <span className="micro">{format(local)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={local}
        aria-label={label}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={() => onChange(local)}
        onTouchEnd={() => onChange(local)}
        style={{ width: '100%', accentColor: 'var(--brand-600)' }} />
    </div>
  )
}
