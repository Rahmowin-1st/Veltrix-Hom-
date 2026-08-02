import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronRight, ArrowLeft, User, Sliders, Volume2, Languages,
  BookOpen, Library, Sparkles, Palette, ShieldCheck, Bell, Zap, Info,
} from 'lucide-react'
import { VeltrixLogo } from '@/components/brand/VeltrixLogo'
import { SettingsPanel, type GroupId } from '@/components/settings/SettingsPanel'
import { useAuthStore } from '@/store/authStore'

const GROUPS: { id: GroupId; label: string; hint: string; Icon: typeof User; color: string }[] = [
  { id: 'account',    label: 'Hisob',       hint: 'Profil va kirish',        Icon: User,        color: '#0A6CFF' },
  { id: 'profile',    label: 'Profil',      hint: "Ism, sinf, ta'lim tili",  Icon: User,        color: '#1E9BFF' },
  { id: 'ai',         label: 'AI javoblari', hint: 'Uslub, uzunlik, manba',  Icon: Sliders,     color: '#8B5CF6' },
  { id: 'voice',      label: 'Ovoz',        hint: 'Diktor, tezlik, o\u02bcqish', Icon: Volume2, color: '#0E8F52' },
  { id: 'translate',  label: 'Tarjima',     hint: 'Standart tillar',         Icon: Languages,   color: '#2680F0' },
  { id: 'subjects',   label: 'Fanlar',      hint: 'Sinf va fanlar katalogi', Icon: BookOpen,    color: '#C87B00' },
  { id: 'sources',    label: 'Manbalar',    hint: 'Yuklangan kitoblar',      Icon: Library,     color: '#4ACEFF' },
  { id: 'skills',     label: 'Skills',      hint: 'AI yo\u02bcriqnomalari',  Icon: Sparkles,    color: '#D42E48' },
  { id: 'appearance', label: "Ko'rinish",   hint: 'Mavzu, shrift, zichlik',  Icon: Palette,     color: '#8B5CF6' },
  { id: 'notifications', label: 'Bildirishnoma', hint: 'Ovoz va tebranish',  Icon: Bell,        color: '#C87B00' },
  { id: 'performance', label: 'Tezlik',     hint: 'Animatsiya va kesh',      Icon: Zap,         color: '#0E8F52' },
  { id: 'privacy',    label: 'Maxfiylik',   hint: 'Ma\u02bclumot va xavfsizlik', Icon: ShieldCheck, color: '#D42E48' },
  { id: 'about',      label: 'Ilova haqida', hint: 'Versiya va limitlar',    Icon: Info,        color: '#6B7B93' },
]

/**
 * The drawer is the settings surface — and only that. Navigation lives in
 * the bottom bar, so nothing is duplicated between the two.
 */
export function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const [group, setGroup] = useState<GroupId | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (group) setGroup(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [group, onClose])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: .24, ease: [0.16, 1, 0.3, 1] }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 59, background: 'var(--scrim)' }}
      />

      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Sozlamalar"
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 36, mass: .85 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: .3, right: 0 }}
        onDragEnd={(_, info) => { if (info.offset.x < -80) onClose() }}
        className="glass-nav"
        style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 60,
          width: 'min(var(--sidebar-w), 88vw)',
          display: 'flex', flexDirection: 'column',
          paddingTop: 'var(--safe-top)',
          borderRadius: '0 var(--r-sheet) var(--r-sheet) 0',
          borderWidth: '0 1px 0 0',
        }}
      >
        {/* ------------------------ header ------------------------ */}
        <div className="row" style={{
          height: 'var(--header-h)', paddingInline: 'var(--s-4) 8px',
          borderBottom: '1px solid var(--border)', gap: 8,
        }}>
          {group ? (
            <>
              <button className="btn btn-ghost btn-icon" style={{ width: 40, height: 40 }}
                onClick={() => setGroup(null)} aria-label="Orqaga">
                <ArrowLeft size={20} />
              </button>
              <strong className="truncate" style={{ fontSize: 'var(--fs-lead)', fontWeight: 660 }}>
                {GROUPS.find((g) => g.id === group)?.label}
              </strong>
            </>
          ) : (
            <>
              <VeltrixLogo height={24} />
              <span style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-icon" style={{ width: 40, height: 40 }}
                onClick={onClose} aria-label="Yopish">
                <X size={20} />
              </button>
            </>
          )}
        </div>

        {/* ------------------------- body ------------------------- */}
        <div className="hide-sb" style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-3)' }}>
          <AnimatePresence mode="wait" initial={false}>
            {group ? (
              <motion.div
                key={group}
                initial={{ opacity: 0, x: 22 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 22 }}
                transition={{ duration: .24, ease: [0.16, 1, 0.3, 1] }}
              >
                <SettingsPanel group={group} onNavigate={(to) => { navigate(to); onClose() }} />
              </motion.div>
            ) : (
              <motion.div
                key="root"
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: .24, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'grid', gap: 2 }}
              >
                <h2 style={{ fontSize: 'var(--fs-title)', padding: '6px 10px 12px' }}>
                  Sozlamalar
                </h2>

                {GROUPS.map(({ id, label, hint, Icon, color }, i) => (
                  <motion.button
                    key={id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.022, duration: .3, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => setGroup(id)}
                    className="pressable"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '11px 10px', minHeight: 58, borderRadius: 'var(--r-md)',
                      background: 'transparent', border: 'none', textAlign: 'left',
                      color: 'var(--text)', fontFamily: 'var(--font)',
                    }}
                  >
                    <span style={{
                      width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center',
                      borderRadius: 'var(--r-xs)',
                      background: `color-mix(in srgb, ${color} 15%, transparent)`,
                      color,
                    }}>
                      <Icon size={18} strokeWidth={2.1} />
                    </span>
                    <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{label}</span>
                      <span className="micro truncate">{hint}</span>
                    </span>
                    <ChevronRight size={17} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ------------------------ footer ------------------------ */}
        <div className="row" style={{
          padding: 'var(--s-3)',
          paddingBottom: 'calc(var(--s-3) + var(--safe-bottom))',
          borderTop: '1px solid var(--border)', gap: 11,
        }}>
          <span style={{
            width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center',
            borderRadius: '50%', background: 'var(--brand-gradient)',
            color: '#fff', fontWeight: 700, fontSize: 'var(--fs-sm)',
          }}>
            {(profile?.preferred_name ?? profile?.full_name ?? 'V').charAt(0).toUpperCase()}
          </span>
          <span className="col" style={{ gap: 1, minWidth: 0, flex: 1 }}>
            <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
              {profile?.preferred_name ?? profile?.full_name ?? 'Foydalanuvchi'}
            </span>
            <span className="micro">{profile?.grade ? `${profile.grade}-sinf` : 'Sinf tanlanmagan'}</span>
          </span>
        </div>
      </motion.aside>
    </>
  )
}
