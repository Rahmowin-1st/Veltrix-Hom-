import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, BarChart3, Bell, BookOpen, Brain, Camera, ChevronRight, GraduationCap,
  Languages, LibraryBig, LogOut, Palette, SlidersHorizontal, Sparkles, Vibrate,
  Volume2, X, Zap,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { SettingsPanel, type GroupId } from '@/components/settings/SettingsPanel'

/**
 * Settings root.
 *
 * Built mobile-first: a phone screen with a real profile card and grouped
 * rows, not a desktop settings page scaled down. It is long and scrolls
 * natively — compressing everything into one viewport is exactly what makes
 * an app feel like a web page instead of an app.
 */

interface Item {
  id: GroupId
  title: string
  subtitle: string
  icon: React.ReactNode
  /** Semantic accent. One icon family, tinted — not unrelated stickers. */
  tone: string
}

const SECTIONS: { label: string; items: Item[] }[] = [
  {
    label: 'SIZ UCHUN',
    items: [
      { id: 'personalization', title: 'Personalizatsiya', subtitle: 'Veltrix siz haqingizda nimani bilsin?', icon: <Brain />, tone: '#5B7CFA' },
      { id: 'learning', title: 'O‘qish uslubi', subtitle: 'Qanday o‘rganishni yoqtirasiz?', icon: <GraduationCap />, tone: '#8B5CF6' },
    ],
  },
  {
    label: 'AI SOZLAMALARI',
    items: [
      { id: 'ai', title: 'AI javoblari', subtitle: 'Uslub, uzunlik va yechish uslubi', icon: <SlidersHorizontal />, tone: '#0A6CFF' },
      { id: 'sourcemode', title: 'Manba rejimi', subtitle: 'Manbalardan foydalanish usuli', icon: <LibraryBig />, tone: '#15A66A' },
      { id: 'skills', title: 'Talentlar', subtitle: 'Default Talent va boshqarish', icon: <Sparkles />, tone: '#E0559A' },
    ],
  },
  {
    label: 'TA’LIM SOZLAMALARI',
    items: [
      { id: 'subjects', title: 'Sinf va fanlar', subtitle: 'Sinfingiz va o‘qitiladigan fanlar', icon: <BookOpen />, tone: '#E8A21C' },
      { id: 'difficulty', title: 'Tushuntirish qiyinligi', subtitle: 'Qanchalik chuqur tushuntirishni xohlaysiz?', icon: <BarChart3 />, tone: '#F0872A' },
    ],
  },
  {
    label: 'ILOVA SOZLAMALARI',
    items: [
      { id: 'appearance', title: 'Ko‘rinish', subtitle: 'Tizim, rang va chat ko‘rinishi', icon: <Palette />, tone: '#3B82F6' },
      { id: 'language', title: 'Til', subtitle: 'Ilova va javob tili', icon: <Languages />, tone: '#21B7D7' },
      { id: 'voice', title: 'Ovoz', subtitle: 'AI ovozi va tezlik', icon: <Volume2 />, tone: '#8B5CF6' },
      { id: 'haptics', title: 'Haptics', subtitle: 'Vibratsiya va teginish', icon: <Vibrate />, tone: '#15A66A' },
      { id: 'notifications', title: 'Bildirishnomalar', subtitle: 'Muhim yangiliklar haqida', icon: <Bell />, tone: '#E8A21C' },
      { id: 'performance', title: 'Ishlash rejimi', subtitle: 'Tezlik, sifat va animatsiyalar', icon: <Zap />, tone: '#0A6CFF' },
    ],
  },
]

const SUB: Partial<Record<GroupId, { title: string; subtitle: string }>> = {
  personalization: { title: 'Personalizatsiya', subtitle: 'Veltrix sizni qanday bilishi kerak' },
  learning: { title: 'O‘qish uslubi', subtitle: 'Sizga qulay o‘rganish usuli' },
  ai: { title: 'AI javoblari', subtitle: 'AI javob berish uslubini sozlang' },
  sourcemode: { title: 'Manba rejimi', subtitle: 'Manbalardan foydalanish usuli' },
  skills: { title: 'Talentlar', subtitle: 'Default Talent va boshqarish' },
  subjects: { title: 'Sinf va fanlar', subtitle: 'Sinfingiz va faol fanlar' },
  difficulty: { title: 'Tushuntirish qiyinligi', subtitle: 'Tushuntirish chuqurligi' },
  appearance: { title: 'Ko‘rinish', subtitle: 'Mavzu va chat ko‘rinishi' },
  language: { title: 'Til', subtitle: 'Ilova va javob tili' },
  voice: { title: 'Ovoz', subtitle: 'AI ovozi va o‘qish tezligi' },
  haptics: { title: 'Haptics', subtitle: 'Vibratsiya va teginish' },
  notifications: { title: 'Bildirishnomalar', subtitle: 'Qurilma bildirishnomalari' },
  performance: { title: 'Ishlash rejimi', subtitle: 'Tezlik va animatsiyalar' },
  account: { title: 'Hisob', subtitle: 'Profil va hisobingiz' },
}

