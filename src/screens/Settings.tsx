import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Sliders, Volume2, Languages, BookOpen, Palette, ShieldCheck,
  Library, Sparkles, ChevronRight, ArrowLeft, LogOut, Check, Play, Square,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { signOut } from '@/lib/supabase'
import { sourceApi, translateApi, type Language } from '@/lib/api'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { speechSupported, voicesFor, speak, cancelSpeech } from '@/lib/speech'
import { clearCache } from '@/lib/cache'
import type { Subject, UserSettings } from '@/types'

type GroupId =
  | 'account' | 'profile' | 'ai' | 'voice' | 'translate'
  | 'subjects' | 'sources' | 'skills' | 'appearance' | 'privacy'

const GROUPS: { id: GroupId; label: string; hint: string; Icon: typeof User }[] = [
  { id: 'account',    label: 'Hisob',       hint: 'Hisobingiz va kirish',      Icon: User },
  { id: 'profile',    label: 'Profil',      hint: "Ism, sinf, ta'lim tili",    Icon: User },
  { id: 'ai',         label: 'AI javoblari', hint: 'Javob uslubi va uzunligi', Icon: Sliders },
  { id: 'voice',      label: 'Ovoz',        hint: 'Ovoz tili va tezlik',       Icon: Volume2 },
  { id: 'translate',  label: 'Tarjima',     hint: 'Til va tarjima sozlamalari', Icon: Languages },
  { id: 'subjects',   label: 'Fanlar',      hint: 'Fanlar katalogi',           Icon: BookOpen },
  { id: 'sources',    label: 'Manbalar',    hint: 'Yuklangan kitoblar',        Icon: Library },
  { id: 'skills',     label: 'Skills',      hint: "Qo'shimcha ko'nikmalar",    Icon: Sparkles },
  { id: 'appearance', label: "Ko'rinish",   hint: 'Mavzu va interfeys',        Icon: Palette },
  { id: 'privacy',    label: 'Maxfiylik',   hint: 'Maxfiylik va xavfsizlik',   Icon: ShieldCheck },
]

/**
 * Mobile is a root list that pushes full-screen subpages — never a
 * split pane. Desktop keeps a persistent rail beside the panel.
 */
export default function Settings() {
  const isMobile = useIsMobile()
  const [active, setActive] = useState<GroupId | null>(null)
  const setNavHidden = useUIStore((s) => s.setNavHidden)

  const profile = useAuthStore((s) => s.profile)
  const settings = useAuthStore((s) => s.settings)

  // Bottom navigation must not float over a subpage.
  useEffect(() => {
    setNavHidden(Boolean(isMobile && active))
    return () => setNavHidden(false)
  }, [isMobile, active, setNavHidden])

  useEffect(() => { if (!isMobile && !active) setActive('account') }, [isMobile, active])

  if (!settings || !profile) {
    return (
      <div style={{ padding: 'var(--s-5)', display: 'grid', gap: 10 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 62 }} />)}
      </div>
    )
  }

  /* ------------------------- mobile ------------------------- */
  if (isMobile) {
    return (
      <div data-scroll-root className="hide-sb" style={{ flex: 1, overflowY: 'auto' }}>
        <AnimatePresence mode="wait" initial={false}>
          {active ? (
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 22 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 22 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="row" style={{
                position: 'sticky', top: 0, zIndex: 5, gap: 4,
                height: 'var(--header-h)', paddingInline: 6,
                background: 'var(--bg)', borderBottom: '1px solid var(--border)',
              }}>
                <button className="btn btn-ghost btn-icon" onClick={() => setActive(null)} aria-label="Orqaga">
                  <ArrowLeft size={21} />
                </button>
                <strong style={{ fontSize: 'var(--fs-lead)', fontWeight: 640 }}>
                  {GROUPS.find((g) => g.id === active)?.label}
                </strong>
              </div>
              <div style={{ padding: 'var(--s-4)', paddingBottom: 'calc(var(--safe-bottom) + var(--s-8))' }}>
                <Panel group={active} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="root"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-4)',
                paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--s-8))',
              }}
            >
              <h1 style={{ fontSize: 'var(--fs-title)' }}>Sozlamalar</h1>
              <div className="surface" style={{ padding: 5, display: 'grid', gap: 2 }}>
                {GROUPS.map(({ id, label, hint, Icon }) => (
                  <button key={id} onClick={() => setActive(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 11px', minHeight: 58, borderRadius: 'var(--r-md)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left', color: 'var(--text)', fontFamily: 'var(--font)',
                    }}>
                    <span style={{
                      width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center',
                      borderRadius: 'var(--r-sm)', background: 'var(--brand-soft)', color: 'var(--brand)',
                    }}>
                      <Icon size={18} />
                    </span>
                    <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 560 }}>{label}</span>
                      <span className="micro truncate">{hint}</span>
                    </span>
                    <ChevronRight size={17} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  /* ------------------------- desktop ------------------------- */
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <nav className="hide-sb" aria-label="Sozlamalar bo'limlari"
        style={{
          width: 236, flexShrink: 0, overflowY: 'auto',
          borderRight: '1px solid var(--border)', padding: 'var(--s-4)',
        }}>
        {GROUPS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActive(id)}
            aria-current={active === id ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '9px 11px', minHeight: 42, borderRadius: 'var(--r-sm)',
              background: active === id ? 'var(--bg-active)' : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              color: active === id ? 'var(--brand)' : 'var(--text-2)',
              fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
              fontWeight: active === id ? 580 : 470,
            }}>
            <Icon size={17} />{label}
          </button>
        ))}
      </nav>

      <div className="hide-sb" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 'var(--s-6)' }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          {active && <Panel group={active} />}
        </div>
      </div>
    </div>
  )
}

