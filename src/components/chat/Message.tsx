import { memo, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronDown, Copy, FileAudio, FileText, RotateCcw, Square, Volume2 } from 'lucide-react'
import { AnswerBlocks } from './AnswerBlocks'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { useAuthStore } from '@/store/authStore'
import type { AnswerBlock, Citation, SourceMode } from '@/types'

export interface TurnAttachment { mimeType: string; data: string; kind?: 'image'|'audio'|'file'; name?: string; size?: number; ext?: string }
export interface Turn {
  id: string
  role: 'user' | 'assistant'
  text?: string
  image?: TurnAttachment | null
  blocks?: AnswerBlock[]
  subject?: string | null
  topic?: string
  citations?: Citation[]
  followups?: string[]
  sourceMode?: SourceMode
  pagesUsed?: number[]
  cached?: boolean
  error?: string
}

export const UserMessage = memo(function UserMessage({ turn }: { turn: Turn }) {
  const profile = useAuthStore((s) => s.profile)
  const initials = (profile?.preferred_name || profile?.full_name || 'S').trim().slice(0, 1).toUpperCase()
  return <motion.div className="v5-user-row" initial={{ opacity: 0, y: 9, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .24, ease: [0.16,1,0.3,1] }}>
    <div style={{ maxWidth: 'min(78%,620px)', display: 'grid', gap: 7, justifyItems: 'end' }}>
      {turn.image && <UserAttachment attachment={turn.image}/>} 
      {turn.text && <div className="v5-user-bubble">{turn.text}</div>}
    </div>
    <span className="v5-avatar" aria-label="Foydalanuvchi">
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="Profil"/> : <strong style={{ color: 'var(--brand)' }}>{initials}</strong>}
    </span>
  </motion.div>
})

function UserAttachment({ attachment }: { attachment: TurnAttachment }) {
  const kind = attachment.kind ?? (attachment.mimeType.startsWith('image/') ? 'image' : attachment.mimeType.startsWith('audio/') ? 'audio' : 'file')
  if (kind === 'image') return <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="Yuborilgan rasm" style={{ maxWidth: 230, maxHeight: 260, borderRadius: 22, objectFit: 'cover', border: '1px solid rgba(255,255,255,.6)', boxShadow: '0 13px 32px rgba(10,108,255,.18)' }}/>
  const Icon = kind === 'audio' ? FileAudio : FileText
  return <div className="v5-user-bubble row" style={{ gap: 9, padding: '10px 13px' }}><Icon size={19}/><span className="truncate" style={{ maxWidth: 210 }}>{attachment.name || (kind === 'audio' ? 'Audio' : 'Fayl')}</span></div>
}

export const AssistantMessage = memo(function AssistantMessage({ turn, onFollowup, onRetry }: { turn: Turn; onFollowup: (text:string)=>void; onRetry?:()=>void }) {
  return <motion.div className="v5-ai-row" initial={{ opacity: 0, y: 10, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .28, ease: [0.16,1,0.3,1] }}>
    <span className="v5-avatar"><VeltrixMark size={27} alt="Veltrix"/></span>
    <div className="v5-ai-body">
      {(turn.subject || turn.pagesUsed?.length || turn.sourceMode === 'auto') && <div className="row hide-sb" style={{ gap: 6, overflowX: 'auto' }}>
        {turn.subject && <span className="chip chip-strong">{turn.subject}</span>}
        {turn.topic && <span className="chip">{turn.topic}</span>}
        {!!turn.pagesUsed?.length && <span className="chip">{turn.pagesUsed.join(', ')}-bet</span>}
        {turn.sourceMode === 'auto' && <span className="chip">Avtomatik manba</span>}
        {turn.cached && <span className="chip">Tezkor javob</span>}
      </div>}
      <div className="v5-ai-card">
        {turn.error ? <ErrorTurn message={turn.error} onRetry={onRetry}/> : <AnswerBlocks blocks={turn.blocks ?? []}/>} 
        {!!turn.citations?.length && <Citations citations={turn.citations}/>} 
        {!turn.error && <MessageActions turn={turn}/>} 
      </div>
      {!!turn.followups?.length && <div className="row hide-sb" style={{ gap: 7, overflowX: 'auto' }}>
        {turn.followups.map((followup, index) => <button key={`${followup}-${index}`} className="v5-action-chip" onClick={() => onFollowup(followup)}>{followup}</button>)}
      </div>}
    </div>
  </motion.div>
})

