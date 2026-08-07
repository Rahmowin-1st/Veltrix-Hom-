import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { ContextAttachSheet } from '@/components/chat/ContextAttachSheet'
import { ChatComposer } from '@/components/chat/ChatComposer'
import type { Attachment } from '@/components/chat/AttachSheet'
import { sourceApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useSkillStore } from '@/store/skillStore'
import type { Source } from '@/types'
import { tap } from '@/lib/native'

const PROMPTS = [
  'Bugun nimani yechamiz?', 'Qaysi mavzu tushunarsiz bo‘lib qoldi?', 'Masalani yuboring — birga yechamiz.',
  'Daftardagi vazifani suratga oling.', 'Kitobdagi qaysi betdan javob kerak?', 'Javobingizni tekshirib beraymi?',
  'Qaysi fan bo‘yicha yordam kerak?', 'Murakkab mavzuni sodda qilamiz.', 'Test tuzib mashq qilamizmi?',
  'Formulani tushuntirib beraymi?', 'Bugungi uy vazifasini boshlaymiz.', 'Savolingizni yozing yoki ayting.',
  'Rasm, audio yoki fayl yuboring.', 'Biror javobdan shubhalanyapsizmi?', 'Eng qisqa usul bilan yechamiz.',
  'Bosqichma-bosqich tushuntiraymi?', 'Manbadan aniq javob topamiz.', 'Yangi mavzuni mustahkamlaymiz.',
  'Nazorat ishiga tayyorlanamizmi?', 'Inglizcha matnni tarjima qilaymi?', 'Matematikani tezroq tushunamiz.',
  'Fizikadagi formulani ochib beraymi?', 'Tarix sanalarini tartiblaymiz.', 'Biologiya mavzusini sxemaga solamiz.',
  'Kimyo tenglamasini tekshiramiz.', 'Grammatikani misol bilan o‘rganamiz.', 'Fayldagi asosiy fikrlarni ajrataymi?',
  'Mavzudan test yaratib beraymi?', 'Xatoni topib, to‘g‘risini ko‘rsataman.', 'Daftarga ko‘chirishga tayyor javob kerakmi?',
  'Bir savol — aniq javob.', 'Qaysi kitob bilan ishlaymiz?', 'Bugun rekord yangilaymizmi?',
  'Yechimni formula va jadvalda ko‘rsataymi?', 'Rasmdagi barcha mashqni bajarib beraymi?',
  'Qisqa izohmi yoki batafsil yechimmi?', 'Manba va betni o‘zim aniqlaymi?',
  'Ovoz bilan savol bering.', 'Vazifani hozir tugatamiz.', 'Veltrix tayyor. Savolni yuboring.',
] as const

const DRAFT_PREFIX = 'veltrix:general-draft:v6'

export default function General() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const userId = useAuthStore((s) => s.user?.id ?? 'guest')
  const settings = useAuthStore((s) => s.settings)
  const setHandoffText = useUIStore((s) => s.setHandoffText)
  const setHandoffAttachment = useUIStore((s) => s.setHandoffAttachment)
  const setActiveSources = useUIStore((s) => s.setActiveSources)
  const consumeSources = useUIStore((s) => s.consumeSources)
  const setNavHidden = useUIStore((s) => s.setNavHidden)
  const skills = useSkillStore((s) => s.skills)
  const activeSkillId = useSkillStore((s) => s.activeId)
  const loadSkills = useSkillStore((s) => s.load)
  const setSkill = useSkillStore((s) => s.setActive)

  const draftKey = `${DRAFT_PREFIX}:${userId}`
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { visible: greeting, full: greetingFull } = useRotatingPrompt(settings?.greeting_rotation !== false)

  useEffect(() => { setText(localStorage.getItem(draftKey) ?? '') }, [draftKey])

  useEffect(() => {
    setNavHidden(false)
    void loadSkills()
    sourceApi.list().then((r) => {
      setSources(r.sources)
      const handed = consumeSources()
      if (handed.length) setSourceIds(handed)
    }).catch(() => {})
  }, [loadSkills, setNavHidden, consumeSources, userId])

  useEffect(() => {
    localStorage.setItem(draftKey, text)
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [text, draftKey])

  const first = (profile?.preferred_name ?? profile?.full_name ?? '').split(' ')[0]
  const canSend = Boolean(text.trim() || attachment)
  const selectedSources = useMemo(() => sources.filter((s) => sourceIds.includes(s.id)), [sources, sourceIds])
  const activeSkill = skills.find((s) => s.id === activeSkillId)

  const send = () => {
    if (!canSend || sending) return
    void tap('medium')
    setSending(true)
    setNavHidden(true)
    setHandoffText(text.trim())
    setHandoffAttachment(attachment)
    setActiveSources(sourceIds)
    localStorage.removeItem(draftKey)
    window.setTimeout(() => navigate('/chat'), 420)
  }

  return (
    <div data-scroll-root className="v5-general hide-sb">
      <div className="v5-general-core">
        <motion.div initial={{ scale: .86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 21 }}>
          <VeltrixMark size={58}/>
        </motion.div>

        <div className="v5-greeting-wrap"><div className="v5-greeting" data-full={`${first && greetingFull.startsWith('Bugun') ? `${first}, ` : ''}${greetingFull}`} aria-live="polite"><span className="v5-greeting-live">{first && greeting.startsWith('Bugun') ? `${first}, ` : ''}{greeting}<span className="v5-caret" /></span></div></div>

        {/*
          One composer, two surfaces. General previously carried its own
          duplicate markup, which drifted from the chat composer with every
          change — different placeholder, different send button, no source
          selector. It now renders the SAME component, so the two can no
          longer diverge.
        */}
        <motion.div style={{ width: 'min(680px,100%)' }}
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: .08, duration: .44, ease: [0.16, 1, .3, 1] }}>
          <ChatComposer
            variant="hero"
            value={text}
            onChange={setText}
            onSend={send}
            onStop={() => setSending(false)}
            busy={sending}
            attachment={attachment}
            setAttachment={setAttachment}
            allSources={sources}
            context={{
              sources: selectedSources,
              translation: null,
              skill: activeSkill ?? null,
            }}
            onAddSource={(source) =>
              setSourceIds((ids) => (ids.includes(source.id) ? ids : [...ids, source.id]))}
            onRemoveSource={(id) => setSourceIds((ids) => ids.filter((x) => x !== id))}
            onClearSkill={() => setSkill(null)}
            onClearTranslation={() => undefined}
            onToggleTranslation={() => undefined}
          />
        </motion.div>

        {error && <motion.div role="alert" className="surface" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--danger)', padding: '10px 14px', borderRadius: 17 }}>{error}</motion.div>}
        <p className="micro" style={{ textAlign: 'center', maxWidth: 520 }}>Matn, ovoz, rasm, audio, fayl, manba va Talent bir so‘rovda ishlashi mumkin.</p>
      </div>

      <ContextAttachSheet open={sheetOpen} onClose={() => setSheetOpen(false)} sources={sources} skills={skills}
        selectedSourceIds={sourceIds} activeSkillId={activeSkillId}
        onToggleSource={(source) => setSourceIds((ids) => ids.includes(source.id) ? ids.filter((id) => id !== source.id) : [...ids, source.id])}
        onSelectSkill={(skill) => { setSkill(skill?.id ?? null); if (skill) setSheetOpen(false) }}
        onPickAttachment={setAttachment} onCreateSource={() => navigate('/manbalar?add=1')}
        onCreateSkill={() => navigate('/talent?add=1')} onError={setError}/>
    </div>
  )
}

function splitGraphemes(value: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale?: string, opts?: { granularity: 'grapheme' }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter
  if (!Segmenter) return Array.from(value)
  return Array.from(new Segmenter('uz', { granularity: 'grapheme' }).segment(value), (part) => part.segment)
}

function useRotatingPrompt(enabled: boolean) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState('')
  const [phase, setPhase] = useState<'typing'|'holding'|'deleting'>('typing')
  const [fontsReady, setFontsReady] = useState(false)
  const graphemes = useMemo(() => splitGraphemes(PROMPTS[index]!), [index])

  useEffect(() => {
    let cancelled = false
    const ready = document.fonts?.ready ?? Promise.resolve()
    void ready.finally(() => { if (!cancelled) setFontsReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!fontsReady) return
    if (!enabled) {
      setVisible(graphemes.join(''))
      setPhase('holding')
      return
    }
    if (!visible) {
      setVisible(graphemes[0] ?? ' ')
      setPhase('typing')
    }
  }, [enabled, fontsReady, graphemes, visible])

  useEffect(() => {
    if (!fontsReady || !enabled) return
    const current = splitGraphemes(visible)
    const delay = phase === 'holding' ? 5000 : phase === 'deleting' ? 34 : 48
    const timer = window.setTimeout(() => {
      if (phase === 'typing') {
        if (current.length >= graphemes.length) setPhase('holding')
        else setVisible(graphemes.slice(0, current.length + 1).join(''))
        return
      }
      if (phase === 'holding') {
        setPhase('deleting')
        return
      }
      if (current.length > 1) {
        setVisible(current.slice(0, -1).join(''))
        return
      }

      // Swap directly from one visible glyph to the next phrase's first
      // glyph. The greeting container is therefore never blank or clipped.
      const next = (index + 1) % PROMPTS.length
      setIndex(next)
      setVisible(splitGraphemes(PROMPTS[next]!)[0] ?? ' ')
      setPhase('typing')
    }, delay)
    return () => window.clearTimeout(timer)
  }, [enabled, fontsReady, graphemes, index, phase, visible])

  const full = PROMPTS[index] ?? 'Savolingizni yuboring.'
  return { visible: visible || splitGraphemes(full)[0] || ' ', full }
}

