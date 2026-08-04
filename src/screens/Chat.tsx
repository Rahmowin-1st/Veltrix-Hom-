import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, Menu, MoreVertical, SquarePen } from 'lucide-react'
import { UserMessage, AssistantMessage, type Turn } from '@/components/chat/Message'
import { ChatComposer, type Attachment } from '@/components/chat/ChatComposer'
import { ChatMenu } from '@/components/chat/ChatMenu'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { activityApi, api, sourceApi } from '@/lib/api'
import { useChatStore, localTitle } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useSkillStore } from '@/store/skillStore'
import { readChat, writeChat } from '@/lib/cache'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import type { AnswerBlock, Source } from '@/types'

const LOADING_STEPS = ['Fan aniqlanmoqda…','Manba tekshirilmoqda…','Yechim tuzilmoqda…','Javob bezatilmoqda…']

export default function Chat() {
  const { chatId: routeChatId } = useParams()
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const chats = useChatStore((s) => s.chats)
  const upsertLocal = useChatStore((s) => s.upsertLocal)
  const setDraft = useChatStore((s) => s.setDraft)
  const getDraft = useChatStore((s) => s.getDraft)
  const projectById = useProjectStore((s) => s.byId)
  const loadProjects = useProjectStore((s) => s.load)
  const consumeSources = useUIStore((s) => s.consumeSources)
  const consumeProject = useUIStore((s) => s.consumeProject)
  const consumeHandoff = useUIStore((s) => s.consumeHandoff)
  const setDrawer = useUIStore((s) => s.setDrawer)
  const activeSkillId = useSkillStore((s) => s.activeId)
  const setActiveSkill = useSkillStore((s) => s.setActive)
  const skillById = useSkillStore((s) => s.byId)
  const loadSkills = useSkillStore((s) => s.load)

  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [allSources, setAllSources] = useState<Source[]>([])
  const [pickedSources, setPickedSources] = useState<Source[]>([])
  const [translation, setTranslation] = useState<{ from: string; to: string } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [chatMenuOpen, setChatMenuOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const chatIdRef = useRef<string | null>(routeChatId ?? null)
  const sourcesRef = useRef<Source[]>([])
  const preserveContextOnRouteRef = useRef(false)
  const { containerRef, endRef, onScroll, pinned, scrollToEnd } = useAutoScroll([turns.length, busy])
  const chat = chats.find((c) => c.id === routeChatId)
  const project = projectById(chat?.project_id ?? null)

  useEffect(() => { sourcesRef.current = allSources }, [allSources])
  useEffect(() => { void loadProjects(); void loadSkills() }, [loadProjects, loadSkills])

  useEffect(() => {
    setAllSources([]); setPickedSources([])
    if (!userId) return
    let cancelled = false
    sourceApi.list().then((r) => {
      if (cancelled) return
      setAllSources(r.sources)
      const handed = consumeSources()
      if (handed.length) setPickedSources(r.sources.filter((s) => handed.includes(s.id)))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [consumeSources, userId])

  useEffect(() => {
    chatIdRef.current = routeChatId ?? null
    if (preserveContextOnRouteRef.current) preserveContextOnRouteRef.current = false
    else setPickedSources([])
    setAttachment(null)
    setInput(getDraft(routeChatId ?? null))
    if (!routeChatId) { setTurns([]); return }

    let cancelled = false
    setHistoryLoading(true)
    const cachedPromise = userId ? readChat<Turn>(userId, routeChatId) : Promise.resolve(null)
    void cachedPromise.then((cached) => {
      if (cancelled || chatIdRef.current !== routeChatId || !cached?.length) return
      setTurns(cached); setHistoryLoading(false)
    })
    void (async () => {
      try {
        const res = await api.history(routeChatId)
        if (cancelled || chatIdRef.current !== routeChatId) return

        const fresh = toTurns(res.messages)
        setTurns(fresh)
        upsertLocal(res.chat)
        setActiveSkill(res.chat.skill_id ?? null)

        let available = sourcesRef.current
        if (res.sourceIds.length && !available.length) {
          available = (await sourceApi.list()).sources
          if (cancelled || chatIdRef.current !== routeChatId) return
          setAllSources(available)
        }
        setPickedSources(available.filter((source) => res.sourceIds.includes(source.id)))
        if (userId) void writeChat(userId, routeChatId, fresh)
      } catch {
        // The account-keyed cache remains visible when the network is down.
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [routeChatId, getDraft, userId, setActiveSkill, upsertLocal])

  useEffect(() => {
    if (!busy) { setStep(0); return }
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1400)
    return () => window.clearInterval(timer)
  }, [busy])

  const sentHandoff = useRef(false)
  useEffect(() => {
    if (routeChatId || sentHandoff.current) return
    const { text: handed, attachment: handedAttachment } = consumeHandoff()
    if (!handed && !handedAttachment) return
    sentHandoff.current = true
    if (handedAttachment) setAttachment(handedAttachment as Attachment)
    window.setTimeout(() => void send(handed ?? '', handedAttachment as Attachment | null), 80)
  }, [routeChatId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = useCallback((value: string) => {
    setInput(value); setDraft(chatIdRef.current ?? 'new', value)
  }, [setDraft])

  const send = useCallback(async (override?: string, overrideAttachment?: Attachment | null) => {
    const text = (override ?? input).trim()
    const sentAttachment = overrideAttachment ?? attachment
    if ((!text && !sentAttachment) || busy) return

    setInput(''); setAttachment(null); setDraft(chatIdRef.current ?? 'new', ''); setBusy(true)
    const optimistic: Turn = {
      id: crypto.randomUUID(), role: 'user', text: text || 'Biriktirilgan faylni tahlil qil', image: sentAttachment,
    }
    setTurns((current) => [...current, optimistic])

    const controller = new AbortController(); abortRef.current = controller
    let prompt = text || 'Ushbu biriktirilgan faylni tahlil qil va vazifani bajar.'
    if (translation) prompt = `/tarjima ${translation.from} ${translation.to} ${prompt}`
    const skill = skillById(activeSkillId)

    try {
      const response = await api.sendMessage({
        chatId: chatIdRef.current,
        text: prompt,
        lockedSourceId: pickedSources[0]?.id ?? null,
        lockedSourceIds: pickedSources.map((source) => source.id),
        media: sentAttachment ? { mimeType: sentAttachment.mimeType, data: sentAttachment.data, name: sentAttachment.name } : null,
        talentId: skill?.id ?? null,
      }, controller.signal)

      if (!chatIdRef.current) {
        chatIdRef.current = response.chatId
        const targetProject = consumeProject()
        upsertLocal({ id: response.chatId, title: localTitle(text), updated_at: new Date().toISOString(), project_id: targetProject })
        if (targetProject) void api.patchChat(response.chatId, { project_id: targetProject })
        preserveContextOnRouteRef.current = true
        navigate(`/chat/${response.chatId}`, { replace: true })
      } else upsertLocal({ id: response.chatId, updated_at: new Date().toISOString() })

      if (pickedSources.length) void activityApi.log({ kind: 'source_used', points: 2, metadata: { sourceIds: pickedSources.map((source) => source.id), chatId: response.chatId } }).catch(() => {})
      if (skill) void activityApi.log({ kind: 'skill_used', points: 2, metadata: { skillId: skill.id, chatId: response.chatId } }).catch(() => {})

      setTurns((current) => {
        const next: Turn[] = [...current, {
          id: response.messageId ?? crypto.randomUUID(), role: 'assistant', blocks: response.blocks,
          subject: response.subject, topic: response.topic, citations: response.citations,
          followups: response.followups, sourceMode: response.sourceMode,
          pagesUsed: response.pagesUsed, cached: response.cached,
        }]
        if (chatIdRef.current && userId) void writeChat(userId, chatIdRef.current, next)
        return next
      })
    } catch (error) {
      if (controller.signal.aborted) setTurns((current) => current.filter((t) => t.id !== optimistic.id))
      else setTurns((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', error: error instanceof Error ? error.message : 'Javob olinmadi.' }])
    } finally { setBusy(false); abortRef.current = null }
  }, [input, attachment, busy, translation, pickedSources, navigate, setDraft, upsertLocal, activeSkillId, skillById, consumeProject, userId])

  const stop = () => { abortRef.current?.abort(); setBusy(false) }
  const retry = () => {
    const last = [...turns].reverse().find((t) => t.role === 'user')
    if (last?.text) void send(last.text)
  }
  const empty = turns.length === 0 && !busy && !historyLoading

  return (
    <div className="v5-chat-screen">
      <header className="v5-chat-header">
        <button className="v5-round-icon v5-chat-header-menu" onClick={() => setDrawer(true)} aria-label="Chatlar va menyuni ochish" title="Menyu"><Menu size={22}/></button>
        <div className="v5-chat-title"><span className="truncate">Veltrix Hom</span></div>
        <div className="v5-chat-header-actions">
          <button className="v5-round-icon" onClick={() => navigate('/general')} aria-label="Yangi chat" title="Yangi chat"><SquarePen size={21}/></button>
          <button className="v5-round-icon" onClick={() => chat ? setChatMenuOpen(true) : setDrawer(true)} aria-label="Chat amallari" title="Ko‘proq"><MoreVertical size={21}/></button>
        </div>
      </header>

      <div ref={containerRef} onScroll={onScroll} data-scroll-root className="v5-chat-scroll hide-sb">
        <div className="v5-chat-inner">
          {historyLoading && <><div className="skeleton" style={{ height: 56, width: '58%', justifySelf: 'end' }}/><div className="skeleton" style={{ height: 170 }}/></>}
          {empty && <ChatEmpty name={profile?.preferred_name ?? profile?.full_name ?? null}/>} 
          {turns.map((turn) => turn.role === 'user'
            ? <UserMessage key={turn.id} turn={turn}/>
            : <AssistantMessage key={turn.id} turn={turn} onFollowup={handleInput} onRetry={retry}/>)}
          {busy && <div className="v5-ai-row v5-ai-row-loading"><div className="v5-ai-body"><div className="v5-ai-card v5-ai-loading" aria-live="polite"><span>{LOADING_STEPS[step]}</span><span className="typing"><span/><span/><span/></span></div></div></div>}
          <div ref={endRef} style={{ height: 4 }}/>
        </div>
      </div>

      {!pinned && turns.length > 3 && <button className="v5-action-chip" onClick={scrollToEnd} style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 112, zIndex: 22 }}><ArrowDown size={15}/> Oxirgi xabar</button>}


      {chatMenuOpen && chat && <ChatMenu chat={chat} onClose={() => setChatMenuOpen(false)}/>}
      <ChatComposer value={input} onChange={handleInput} onSend={() => void send()} onStop={stop} busy={busy}
        attachment={attachment} setAttachment={setAttachment} allSources={allSources}
        context={{ sources: pickedSources, translation, projectName: project?.name ?? null, skill: skillById(activeSkillId) ?? null }}
        onRemoveSource={(id) => setPickedSources((current) => current.filter((source) => source.id !== id))}
        onAddSource={(source) => setPickedSources((current) => current.some((item) => item.id === source.id) ? current.filter((item) => item.id !== source.id) : [...current, source])}
        onClearSkill={() => useSkillStore.getState().setActive(null)} onClearTranslation={() => setTranslation(null)}
        onToggleTranslation={() => setTranslation((current) => current ? null : { from: 'auto', to: 'uz' })}/>
    </div>
  )
}

function ChatEmpty({ name }: { name: string | null }) {
  const first = name?.split(' ')[0]
  return <div style={{ minHeight: '52vh', display: 'grid', placeItems: 'center', alignContent: 'center', gap: 12, textAlign: 'center' }}>
    <VeltrixMark size={48}/><h1 style={{ fontSize: 'clamp(28px,8vw,44px)' }}>{first ? `${first}, savolingizni yuboring` : 'Savolingizni yuboring'}</h1>
    <p className="muted">Matn, ovoz, rasm, audio, fayl, manba va Talent qo‘llanadi.</p>
  </div>
}

interface RawMessage { id: string; role: 'user'|'assistant'|'system'; content: string|null; blocks: AnswerBlock[]|null; detected_subject: string|null; source_mode: string|null }
function toTurns(raw: unknown[]): Turn[] {
  return (raw as RawMessage[]).filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
    id: m.id, role: m.role as 'user'|'assistant', text: m.content ?? undefined,
    blocks: m.blocks ?? undefined, subject: m.detected_subject,
    sourceMode: (m.source_mode ?? undefined) as Turn['sourceMode'],
  }))
}