/* =========================== panels =============================== */

function Panel({ group }: { group: GroupId }) {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)!
  const settings = useAuthStore((s) => s.settings)!
  const patchSettings = useAuthStore((s) => s.patchSettings)
  const patchProfile = useAuthStore((s) => s.patchProfile)

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (group === 'subjects') sourceApi.subjects().then((r) => setSubjects(r.subjects)).catch(() => {})
    if (group === 'translate' || group === 'voice') {
      translateApi.languages().then((r) => setLanguages(r.languages)).catch(() => {})
    }
  }, [group])

  const flash = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1400) }
  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => {
    void patchSettings({ [k]: v } as Partial<UserSettings>); flash()
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <AnimatePresence>
        {saved && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            role="status" className="chip chip-strong" style={{ justifySelf: 'start' }}
          >
            <Check size={13} /> Saqlandi
          </motion.div>
        )}
      </AnimatePresence>

      {group === 'account' && (
        <Card>
          <Row label="Ism" value={profile.full_name ?? '—'} />
          <Row label="Kirish usuli" value="Google" />
          <p className="micro" style={{ lineHeight: 1.6 }}>
            Chatlar, manbalar, skillar va sozlamalar hisobingizga saqlanadi —
            boshqa qurilmadan kirsangiz ham o'shalar ko'rinadi.
          </p>
          <button className="btn btn-outline" style={{ justifySelf: 'start', color: 'var(--danger)' }}
            onClick={async () => { await signOut(); navigate('/kirish', { replace: true }) }}>
            <LogOut size={15} /> Chiqish
          </button>
        </Card>
      )}

      {group === 'profile' && (
        <Card>
          <TextField label="Ismingiz" value={profile.preferred_name ?? profile.full_name ?? ''}
            onSave={(v) => { void patchProfile({ preferred_name: v }); flash() }} />
          <SelectField label="Sinf" value={String(profile.grade ?? '')}
            options={[['', '—'], ...Array.from({ length: 11 }, (_, i) =>
              [String(i + 1), `${i + 1}-sinf`] as [string, string])]}
            onChange={(v) => { void patchProfile({ grade: v ? Number(v) : null }); flash() }} />
          <SelectField label="Ta'lim tili" value={profile.school_language}
            options={[['uz', "O'zbek"], ['ru', 'Rus'], ['kaa', 'Qoraqalpoq']]}
            onChange={(v) => { void patchProfile({ school_language: v }); flash() }} />
        </Card>
      )}

      {group === 'ai' && (
        <Card>
          <Segment label="Javob uzunligi" value={settings.answer_length}
            options={[['short', 'Qisqa'], ['normal', 'Muvozanatli'], ['detailed', 'Batafsil']]}
            onChange={(v) => set('answer_length', v as UserSettings['answer_length'])} />
          <Note>Muvozanatli javob ko'pchilik savollar uchun eng maqbul tanlov.</Note>
          <Toggle label="Ustoz rejimi" hint="Avval ishora, keyin to'liq yechim"
            value={settings.teacher_mode} onChange={(v) => set('teacher_mode', v)} />
          <Toggle label="Manbani avtomatik tanlash" hint="Kitob biriktirilmasa, mosini o'zi topadi"
            value={settings.auto_source} onChange={(v) => set('auto_source', v)} />
          <Toggle label="Iqtibos majburiy" hint="Har bir dalil uchun bet raqami"
            value={settings.citation_required} onChange={(v) => set('citation_required', v)} />
          <Toggle label="Yoshga moslash" hint="Til murakkabligi sinfga qarab o'zgaradi"
            value={settings.age_adapted} onChange={(v) => set('age_adapted', v)} />
        </Card>
      )}

      {group === 'voice' && <VoicePanel settings={settings} languages={languages} set={set} />}

      {group === 'translate' && (
        <Card>
          <SelectField label="Manba tili" value={settings.tr_source_lang}
            options={[['auto', 'Avto aniqlash'],
              ...languages.map((l) => [l.code, l.native] as [string, string])]}
            onChange={(v) => set('tr_source_lang', v)} />
          <SelectField label="Maqsad tili" value={settings.tr_target_lang}
            options={languages.map((l) => [l.code, l.native] as [string, string])}
            onChange={(v) => set('tr_target_lang', v)} />
          <Toggle label="Oxirgi tanlovni eslab qolish" value={settings.tr_remember_last}
            onChange={(v) => set('tr_remember_last', v)} />
          <Toggle label="Aniqlangan matnni ko'rsatish" value={settings.tr_show_original}
            onChange={(v) => set('tr_show_original', v)} />
          <Toggle label="Tarjimani avtomatik o'qish" value={settings.tr_auto_read}
            onChange={(v) => set('tr_auto_read', v)} />
        </Card>
      )}

      {group === 'subjects' && (
        <Card>
          <p className="micro" style={{ lineHeight: 1.6 }}>
            {subjects.length} ta fan mavjud. AI fanni javob paytida o'zi aniqlaydi —
            bu ro'yxat manbalar va loyihalarni tartiblash uchun.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {subjects.map((s) => <span key={s.id} className="chip">{s.emoji} {s.name}</span>)}
          </div>
        </Card>
      )}

      {group === 'sources' && (
        <Card>
          <p className="micro" style={{ lineHeight: 1.6 }}>
            Kitoblarni yuklash, tahrirlash va o'chirish Manbalar bo'limida.
          </p>
          <button className="btn btn-primary" style={{ justifySelf: 'start' }}
            onClick={() => navigate('/manbalar')}>
            <Library size={16} /> Manbalarni ochish
          </button>
        </Card>
      )}

      {group === 'skills' && (
        <Card>
          <p className="micro" style={{ lineHeight: 1.6 }}>
            Skill — qayta ishlatiladigan AI yo'riqnomasi. Bir marta yozib,
            istalgan chatda qo'llaysiz.
          </p>
          <button className="btn btn-primary" style={{ justifySelf: 'start' }}
            onClick={() => navigate('/skills')}>
            <Sparkles size={16} /> Skillarni ochish
          </button>
        </Card>
      )}

      {group === 'appearance' && (
        <Card>
          <Segment label="Mavzu" value={settings.theme}
            options={[['system', 'Tizim'], ['light', "Yorug'"], ['dark', "Qorong'i"]]}
            onChange={(v) => set('theme', v as UserSettings['theme'])} />
          <Slider label="Shrift o'lchami" value={settings.font_scale ?? 1}
            min={0.9} max={1.25} step={0.05} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => {
              document.documentElement.style.setProperty('--font-scale', String(v))
              set('font_scale', v)
            }} />
          <Toggle label="Ixcham rejim" hint="Elementlar orasidagi masofa kamayadi"
            value={settings.compact_mode} onChange={(v) => set('compact_mode', v)} />
          <Toggle label="Animatsiyani kamaytirish" value={settings.reduced_motion}
            onChange={(v) => set('reduced_motion', v)} />
        </Card>
      )}

      {group === 'privacy' && (
        <Card>
          <Row label="Chat tarixi" value="Hisobda saqlanadi" />
          <Row label="Yuklangan kitoblar" value="Faqat siz ko'rasiz" />
          <p className="micro" style={{ lineHeight: 1.6 }}>
            Har bir jadval satr darajasida himoyalangan (RLS). Boshqa foydalanuvchi
            sizning chatlaringiz, manbalaringiz yoki fayllaringizni ocha olmaydi.
          </p>
          <button className="btn btn-outline" style={{ justifySelf: 'start' }}
            onClick={async () => {
              localStorage.removeItem('veltrix:ui')
              localStorage.removeItem('veltrix:seen')
              await clearCache()
              flash()
            }}>
            Qurilma keshini tozalash
          </button>
        </Card>
      )}
    </div>
  )
}

/* -------------------- voice: only real device voices ---------------- */

function VoicePanel({ settings, languages, set }: {
  settings: UserSettings
  languages: Language[]
  set: <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => void
}) {
  const [testing, setTesting] = useState(false)
  const lang = languages.find((l) => l.code === settings.tr_target_lang)
  const bcp47 = lang?.bcp47 ?? 'uz-UZ'
  const available = speechSupported ? voicesFor(bcp47) : []

  useEffect(() => () => cancelSpeech(), [])

  if (!speechSupported) {
    return (
      <Card>
        <p className="micro" style={{ lineHeight: 1.6 }}>
          Bu qurilma ovozli o'qishni qo'llab-quvvatlamaydi.
        </p>
      </Card>
    )
  }

  const test = () => {
    if (testing) { cancelSpeech(); setTesting(false); return }
    setTesting(true)
    speak('Salom! Men Veltrix Hom yordamchisiman. 2 + 2 = 4.', {
      lang: bcp47,
      rate: settings.voice_rate,
      onEnd: () => setTesting(false),
    })
  }

  return (
    <Card>
      <p className="micro" style={{ lineHeight: 1.6 }}>
        Ovozlar qurilmangizdan olinadi. {lang?.native ?? 'Bu til'} uchun{' '}
        {available.length ? `${available.length} ta ovoz topildi.` : 'ovoz topilmadi.'}
      </p>

      {available.length === 0 && (
        <div role="alert" className="surface-quiet" style={{
          padding: '10px 12px', fontSize: 'var(--fs-label)', color: 'var(--warning)',
        }}>
          Bu til uchun mos ovoz topilmadi. Qurilma sozlamalaridan til paketini qo'shing.
        </div>
      )}

      <Slider label="Tezlik" value={settings.voice_rate} min={0.6} max={1.6} step={0.1}
        format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set('voice_rate', v)} />

      <Toggle label="Javobni avtomatik o'qish" value={settings.auto_read}
        onChange={(v) => set('auto_read', v)} />

      <button className="btn btn-outline" style={{ justifySelf: 'start' }}
        disabled={available.length === 0} onClick={test}>
        {testing ? <Square size={15} /> : <Play size={15} />}
        {testing ? "To'xtatish" : 'Ovozni sinash'}
      </button>
    </Card>
  )
}