function ErrorTurn({ message, onRetry }: { message:string; onRetry?:()=>void }) {
  return <div role="alert" style={{ display: 'grid', gap: 10, color: 'var(--danger)' }}><span>{message}</span>{onRetry && <button className="v5-action-chip" style={{ justifySelf: 'start' }} onClick={onRetry}><RotateCcw size={15}/> Qayta urinish</button>}</div>
}

function Citations({ citations }: { citations:Citation[] }) {
  const [open,setOpen] = useState(false)
  return <div className="surface-2" style={{ marginTop: 12, padding: '9px 10px', borderRadius: 17 }}>
    <button className="row" onClick={() => setOpen((value) => !value)} aria-expanded={open} style={{ width:'100%', border:0, background:'transparent', color:'var(--text-2)', cursor:'pointer', font:'inherit', padding:0 }}>
      <ChevronDown size={15} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition:'transform 180ms var(--ease)' }}/><strong style={{ fontSize:12 }}>Manba · {citations.length} ta dalil</strong>
    </button>
    {open && <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} style={{ display:'grid', gap:8, paddingTop:9 }}>
      {citations.map((citation,index) => <div key={`${citation.page}-${index}`}><span className="micro">{citation.page}-bet{citation.ref ? ` · ${citation.ref}` : ''}</span>{citation.quote && <blockquote style={{ margin:'4px 0 0', paddingLeft:10, borderLeft:'2px solid var(--brand)', color:'var(--text-2)', fontSize:12, lineHeight:1.55 }}>{citation.quote}</blockquote>}</div>)}
    </motion.div>}
  </div>
}

function MessageActions({ turn }: { turn:Turn }) {
  const [copied,setCopied] = useState(false)
  const [speaking,setSpeaking] = useState(false)
  const settings = useAuthStore((s) => s.settings)
  const profile = useAuthStore((s) => s.profile)
  const plain = useMemo(() => blocksToText(turn.blocks ?? []), [turn.blocks])
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel() }, [canSpeak])

  const copy = async () => { try { await navigator.clipboard.writeText(plain); setCopied(true); window.setTimeout(()=>setCopied(false),1500) } catch { /* blocked */ } }
  const speak = () => {
    if (!canSpeak) return
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const utterance = new SpeechSynthesisUtterance(plain)
    utterance.lang = profile?.school_language === 'en' ? 'en-US' : profile?.school_language === 'ru' ? 'ru-RU' : 'uz-UZ'
    utterance.rate = settings?.voice_rate ?? 1
    utterance.volume = settings?.voice_volume ?? 1
    const voices = window.speechSynthesis.getVoices()
    const selected = settings?.voice_name ? voices.find((voice) => voice.name === settings.voice_name) : undefined
    if (selected) utterance.voice = selected
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false)
    setSpeaking(true); window.speechSynthesis.speak(utterance)
  }
  return <div className="v5-message-actions" style={{ marginTop:12 }}>
    <button className="v5-action-chip" onClick={copy}>{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Nusxalandi' : 'Nusxalash'}</button>
    {canSpeak && <button className="v5-action-chip" onClick={speak}>{speaking ? <Square size={14}/> : <Volume2 size={14}/>} {speaking ? 'To‘xtatish' : 'O‘qib berish'}</button>}
  </div>
}

function blocksToText(blocks:AnswerBlock[]) {
  const output:string[]=[]
  for (const block of blocks) {
    switch(block.type) {
      case 'answer': output.push(`Javob: ${block.text}`); break
      case 'steps': output.push(block.items.map((item,index)=>`${index+1}. ${item}`).join('\n')); break
      case 'formula': output.push(block.latex); break
      case 'rule': case 'note': case 'warning': output.push(block.text); break
      case 'code': output.push(block.code); break
      case 'translation': output.push(`${block.original}\n${block.translated}`); break
      case 'given': output.push(block.items.map((item)=>`${item.symbol} = ${item.value}`).join(', ')); break
      case 'table': output.push([block.headers.join(' | '),...block.rows.map((row)=>row.join(' | '))].join('\n')); break
      case 'timeline': output.push(block.items.map((item)=>`${item.date}: ${item.event}`).join('\n')); break
      case 'compare': output.push(`To‘g‘ri: ${block.correct.join(', ')}. Noto‘g‘ri: ${block.wrong.join(', ')}`); break
      case 'chips': output.push(block.items.join(', ')); break
      case 'quiz': output.push(`${block.question}\n${block.options.join('\n')}`); break
      case 'source_not_found': output.push(`Manba topilmadi: ${block.searched}`); break
    }
  }
  return output.join('\n\n')
}
