import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileAudio, FileText, Image as ImageIcon, Mic, MicOff, Plus, Send, Square, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ContextAttachSheet } from './ContextAttachSheet'
import type { Attachment } from './AttachSheet'
import { createVoiceInput, type VoiceInputController } from '@/lib/voiceInput'
import { tap } from '@/lib/native'
import { useOnline } from '@/hooks/useOnline'
import { useSkillStore } from '@/store/skillStore'
import type { Skill, Source } from '@/types'

export type { Attachment } from './AttachSheet'

export interface ComposerContext {
  subject?: string | null
  sources: Source[]
  translation: { from: string; to: string } | null
  projectName?: string | null
  skill?: Skill | null
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  attachment: Attachment | null
  setAttachment: (a: Attachment | null) => void
  allSources: Source[]
  context: ComposerContext
  onRemoveSource: (id: string) => void
  onAddSource: (s: Source) => void
  onClearTranslation: () => void
  onClearSkill?: () => void
  onToggleTranslation: () => void
}

const SLASH_COMMANDS = [
  ['/fan ', 'Fan tanlash'], ['/kitob ', 'Kitobni ko‘rsatish'], ['/bet ', 'Bet raqami'],
  ['/qisqa', 'Faqat javob'], ['/toliq', 'Batafsil yechim'], ['/daftar', 'Daftar formati'],
  ['/test ', 'Test yaratish'], ['/tarjima ', 'Tarjima'],
] as const

