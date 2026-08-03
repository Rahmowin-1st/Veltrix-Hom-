import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, CalendarDays, ChevronDown, Flame, Gamepad2, Sparkles, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { activityApi } from '@/lib/api'
import { MODES } from '@/lib/modes'
import { useAuthStore } from '@/store/authStore'
import type { ActivitySummary } from '@/types'

const EMPTY: ActivitySummary = { weekPoints: 0, monthPoints: 0, bestDayPoints: 0, activeLast3: 0, activeLast30: 0, days: [] }

export default function Personal() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const [summary, setSummary] = useState<ActivitySummary>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSummary(EMPTY); setLoading(true)
    if (!userId) { setLoading(false); return }
    let cancelled = false
    activityApi.summary().then((value) => { if (!cancelled) setSummary(value) }).catch(() => { if (!cancelled) setSummary(EMPTY) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  const activity = useMemo(() => calculateActivity(profile?.xp ?? 0, profile?.streak_days ?? 0, summary), [profile?.xp, profile?.streak_days, summary])
  const firstName = (profile?.preferred_name || profile?.full_name || 'Shahboz').split(' ')[0]

  return <div className="v5-personal-snap hide-sb" data-scroll-root>
    <section className="v5-personal-page">
      <div className="v5-personal-inner">
        <motion.div className="v5-level-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .42, ease: [0.16,1,0.3,1] }}>
          <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
            <div><p className="micro" style={{ marginBottom: 4 }}>PERSONAL · FAOLLIK</p><h1 style={{ fontSize: 'clamp(27px,7vw,40px)' }}>{firstName}ning darajasi</h1></div>
            <span className="chip chip-strong"><Trophy size={15}/> {profile?.streak_days ?? 0} kun</span>
          </div>

          <div className="v5-mood-ring" style={{ '--mood-color': activity.color, '--mood-progress': `${activity.value}%` } as React.CSSProperties}>
            <span className="v5-mood-emoji" aria-label={activity.label}>{activity.emoji}</span>
          </div>
          <div style={{ textAlign: 'center' }}><h2 style={{ fontSize: 24 }}>{activity.label}</h2><p className="muted" style={{ marginTop: 4 }}>{activity.message}</p></div>

          <div className="v5-zebra-progress" aria-label={`Faollik darajasi ${activity.value} foiz`}>
            <div className="v5-zebra-fill" style={{ '--progress': `${activity.value}%`, '--progress-light': activity.light, '--progress-dark': activity.color } as React.CSSProperties}/>
          </div>

          <div className="v5-stats-grid">
            <Stat icon={<BarChart3 size={18}/>} value={loading ? '…' : summary.weekPoints} label="Haftalik ball"/>
            <Stat icon={<CalendarDays size={18}/>} value={loading ? '…' : summary.monthPoints} label="Oylik ball"/>
            <Stat icon={<Trophy size={18}/>} value={loading ? '…' : summary.bestDayPoints} label="Eng yaxshi kun"/>
            <Stat icon={<Flame size={18}/>} value={loading ? '…' : `${summary.activeLast3}/3`} label="So‘nggi 3 kun"/>
          </div>

          <div className="surface-2" style={{ width: '100%', padding: 14, borderRadius: 22 }}>
            <strong>{activity.insight}</strong>
            <p className="micro" style={{ marginTop: 5 }}>{summary.activeLast30} ta faol kun · so‘nggi 30 kun</p>
          </div>
          <div className="row" style={{ marginTop: 'auto', gap: 7, color: 'var(--text-3)' }}><ChevronDown size={18}/><span className="micro">Rejimlar uchun pastga suring</span></div>
        </motion.div>
      </div>
    </section>

    <section className="v5-personal-page">
      <div className="v5-personal-inner" style={{ display: 'grid', gap: 16 }}>
        <header><p className="micro">PERSONAL · REJIMLAR</p><h1 style={{ fontSize: 'clamp(28px,7vw,42px)' }}>Qanday ishlaymiz?</h1><p className="muted">Har bir rejim alohida, aniq workflow bilan ochiladi.</p></header>
        <div className="v5-modes-grid">
          {MODES.map((mode, index) => <motion.button key={mode.id} className="v5-mode-card" style={{ '--mode-color': mode.color } as React.CSSProperties}
            initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(index * .035, .22) }}
            onClick={() => navigate(mode.id === 'quiz' ? '/testlar?create=1' : mode.id === 'translate' ? '/tarjima' : `/rejim/${mode.id}`)}>
            <span className="v5-source-icon" style={{ '--source-color': mode.color, width: 48, height: 48 } as React.CSSProperties}><mode.Icon size={22}/></span>
            <strong style={{ display: 'block', marginTop: 15, fontSize: 17 }}>{mode.title}</strong><span className="micro clamp-2" style={{ display: 'block', marginTop: 5 }}>{mode.subtitle}</span>
          </motion.button>)}
          <motion.button className="v5-mode-card" style={{ '--mode-color': '#0A6CFF' } as React.CSSProperties} whileTap={{ scale: .975 }} onClick={() => navigate('/kalkulyator')}>
            <span className="v5-source-icon" style={{ '--source-color': '#0A6CFF', width: 48, height: 48 } as React.CSSProperties}><BarChart3 size={22}/></span>
            <strong style={{ display: 'block', marginTop: 15, fontSize: 17 }}>Kalkulyator</strong><span className="micro clamp-2" style={{ display: 'block', marginTop: 5 }}>AI siz, tez va aniq hisob-kitob.</span>
          </motion.button>
          <motion.button className="v5-mode-card" style={{ '--mode-color': '#FF7A18' } as React.CSSProperties} whileTap={{ scale: .975 }} onClick={() => navigate('/oyin')}>
            <span className="v5-source-icon" style={{ '--source-color': '#FF7A18', width: 48, height: 48 } as React.CSSProperties}><Gamepad2 size={22}/></span>
            <strong style={{ display: 'block', marginTop: 15, fontSize: 17 }}>Fan o‘yini</strong><span className="micro clamp-2" style={{ display: 'block', marginTop: 5 }}>Tezkor savollar, combo va rekordlar.</span>
          </motion.button>
          <motion.button className="v5-mode-card" style={{ '--mode-color': '#8B5CF6' } as React.CSSProperties} whileTap={{ scale: .975 }} onClick={() => navigate('/talent')}>
            <span className="v5-source-icon" style={{ '--source-color': '#8B5CF6', width: 48, height: 48 } as React.CSSProperties}><Sparkles size={22}/></span>
            <strong style={{ display: 'block', marginTop: 15, fontSize: 17 }}>Talentlar</strong><span className="micro clamp-2" style={{ display: 'block', marginTop: 5 }}>Claude Talent kabi AI talentlari.</span>
          </motion.button>
        </div>
      </div>
    </section>
  </div>
}

function Stat({ icon, value, label }: { icon:React.ReactNode; value:string|number; label:string }) {
  return <div className="v5-stat-card"><span style={{ color: 'var(--brand)' }}>{icon}</span><div className="v5-stat-value">{value}</div><span className="micro">{label}</span></div>
}

function calculateActivity(xp:number, streak:number, summary:ActivitySummary) {
  const raw = Math.round(Math.min(100, summary.weekPoints * 2.2 + summary.activeLast3 * 7 + Math.min(streak, 14) * 2 + Math.min(xp / 120, 12)))
  const value = summary.days.length === 0 && xp === 0 ? 0 : Math.max(1, raw)
  if (value === 0) return { value, emoji:'💤', color:'#D9E1EC', light:'#F8FAFD', label:'Boshlashga tayyor', message:'Birinchi vazifani bajaring — indikator jonlanadi.', insight:'Bugun yangi start uchun ideal kun.' }
  if (value < 20) return { value, emoji:'😵', color:'#E6384F', light:'#FFB7C2', label:'Ritmni tiklaymiz', message:'Bitta kichik vazifa ham momentum beradi.', insight:'Faollik past. Bugun 10 daqiqa ishlashni boshlang.' }
  if (value < 40) return { value, emoji:'🧩', color:'#FF6B1A', light:'#FFD0AD', label:'Qiziyapsiz', message:'Ritm paydo bo‘ldi. Uni uzmang.', insight:'Yaxshi boshlanish — yana bitta topshiriq yetadi.' }
  if (value < 60) return { value, emoji:'🤓', color:'#E6B400', light:'#FFF1A8', label:'Bilim rejimi', message:'Barqaror ishlayapsiz.', insight:'Haftalik faollik muvozanatli.' }
  if (value < 80) return { value, emoji:'⚡', color:'#73B91D', light:'#DDF7A8', label:'Kuchli temp', message:'So‘nggi kunlarda juda faolsiz.', insight:'Momentum yuqori — qiyinroq rejimni sinang.' }
  if (value < 95) return { value, emoji:'😎', color:'#22A95A', light:'#B7F1CF', label:'Top forma', message:'Natijalar juda yaxshi.', insight:'Siz eng faol foydalanuvchilar ritmidasiz.' }
  return { value, emoji:'🔥', color:'#087F43', light:'#92E6B7', label:'Maksimal olov', message:'Bugun sizni to‘xtatib bo‘lmaydi.', insight:'100 darajaga yaqin — rekordni saqlang.' }
}
