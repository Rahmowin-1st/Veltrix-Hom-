import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUp, Mic, Plus, Square, X } from 'lucide-react'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { ContextAttachSheet } from '@/components/chat/ContextAttachSheet'
import type { Attachment } from '@/components/chat/AttachSheet'
import { sourceApi } from '@/lib/api'
import { createVoiceInput, type VoiceInputController } from '@/lib/voiceInput'
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

const DRAFT_KEY = 'veltrix:general-draft:v5'

export default function General() {
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const settings = useAuthStore((s) => s.settings)
  const setHandoffText = useUIStore((s) => s.setHandoffText)
  const setHandoffAttachment = useUIStore((s) => s.setHandoffAttachment)
  const setActiveSources = useUIStore((s) => s.setActiveSources)
  const setNavHidden = useUIStore((s) => s.setNavHidden)
  const skills = useSkillStore((s) => s.skills)
  const activeSkillId = useSkillStore((s) => s.activeId)
  const loadSkills = useSkillStore((s) => s.load)
  const setSkill = useSkillStore((s) => s.setActive)

  const [text, setText] = useState(() => sessionStorage.getItem(DRAFT_KEY) ?? '')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const voiceRef = useRef<VoiceInputController | null>(null)
  const voiceBaseRef = useRef('')
  const greeting = useRotatingPrompt(settings?.greeting_rotation !== false)

  useEffect(() => {
    setNavHidden(false)
    void loadSkills()
    sourceApi.list().then((r) => setSources(r.sources)).catch(() => {})
  }, [loadSkills, setNavHidden])

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, text)
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [text])

  useEffect(() => {
    voiceRef.current = createVoiceInput({
      lang: profile?.school_language === 'ru' ? 'ru-RU' : 'uz-UZ',
      onText: (voice) => setText([voiceBaseRef.current, voice].filter(Boolean).join(' ').trim()),
      onState: setListening,
    })
    setVoiceSupported(voiceRef.current.supported)
    return () => voiceRef.current?.stop()
  }, [profile?.school_language])

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
    sessionStorage.removeItem(DRAFT_KEY)
    window.setTimeout(() => navigate('/chat'), 420)
  }

  return (
    <div data-scroll-root className="v5-general hide-sb">
      <div className="v5-general-core">
        <motion.div initial={{ scale: .86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 21 }}>
          <VeltrixMark size={58}/>
        </motion.div>

        <div className="v5-greeting" aria-live="polite">
          <span>{first && greeting.startsWith('Bugun') ? `${first}, ` : ''}{greeting}</span><span className="v5-caret" />
        </div>

        {(activeSkill || selectedSources.length > 0) && (
          <motion.div className="row hide-sb" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }}
            style={{ width: 'min(680px,100%)', overflowX: 'auto', gap: 7 }}>
            {activeSkill && <span className="source-pill source-pill-activating"><span data-emoji>{activeSkill.emoji}</span><span>{activeSkill.name}</span><button onClick={() => setSkill(null)} aria-label="Skillni olib tashlash" style={clearBtn}><X size={13}/></button></span>}
            {selectedSources.map((s) => <span key={s.id} className="source-pill source-pill-activating"><span data-emoji>{s.emoji}</span><span className="truncate" style={{ maxWidth: 190 }}>{s.title}</span><button onClick={() => setSourceIds((ids) => ids.filter((id) => id !== s.id))} aria-label="Manbani olib tashlash" style={clearBtn}><X size={13}/></button></span>)}
          </motion.div>
        )}

        <motion.div className="v5-hero-composer" data-focused={focused} data-sending={sending}
          initial={{ opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: .08, duration: .44, ease: [0.16,1,.3,1] }}>
          {attachment && (
            <div className="row" style={{ padding: '2px 5px 9px', gap: 10 }}>
              {attachment.kind === 'image' ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" width={44} height={44} style={{ borderRadius: 13, objectFit: 'cover' }}/>
                : <span className="v5-source-icon" style={{ '--source-color': attachment.kind === 'audio' ? '#8B5CF6' : '#12A46B', width: 44, height: 44 } as React.CSSProperties}>{attachment.ext}</span>}
              <span className="col" style={{ minWidth: 0, gap: 1, flex: 1 }}><strong className="truncate" style={{ fontSize: 13 }}>{attachment.name}</strong><span className="micro">{Math.max(1, Math.round(attachment.size / 1024))} KB</span></span>
              <button className="v5-round-icon" style={{ width: 36, height: 36 }} onClick={() => setAttachment(null)}><X size={17}/></button>
            </div>
          )}
          <div className="v5-composer-row">
            <button className="v5-round-icon" style={{ width: 52, height: 52, borderRadius: 19 }} onClick={() => setSheetOpen(true)} aria-label="Biriktirish"><Plus size={24}/></button>
            <textarea ref={textareaRef} value={text} rows={1} className="v5-composer-input"
              onChange={(e) => setText(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              placeholder="Savol yoki vazifani yozing…" onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey && window.innerWidth > 760){e.preventDefault();send()} }}/>
            {voiceSupported && <button className="v5-round-icon" style={{ width: 48, height: 48, borderRadius: 18, color: listening ? 'var(--danger)' : undefined }}
              onClick={() => { if (listening) voiceRef.current?.stop(); else { voiceBaseRef.current = text.trim(); voiceRef.current?.start() } }} aria-label={listening ? 'Ovozni to‘xtatish' : 'Ovoz bilan kiritish'}>{listening ? <Square size={18}/> : <Mic size={21}/>}</button>}
            <button className="v5-send" disabled={!canSend} onClick={send} aria-label="Yuborish"><ArrowUp size={23} strokeWidth={2.8}/></button>
          </div>
        </motion.div>

        {error && <motion.div role="alert" className="surface" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--danger)', padding: '10px 14px', borderRadius: 17 }}>{error}</motion.div>}
        <p className="micro" style={{ textAlign: 'center', maxWidth: 520 }}>Matn, ovoz, rasm, audio, fayl, manba va skill bir so‘rovda ishlashi mumkin.</p>
      </div>

      <ContextAttachSheet open={sheetOpen} onClose={() => setSheetOpen(false)} sources={sources} skills={skills}
        selectedSourceIds={sourceIds} activeSkillId={activeSkillId}
        onToggleSource={(source) => setSourceIds((ids) => ids.includes(source.id) ? ids.filter((id) => id !== source.id) : [...ids, source.id])}
        onSelectSkill={(skill) => { setSkill(skill?.id ?? null); if (skill) setSheetOpen(false) }}
        onPickAttachment={setAttachment} onCreateSource={() => navigate('/manbalar?add=1')}
        onCreateSkill={() => navigate('/skills?add=1')} onError={setError}/>
    </div>
  )
}

function useRotatingPrompt(enabled: boolean) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const target = PROMPTS[index]!
    if (!enabled) { setVisible(target); return }
    let delay = deleting ? 25 : 42
    if (!deleting && visible === target) delay = 5000
    if (deleting && visible.length <= 1) delay = 65
    const timer = window.setTimeout(() => {
      if (!deleting && visible === target) { setDeleting(true); return }
      if (deleting) {
        if (visible.length > 1) setVisible((v) => v.slice(0, -1))
        else { setDeleting(false); setIndex((i) => (i + 1) % PROMPTS.length) }
      } else setVisible(target.slice(0, visible.length + 1))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [deleting, enabled, index, visible])
  return visible || PROMPTS[index]!.slice(0, 1)
}

const clearBtn: React.CSSProperties = { display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: 'inherit', padding: 3, cursor: 'pointer' }