export function ChatComposer(p: Props) {
  const navigate = useNavigate()
  const online = useOnline()
  const skills = useSkillStore((s) => s.skills)
  const activeSkillId = useSkillStore((s) => s.activeId)
  const setActiveSkill = useSkillStore((s) => s.setActive)
  const loadSkills = useSkillStore((s) => s.load)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const voiceRef = useRef<VoiceInputController | null>(null)
  const voiceBaseRef = useRef('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [listening, setListening] = useState(false)
  const [sendFlash, setSendFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slashQuery, setSlashQuery] = useState<string | null>(null)

  useEffect(() => { void loadSkills() }, [loadSkills])
  useEffect(() => {
    const voice = createVoiceInput({
      onText: (next) => p.onChange([voiceBaseRef.current, next].filter(Boolean).join(' ').trim()),
      onState: setListening,
    })
    voiceRef.current = voice
    return () => voice.stop()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [p.value])

  useEffect(() => {
    const match = p.value.match(/^\/(\w*)$/)
    setSlashQuery(match ? (match[1] ?? '') : null)
  }, [p.value])

  const slashMatches = useMemo(() => {
    if (slashQuery === null) return []
    return SLASH_COMMANDS.filter(([cmd]) => cmd.slice(1).startsWith(slashQuery.toLowerCase()))
  }, [slashQuery])

  const canSend = online && !p.busy && Boolean(p.value.trim() || p.attachment)
  const send = () => {
    if (p.busy) { p.onStop(); return }
    if (!canSend) return
    setSendFlash(true)
    window.setTimeout(() => setSendFlash(false), 820)
    void tap('medium')
    p.onSend()
  }

  const toggleVoice = () => {
    const voice = voiceRef.current
    if (!voice?.supported) { setError('Bu qurilmada ovozli kiritish mavjud emas.'); return }
    if (listening) voice.stop()
    else { voiceBaseRef.current = p.value.trim(); voice.start() }
  }

  const toggleSource = (source: Source) => p.onAddSource(source)
  const chips = buildChips(p)

  return (
    <div className="v5-chat-composer-wrap">
      <div className="v5-chat-composer-shell">
        <AnimatePresence>
          {error && (
            <motion.div role="alert" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="surface-2 row" style={{ marginBottom: 7, padding: '9px 11px', color: 'var(--danger)', borderRadius: 16 }}>
              <span className="micro" style={{ color: 'inherit' }}>{error}</span>
              <button className="v5-action-chip" style={{ marginLeft: 'auto' }} onClick={() => setError(null)}><X size={13}/></button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {chips.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              className="row hide-sb" style={{ gap: 7, overflowX: 'auto', padding: '0 2px 8px' }}>
              {chips.map((chip) => (
                <span key={chip.key} className={chip.source ? 'source-pill source-pill-activating' : 'chip chip-strong'} title={chip.label}>
                  {chip.icon}<span className="truncate" style={{ maxWidth: 205 }}>{chip.label}</span>
                  {chip.onRemove && <button onClick={chip.onRemove} aria-label={`${chip.label}ni olib tashlash`}
                    style={{ display: 'grid', border: 0, background: 'transparent', color: 'inherit', padding: 2, cursor: 'pointer' }}><X size={13}/></button>}
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {slashMatches.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="v5-ai-card" style={{ marginBottom: 8, padding: 6, maxHeight: 240, overflow: 'auto' }}>
              {slashMatches.map(([cmd, label]) => <button key={cmd} className="v5-picker-item" onClick={() => { p.onChange(cmd); taRef.current?.focus() }}>
                <code style={{ color: 'var(--brand)', fontWeight: 700 }}>{cmd.trim()}</code><span>{label}</span>
              </button>)}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="v5-chat-composer" data-focused={focused} data-sending={sendFlash}>
          {p.attachment && <AttachmentPreview attachment={p.attachment} onRemove={() => p.setAttachment(null)}/>} 
          <div className="v5-composer-row">
            <button className="v5-round-icon" style={{ width: 48, height: 48, flex: '0 0 48px' }} onClick={() => setSheetOpen(true)} aria-label="Fayl, manba yoki talent qo‘shish"><Plus size={22}/></button>
            <textarea ref={taRef} className="v5-composer-input" rows={1} value={p.value}
              placeholder="Savol yoki vazifani yuboring…" aria-label="Savol yoki vazifa"
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(e) => p.onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}/>
            <button className="v5-round-icon" style={{ width: 45, height: 45, color: listening ? 'var(--danger)' : 'var(--text-2)' }}
              onClick={toggleVoice} aria-label={listening ? 'Ovozli kiritishni to‘xtatish' : 'Ovoz bilan yozish'}>
              {listening ? <MicOff size={20}/> : <Mic size={20}/>} 
            </button>
            <button className="v5-send" onClick={send} disabled={!p.busy && !canSend} aria-label={p.busy ? 'Javobni to‘xtatish' : 'Yuborish'}>
              {p.busy ? <Square size={18}/> : <Send size={20}/>} 
            </button>
          </div>
        </div>
      </div>

      <ContextAttachSheet open={sheetOpen} onClose={() => setSheetOpen(false)} sources={p.allSources} skills={skills}
        selectedSourceIds={p.context.sources.map((source) => source.id)} activeSkillId={activeSkillId}
        onToggleSource={toggleSource} onSelectSkill={(skill) => { setActiveSkill(skill?.id ?? null); setSheetOpen(false) }}
        onPickAttachment={(attachment) => p.setAttachment(attachment)}
        onCreateSource={() => { setSheetOpen(false); navigate('/manbalar?add=1') }}
        onCreateSkill={() => { setSheetOpen(false); navigate('/talent?add=1') }} onError={setError}/>
    </div>
  )
}

function AttachmentPreview({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const Icon = attachment.kind === 'image' ? ImageIcon : attachment.kind === 'audio' ? FileAudio : FileText
  return <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="surface-2 row"
    style={{ gap: 9, padding: 8, marginBottom: 5, borderRadius: 18 }}>
    {attachment.kind === 'image'
      ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="Biriktirilgan rasm" width={48} height={48} style={{ borderRadius: 13, objectFit: 'cover' }}/>
      : <span className="v5-source-icon" style={{ '--source-color': attachment.kind === 'audio' ? '#8B5CF6' : '#10A56A', width: 46, height: 46 } as React.CSSProperties}><Icon size={20}/></span>}
    <span className="col" style={{ minWidth: 0, gap: 2 }}><strong className="truncate">{attachment.name}</strong><span className="micro">{attachment.ext} · {formatBytes(attachment.size)}</span></span>
    <button className="v5-round-icon" style={{ width: 38, height: 38, marginLeft: 'auto' }} onClick={onRemove} aria-label="Biriktirmani olib tashlash"><X size={17}/></button>
  </motion.div>
}

interface Chip { key: string; label: string; icon?: React.ReactNode; source?: boolean; onRemove?: () => void }
function buildChips(p: Props): Chip[] {
  const result: Chip[] = []
  if (p.context.projectName) result.push({ key: 'project', label: p.context.projectName, icon: <span>📁</span> })
  if (p.context.skill) result.push({ key: 'skill', label: p.context.skill.name, icon: <span>{p.context.skill.emoji}</span>, onRemove: p.onClearSkill })
  if (p.context.subject) result.push({ key: 'subject', label: p.context.subject })
  for (const source of p.context.sources) result.push({ key: source.id, label: source.title, icon: <span>{source.emoji || '📘'}</span>, source: true, onRemove: () => p.onRemoveSource(source.id) })
  if (!p.context.sources.length) result.push({ key: 'auto', label: 'Avtomatik manba', icon: <span>📖</span> })
  if (p.context.translation) result.push({ key: 'translation', label: `${p.context.translation.from} → ${p.context.translation.to}`, icon: <span>文</span>, onRemove: p.onClearTranslation })
  return result
}
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }
