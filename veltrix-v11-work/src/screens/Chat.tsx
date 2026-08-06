import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, Menu, Plus } from 'lucide-react'
import { UserMessage, AssistantMessage, type Turn } from '@/components/chat/Message'
import { ChatComposer, type Attachment } from '@/components/chat/ChatComposer'
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

type RequestStatus = Awaited<ReturnType<typeof api.requestStatus>>

/**
 * Polls the durable request until it leaves the "processing" state or the
 * caller aborts (chat change, unmount, account switch). Backoff starts at the
 * server-suggested delay and grows, capped, so a slow generation neither
 * hammers the API nor spins forever.  (V9 2.7)
 */
async function pollRequestStatus(clientRequestId: string, signal: AbortSignal, firstDelayMs = 1500): Promise<RequestStatus> {
  const MAX_ATTEMPTS = 45
  let delay = Math.max(800, firstDelayMs)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    await new Promise((resolve) => window.setTimeout(resolve, delay))
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    const status = await api.requestStatus(clientRequestId)
    if (status.code !== 'processing') return status
    delay = Math.min(Math.round(delay * 1.4), 6000)
  }
  return { code: 'processing', chatId: null }
}

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

  const abortRef = useRef<AbortController | null>(null)
  // Keeps the last submitted request so Retry can reuse its identity.
  const pendingRequestRef = useRef<{ id: string; text: string; attachment: Attachment | null } | null>(null)
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

  const send = useCallback(async (override?: string, overrideAttachment?: Attachment | null, reuseRequestId?: string) => {
    const text = (override ?? input).trim()
    const sentAttachment = overrideAttachment ?? attachment
    if ((!text && !sentAttachment) || busy) return

    setInput(''); setAttachment(null); setDraft(chatIdRef.current ?? 'new', ''); setBusy(true)
    // One stable id per logical message. The server keys on it, so a
    // double-tap or a retry after a dropped connection can never create a
    // second copy of the same question.
    // Reusing the id on retry is what makes the retry the SAME logical
    // request. Minting a fresh one would defeat idempotency entirely.
    const clientRequestId = reuseRequestId ?? crypto.randomUUID()
    pendingRequestRef.current = { id: clientRequestId, text, attachment: sentAttachment ?? null }
    const optimistic: Turn = {
      id: clientRequestId, role: 'user', text: text || 'Biriktirilgan faylni tahlil qil', image: sentAttachment,
    }
    setTurns((current) => [...current, optimistic])

    const controller = new AbortController(); abortRef.current = controller
    let prompt = text || 'Ushbu biriktirilgan faylni tahlil qil va vazifani bajar.'
    if (translation) prompt = `/tarjima ${translation.from} ${translation.to} ${prompt}`
    const skill = skillById(activeSkillId)

    try {
      const result = await api.sendMessage({
        chatId: chatIdRef.current,
        text: prompt,
        lockedSourceId: pickedSources[0]?.id ?? null,
        lockedSourceIds: pickedSources.map((source) => source.id),
        media: sentAttachment ? { mimeType: sentAttachment.mimeType, data: sentAttachment.data, name: sentAttachment.name } : null,
        talentId: skill?.id ?? null,
        clientRequestId,
      }, controller.signal)

      // Resolves the chat id (new chat), updates the local list, and navigates
      // once — shared by the immediate and polled completion paths.
      const applyChatId = (resolvedChatId: string) => {
        if (!chatIdRef.current) {
          chatIdRef.current = resolvedChatId
          const targetProject = consumeProject()
          upsertLocal({ id: resolvedChatId, title: localTitle(text), updated_at: new Date().toISOString(), project_id: targetProject })
          if (targetProject) void api.patchChat(resolvedChatId, { project_id: targetProject })
          preserveContextOnRouteRef.current = true
          navigate(`/chat/${resolvedChatId}`, { replace: true })
        } else upsertLocal({ id: resolvedChatId, updated_at: new Date().toISOString() })
        if (pickedSources.length) void activityApi.log({ kind: 'source_used', points: 2, metadata: { sourceIds: pickedSources.map((source) => source.id), chatId: resolvedChatId } }).catch(() => {})
        if (skill) void activityApi.log({ kind: 'skill_used', points: 2, metadata: { skillId: skill.id, chatId: resolvedChatId } }).catch(() => {})
      }

      const appendAssistant = (turn: Omit<Turn, 'role'>) => {
        setTurns((current) => {
          const next: Turn[] = [...current, { role: 'assistant', ...turn } as Turn]
          if (chatIdRef.current && userId) void writeChat(userId, chatIdRef.current, next)
          return next
        })
      }

      const showUncertain = () => {
        pendingRequestRef.current = { id: clientRequestId, text, attachment: sentAttachment ?? null }
        setTurns((current) => [...current, {
          id: crypto.randomUUID(), role: 'assistant',
          error: 'Oldingi urinish holati noaniq. Qayta yuborishni tasdiqlang.',
          retryRequestId: clientRequestId,
        }])
      }

      if (result.kind === 'completed') {
        const response = result.response
        applyChatId(response.chatId)
        appendAssistant({
          id: response.messageId ?? crypto.randomUUID(), blocks: response.blocks,
          subject: response.subject, topic: response.topic, citations: response.citations,
          followups: response.followups, sourceMode: response.sourceMode,
          pagesUsed: response.pagesUsed, cached: response.cached,
        })
        pendingRequestRef.current = null
      } else if (result.kind === 'uncertain') {
        showUncertain()
      } else if (result.kind === 'processing') {
        // Another attempt already owns this request (or the answer is still
        // being generated). Poll the durable request instead of re-asking.
        const status = await pollRequestStatus(result.clientRequestId || clientRequestId, controller.signal, result.retryAfterMs)
        if (status.code === 'completed' && status.blocks) {
          if (status.chatId) applyChatId(status.chatId)
          appendAssistant({
            id: status.messageId ?? crypto.randomUUID(), blocks: status.blocks,
            subject: status.subject, sourceMode: status.sourceMode,
          })
          pendingRequestRef.current = null
        } else if (status.code === 'uncertain') {
          showUncertain()
        } else {
          setTurns((current) => [...current, {
            id: crypto.randomUUID(), role: 'assistant',
            error: status.message ?? 'Javob hali tayyor emas. Qayta urinib ko\'ring.',
            retryRequestId: clientRequestId,
          }])
        }
      } else {
        // Hard failure. It may still have succeeded server-side (only the HTTP
        // response was lost), so ask the durable request before showing error.
        let recovered = false
        try {
          const status = await api.requestStatus(clientRequestId)
          if (status.code === 'completed' && status.blocks) {
            if (status.chatId) applyChatId(status.chatId)
            appendAssistant({ id: status.messageId ?? crypto.randomUUID(), blocks: status.blocks, subject: status.subject, sourceMode: status.sourceMode })
            pendingRequestRef.current = null
            recovered = true
          } else if (status.code === 'uncertain') { showUncertain(); recovered = true }
        } catch { /* recovery is best-effort */ }
        if (!recovered) {
          setTurns((current) => [...current, {
            id: crypto.randomUUID(), role: 'assistant',
            error: result.message || 'Javob olinmadi.',
            retryRequestId: clientRequestId,
          }])
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setTurns((current) => current.filter((t) => t.id !== optimistic.id))
      } else {
        // The request may actually have succeeded and only the HTTP response
        // was lost. Ask the server before telling the user it failed.
        let recovered = false
        try {
          const status = await api.requestStatus(clientRequestId)
          if (status.code === 'completed' && status.blocks) {
            setTurns((current) => {
              const next: Turn[] = [...current, {
                id: status.messageId ?? crypto.randomUUID(), role: 'assistant',
                blocks: status.blocks, subject: status.subject, sourceMode: status.sourceMode,
              }]
              if (chatIdRef.current && userId) void writeChat(userId, chatIdRef.current, next)
              return next
            })
            recovered = true
          } else if (status.code === 'uncertain') {
            setTurns((current) => [...current, {
              id: crypto.randomUUID(), role: 'assistant',
              error: 'Oldingi urinish holati noaniq. Qayta yuborishni tasdiqlang.',
              retryRequestId: clientRequestId,
            }])
            recovered = true
          }
        } catch { /* recovery is best-effort */ }

        if (!recovered) {
          setTurns((current) => [...current, {
            id: crypto.randomUUID(), role: 'assistant',
            error: error instanceof Error ? error.message : 'Javob olinmadi.',
            retryRequestId: clientRequestId,
          }])
        }
      }
    } finally { setBusy(false); abortRef.current = null }
  }, [input, attachment, busy, translation, pickedSources, navigate, setDraft, upsertLocal, activeSkillId, skillById, consumeProject, userId])

  const stop = () => { abortRef.current?.abort(); setBusy(false) }
  const retry = () => {
    // Reuse the SAME request id so the server treats this as a replay of the
    // original request rather than a brand-new question.
    const pending = pendingRequestRef.current
    if (pending) { void send(pending.text, pending.attachment, pending.id); return }
    const last = [...turns].reverse().find((t) => t.role === 'user')
    if (last?.text) void send(last.text)
  }
  const empty = turns.length === 0 && !busy && !historyLoading
  const title = project?.name ?? chat?.title ?? 'Yangi chat'

  return (
    <div className="v5-chat-screen">
      <header className="v5-chat-header">
        <button className="v5-round-icon" onClick={() => navigate(-1)} aria-label="Orqaga"><ArrowLeft size={22}/></button>
        <div className="v5-chat-title"><VeltrixMark size={30}/><span className="truncate">{title}</span></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="v5-round-icon" onClick={() => navigate('/general')} aria-label="Yangi chat"><Plus size={22}/></button>
          <button className="v5-round-icon" onClick={() => setDrawer(true)} aria-label="Menyu"><Menu size={20}/></button>
        </div>
      </header>

      <div ref={containerRef} onScroll={onScroll} data-scroll-root className="v5-chat-scroll hide-sb">
        <div className="v5-chat-inner">
          {pickedSources.length > 0 && <div className="row hide-sb" style={{ overflowX: 'auto', gap: 7 }}>
            {pickedSources.map((source) => <span key={source.id} className="source-pill source-pill-activating"><span data-emoji>{source.emoji}</span><span className="truncate" style={{ maxWidth: 200 }}>{source.title}</span></span>)}
          </div>}
          {historyLoading && <><div className="skeleton" style={{ height: 56, width: '58%', justifySelf: 'end' }}/><div className="skeleton" style={{ height: 170 }}/></>}
          {empty && <ChatEmpty name={profile?.preferred_name ?? profile?.full_name ?? null}/>} 
          {turns.map((turn) => turn.role === 'user'
            ? <UserMessage key={turn.id} turn={turn}/>
            : <AssistantMessage key={turn.id} turn={turn} onFollowup={handleInput} onRetry={retry}/>)}
          {busy && <div className="v5-ai-row"><span className="v5-avatar"><VeltrixMark size={25}/></span><div className="v5-ai-body"><div className="v5-ai-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="typing"><span/><span/><span/></span><span className="micro" aria-live="polite">{LOADING_STEPS[step]}</span></div></div></div>}
          <div ref={endRef} style={{ height: 4 }}/>
        </div>
      </div>

      {!pinned && turns.length > 3 && <button className="v5-action-chip" onClick={scrollToEnd} style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 112, zIndex: 22 }}><ArrowDown size={15}/> Oxirgi xabar</button>}

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