export default function Settings() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const profile = useAuthStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)

  const ids = SECTIONS.flatMap((section) => section.items.map((item) => item.id))
  const requested = params.get('section') as GroupId | null
  const active = requested && (ids.includes(requested) || requested === 'account') ? requested : null
  const meta = active ? SUB[active] : undefined

  const open = (id: GroupId) => {
    const next = new URLSearchParams(params)
    next.set('section', id)
    setParams(next)
  }

  /** Consumes the history entry the subpage pushed, so system Back returns
   *  to the root exactly once instead of skipping a screen. */
  const closeSection = () => {
    const index = Number(window.history.state?.idx ?? 0)
    if (index > 0) navigate(-1)
    else {
      const next = new URLSearchParams(params)
      next.delete('section')
      setParams(next, { replace: true })
    }
  }

  const name = profile?.preferred_name || profile?.full_name || 'Veltrix o‘quvchi'
  const initial = name.trim().charAt(0).toUpperCase() || 'V'
  const language = profile?.learning_language || profile?.school_language || 'O‘zbek tili'

  return (
    <div style={{ flex: 1, minHeight: 0 }}>
      <div data-scroll-root className="v16-settings hide-sb">
        <div className="v16-settings-inner">
          <header className="v16-settings-head">
            <button type="button" className="v16-close" onClick={() => navigate('/general')} aria-label="Yopish">
              <X size={22} strokeWidth={2.3} />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1>Sozlamalar</h1>
              <p>Veltrix Hom’ni o‘zingizga moslang</p>
            </div>
          </header>

          {/* Real account data only — nothing from the reference is hardcoded. */}
          <button type="button" className="v16-profile" onClick={() => open('account')}>
            <span className="v16-avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <strong>{initial}</strong>}
              {/* Opens the profile editor rather than being a dead badge. */}
              <span className="v16-avatar-badge" aria-hidden><Camera size={13} strokeWidth={2.4} /></span>
            </span>
            <span className="v16-profile-copy">
              <strong className="truncate">{name}</strong>
              <span className="v16-profile-meta">
                {profile?.grade ? `${profile.grade}-sinf` : 'Sinf tanlanmagan'}
                <i aria-hidden>•</i>
                {language}
              </span>
              {/* Only the email may truncate; setting titles never do. */}
              <span className="v16-profile-mail truncate">{user?.email ?? ''}</span>
            </span>
            <ChevronRight size={20} aria-hidden />
          </button>

          {SECTIONS.map((section) => (
            <section key={section.label} className="v16-group">
              <h2 className="v16-group-label">{section.label}</h2>
              <div className="v16-card">
                {section.items.map((item) => (
                  <button key={item.id} type="button" className="v16-row" onClick={() => open(item.id)}>
                    <span className="v16-row-icon" style={{ '--tone': item.tone } as React.CSSProperties}>
                      {item.icon}
                    </span>
                    <span className="v16-row-copy">
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </span>
                    <ChevronRight size={19} aria-hidden />
                  </button>
                ))}
              </div>
            </section>
          ))}

          <section className="v16-group">
            <div className="v16-card">
              <button type="button" className="v16-row v16-row-danger" onClick={() => open('account')}>
                <span className="v16-row-icon" style={{ '--tone': '#EF3F5B' } as React.CSSProperties}>
                  <LogOut />
                </span>
                <span className="v16-row-copy">
                  <strong>Chiqish</strong>
                  <span>Hisobingizdan chiqish</span>
                </span>
                <ChevronRight size={19} aria-hidden />
              </button>
            </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {active && (
          <motion.section className="v5-settings-subpage"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: .22, ease: [.16, 1, .3, 1] }}>
            <header className="v16-sub-head">
              <button type="button" className="v16-close" onClick={closeSection} aria-label="Orqaga">
                <ArrowLeft size={21} strokeWidth={2.3} />
              </button>
              <div style={{ minWidth: 0 }}>
                <h1>{meta?.title ?? 'Sozlamalar'}</h1>
                {meta?.subtitle && <p>{meta.subtitle}</p>}
              </div>
            </header>
            <div data-scroll-root className="v16-sub-body hide-sb">
              <div className="v16-settings-inner">
                <SettingsPanel group={active} onNavigate={(to) => navigate(to)} />
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