/* --------------------------- primitives ---------------------------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="surface" style={{ padding: 'var(--s-5)', display: 'grid', gap: 'var(--s-4)' }}>
      {children}
    </section>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="micro" style={{
      padding: '10px 12px', borderRadius: 'var(--r-md)',
      background: 'var(--brand-soft)', color: 'var(--brand)', lineHeight: 1.55,
    }}>{children}</p>
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
          width: 48, height: 28, flexShrink: 0, borderRadius: 99, cursor: 'pointer',
          border: '1px solid var(--border)', padding: 2,
          background: value ? 'var(--brand)' : 'var(--bg-hover)',
          transition: 'background var(--t-toggle) var(--ease)',
        }}>
        <span style={{
          display: 'block', width: 22, height: 22, borderRadius: '50%', background: '#fff',
          transform: value ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform var(--t-toggle) var(--ease)',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
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
      <div className="row" style={{
        gap: 4, background: 'var(--bg-hover)', padding: 3, borderRadius: 'var(--r-md)',
      }}>
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
            style={{
              flex: 1, minHeight: 38, borderRadius: 'var(--r-sm)', cursor: 'pointer', border: 'none',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-label)',
              background: value === v ? 'var(--surface)' : 'transparent',
              color: value === v ? 'var(--text)' : 'var(--text-2)',
              fontWeight: value === v ? 580 : 480,
              boxShadow: value === v ? 'var(--shadow-sm)' : 'none',
              transition: 'background var(--t-hover) var(--ease)',
            }}>{l}</button>
        ))}
      </div>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function TextField({ label, value, onSave }: {
  label: string; value: string; onSave: (v: string) => void
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
      <input className="input" value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() && v !== value && onSave(v.trim())} maxLength={60} />
    </label>
  )
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  format: (v: number) => string; onChange: (v: number) => void
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
        <span className="micro">{format(local)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={local} aria-label={label}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={() => onChange(local)} onTouchEnd={() => onChange(local)}
        style={{ width: '100%', accentColor: 'var(--brand)' }} />
    </div>
  )
}
