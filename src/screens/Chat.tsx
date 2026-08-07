import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, Menu, MoreHorizontal, SquarePen } from 'lucide-react'
import { UserMessage, AssistantMessage, type Turn } from '@/components/chat/Message'
import { ChatComposer, type Attachment } from '@/components/chat/ChatComposer'
import { ChatSearch, type SearchableTurn } from '@/components/chat/ChatSearch'
import { ChatMenu, type ChatFile } from '@/components/chat/ChatMenu'
import { blocksToPlainText } from '@/lib/blocksToText'
import { progressFromDx, shouldSnapOpen } from '@/lib/drawerGesture'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { activityApi, api, sourceApi } from '@/lib/api'
import { useChatStore, localTitle } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useAuthStore } from '@/store/authStore'
import { tap } from '@/lib/native'
import { useUIStore } from '@/store/uiStore'
import { useSkillStore } from '@/store/skillStore'
import { readChat, writeChat } from '@/lib/cache'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import type { AnswerBlock, Source } from '@/types'

/**
 * A frozen record of the inputs that produced one assistant answer.
 * Retry replays this, not the current UI state.
 */
export interface RequestSnapshot {
  text: string
  attachment: Attachment | null
  sourceIds: string[]
  talentId: string | null
  translation: { from: string; to: string } | null
}

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
  const setDrawerGestureProgress = useUIStore((s) => s.setDrawerGestureProgress)
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchHit, setSearchHit] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  /** Measured composer height → exact bottom inset, never a guessed gap. */
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(96)

  const pendingRequestRef = useRef<{ id: string; text: string; attachment: Attachment | null } | null>(null)
  /**
   * Everything needed to replay a request, keyed by the assistant turn it
   * produced.
   *
   * Retry must resend the ORIGINAL request, not the visible text. A question
   * answered against two sources with a Talent selected is a different request
   * from the same sentence typed alone, and the user may well have changed the
   * source selector since. Capturing the inputs at send time is the only way a
   * replay can be faithful; reading current state at retry time cannot be.
   */
  const requestSnapshots = useRef(new Map<string, RequestSnapshot>())
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

  const send = useCallback(async (
    override?: string,
    overrideAttachment?: Attachment | null,
    reuseRequestId?: string,
    options?: { replaceTurnId?: string; replay?: RequestSnapshot },
  ) => {
    const replay = options?.replay
    const replaceTurnId = options?.replaceTurnId
    const text = (override ?? input).trim()
    const sentAttachment = overrideAttachment ?? attachment
    if ((!text && !sentAttachment) || busy) return

    // A regenerate must not clear the composer: the user may be mid-draft.
    if (!replaceTurnId) { setInput(''); setAttachment(null); setDraft(chatIdRef.current ?? 'new', '') }
    setBusy(true)
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
    if (replaceTurnId) {
      // Regenerating: the question is already on screen. Mark the answer slot
      // as busy instead of asking again.
      setTurns((current) => current.map((item) => item.id === replaceTurnId
        ? { ...item, regenerating: true, error: undefined }
        : item))
    } else {
      setTurns((current) => [...current, optimistic])
    }

    const controller = new AbortController(); abortRef.current = controller
    let prompt = text || 'Ushbu biriktirilgan faylni tahlil qil va vazifani bajar.'
    if (translation) prompt = `/tarjima ${translation.from} ${translation.to} ${prompt}`
    const skill = skillById(activeSkillId)

    // Frozen copy of every input, taken BEFORE the request goes out.
    const snapshot: RequestSnapshot = {
      text,
      attachment: sentAttachment ?? null,
      sourceIds: pickedSources.map((source) => source.id),
      talentId: skill?.id ?? null,
      translation,
    }

    try {
      const result = await api.sendMessage({
        chatId: chatIdRef.current,
        text: prompt,
        // On a replay these come from the snapshot, so the request is
        // reconstructed exactly — even if the user has since changed the
        // source selector or switched Talent.
        lockedSourceId: (replay?.sourceIds ?? snapshot.sourceIds)[0] ?? null,
        lockedSourceIds: replay?.sourceIds ?? snapshot.sourceIds,
        media: sentAttachment ? { mimeType: sentAttachment.mimeType, data: sentAttachment.data, name: sentAttachment.name } : null,
        talentId: replay?.talentId ?? snapshot.talentId,
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
        const produced = { role: 'assistant', ...turn } as Turn
        // Remember how this answer was produced, so its Retry can replay it.
        requestSnapshots.current.set(produced.id, snapshot)
        setTurns((current) => {
          let next: Turn[]
          if (replaceTurnId) {
            // Regenerate: swap the content of the SAME slot. Appending here is
            // what would leave two answers to one question.
            next = current.map((item) => item.id === replaceTurnId
              ? { ...produced, feedback: null }
              : item)
            // The slot keeps its original id so scroll position and any
            // pending feedback target stay valid.
            next = next.map((item) => item.id === produced.id && replaceTurnId !== produced.id
              ? { ...item, id: replaceTurnId }
              : item)
            requestSnapshots.current.set(replaceTurnId, snapshot)
          } else {
            next = [...current, produced]
          }
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

  /**
   * Interactive left-edge drawer gesture. Motion progress is written directly
   * to a MotionValue subscriber in SettingsDrawer, so React does not render on
   * every touchmove. The narrow activation strip avoids stealing content
   * scrolling/text selection and the keyboard owns gestures while visible.
   */
  useEffect(() => {
    let startX = 0
    let startY = 0
    let startTime = 0
    let tracking = false
    let horizontal = false
    const EDGE = 24

    const keyboardOpen = () => (Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset') || '0',
    ) || 0) > 60

    const ownsGesture = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      if (target.closest('input, textarea, select, button, a, [contenteditable="true"], [data-no-drawer-swipe]')) return true
      let node: Element | null = target
      while (node && node !== document.body) {
        if (node.scrollWidth > node.clientWidth + 4) {
          const overflow = getComputedStyle(node).overflowX
          if (overflow === 'auto' || overflow === 'scroll') return true
        }
        node = node.parentElement
      }
      return false
    }

    const clear = () => {
      tracking = false
      horizontal = false
      setDrawerGestureProgress(null)
    }

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch || touch.clientX > EDGE || keyboardOpen() || ownsGesture(event.target)) {
        clear()
        return
      }
      startX = touch.clientX
      startY = touch.clientY
      startTime = performance.now()
      tracking = true
      horizontal = false
      setDrawerGestureProgress(0)
    }

    const onMove = (event: TouchEvent) => {
      if (!tracking) return
      // A second finger means a pinch or a system gesture, not a drawer pull.
      if (event.touches.length !== 1) { clear(); return }
      const touch = event.touches[0]
      if (!touch) return
      const dx = Math.max(0, touch.clientX - startX)
      const dy = Math.abs(touch.clientY - startY)
      if (!horizontal && dy > 10 && dy > dx) { clear(); return }
      if (dx > 5 && dx > dy * 1.25) horizontal = true
      if (!horizontal) return
      setDrawerGestureProgress(progressFromDx(dx, window.innerWidth, false))
    }

    const onEnd = (event: TouchEvent) => {
      if (!tracking) return
      const touch = event.changedTouches[0]
      const dx = touch ? Math.max(0, touch.clientX - startX) : 0
      const velocity = dx / Math.max(1, performance.now() - startTime)
      const progress = progressFromDx(dx, window.innerWidth, false)
      // Fast flick wins on velocity; a slow drag is judged on position.
      if (horizontal && shouldSnapOpen({ progress, velocity, wasOpen: false })) {
        setDrawer(true)
        // Leave progress set: the drawer settles from exactly where the finger
        // left it rather than snapping back and re-animating from closed.
        setDrawerGestureProgress(null)
      } else {
        clear()
      }
      tracking = false
      horizontal = false
    }

    const onCancel = () => clear()
    // A second finger, a system gesture, or the app losing focus must never
    // leave the drawer stranded half-open.
    const onBlur = () => { if (tracking) clear() }
    const onVisibility = () => { if (document.hidden && tracking) clear() }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    window.addEventListener('pointercancel', onCancel, { passive: true })
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      setDrawerGestureProgress(null)
    }
  }, [setDrawer, setDrawerGestureProgress])
  /**
   * Regenerate the answer in an existing assistant slot.
   *
   * A NEW request id is deliberate. The server is idempotent on
   * clientRequestId, so reusing it would replay the stored answer verbatim —
   * correct for "the network dropped, resend", wrong for "give me a better
   * answer". The failure-path `retry` below still reuses its id, because those
   * are two genuinely different intents.
   */
  const regenerate = useCallback((assistantTurnId: string) => {
    if (busy) return
    const snapshot = requestSnapshots.current.get(assistantTurnId)
    if (!snapshot) return
    void send(snapshot.text, snapshot.attachment, undefined, {
      replaceTurnId: assistantTurnId,
      replay: snapshot,
    })
  }, [busy, send])

  const setFeedback = useCallback((turnId: string, value: 'up' | 'down' | null) => {
    // Local, per-message and mutually exclusive. No schema exists for message
    // feedback, and §30 forbids inventing a migration for it, so this is
    // deliberately session state rather than a fabricated persistence path.
    setTurns((current) => current.map((item) => item.id === turnId ? { ...item, feedback: value } : item))
    void tap()
  }, [])

  const retry = () => {
    // Reuse the SAME request id so the server treats this as a replay of the
    // original request rather than a brand-new question.
    const pending = pendingRequestRef.current
    if (pending) { void send(pending.text, pending.attachment, pending.id); return }
    const last = [...turns].reverse().find((t) => t.role === 'user')
    if (last?.text) void send(last.text)
  }
  /** Flattened text per turn so a match inside a rendered block is findable. */
  const searchableTurns = useMemo<SearchableTurn[]>(() => turns.map((turn) => ({
    id: turn.id,
    role: turn.role,
    text: turn.role === 'user' ? (turn.text ?? '') : blocksToPlainText(turn.blocks ?? []),
  })), [turns])

  /** Real attachments from this conversation — never a fabricated list. */
  const chatFiles = useMemo<ChatFile[]>(() => turns.flatMap((turn) => {
    const file = turn.image
    if (!file) return []
    const kind = file.kind ?? (file.mimeType.startsWith('image/') ? 'image'
      : file.mimeType.startsWith('audio/') ? 'audio' : 'file')
    return [{
      id: turn.id,
      name: file.name || (kind === 'image' ? 'Rasm' : kind === 'audio' ? 'Audio' : 'Fayl'),
      kind, mimeType: file.mimeType, data: file.data, size: file.size,
    }]
  }), [turns])

  // Measure the floating composer so the tail spacer matches it exactly.
  useEffect(() => {
    const node = composerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height
      // Threshold avoids a re-render storm from sub-pixel reflow.
      if (height && Math.abs(height - composerHeight) > 2) setComposerHeight(height)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [composerHeight])

  const empty = turns.length === 0 && !busy && !historyLoading

  return (
    <div className="v5-chat-screen">
      {/*
        No header. The old fixed panel reserved a hard block at the top and
        carried a back arrow the system Back already provides. Messages now
        scroll behind a pure-visual fade curtain instead — pointer-events:none,
        so it never intercepts a scroll or a tap.
      */}
      <div className="v5-chat-curtain-top" aria-hidden />

      {/* Floating controls, not a header: two small islands over the fade, so
          the message list still scrolls the full height behind them. */}
      <div className="v15-chat-controls">
        <button type="button" className="v15-ctl v15-ctl-single"
          onClick={() => { void tap(); setDrawer(true) }} aria-label="Menyu">
          <Menu size={20} />
        </button>

        <div className="v15-ctl v15-ctl-group">
          <button type="button" onClick={() => { void tap(); navigate('/general') }}
            aria-label="Yangi chat"><SquarePen size={19} /></button>
          <span className="v15-ctl-sep" aria-hidden />
          <button type="button" aria-label="Chat amallari" aria-haspopup="menu"
            onClick={(event) => {
              setMenuAnchor(event.currentTarget.getBoundingClientRect())
              setMenuOpen(true)
            }}><MoreHorizontal size={19} /></button>
        </div>
      </div>

      {searchOpen && (
        <ChatSearch
          turns={searchableTurns}
          onClose={() => { setSearchOpen(false); setSearchHit(null) }}
          onNavigate={(turnId) => {
            setSearchHit(turnId)
            document.getElementById(`turn-${turnId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }}
        />
      )}

      <div ref={containerRef} onScroll={onScroll} data-scroll-root className="v5-chat-scroll hide-sb">
        <div className="v5-chat-inner">
          {historyLoading && <><div className="skeleton" style={{ height: 56, width: '58%', justifySelf: 'end' }}/><div className="skeleton" style={{ height: 170 }}/></>}
          {empty && <ChatEmpty name={profile?.preferred_name ?? profile?.full_name ?? null}/>} 
          {turns.map((turn) => turn.role === 'user'
            ? <UserMessage key={turn.id} turn={turn}/>
            : <AssistantMessage key={turn.id} turn={turn} onFollowup={handleInput} onRetry={retry}
                onRegenerate={requestSnapshots.current.has(turn.id) ? regenerate : undefined}
                onFeedback={setFeedback} searchHit={searchHit === turn.id}/>)}
          {busy && <div className="v5-ai-row"><div className="v5-ai-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="typing"><span/><span/><span/></span><span className="micro" aria-live="polite">{LOADING_STEPS[step]}</span></div></div>}
          {/*
            Dynamic tail spacer. The composer floats above the list, so without
            this the final answer's action row sits underneath it. The height
            is the MEASURED composer height plus the safe area — not a fixed
            blank gap, so it stays correct when the composer grows with a long
            draft, an attachment or the action rail.
          */}
          <div ref={endRef} aria-hidden
            style={{ height: composerHeight + 18 }}/>
        </div>
      </div>

      {/* Bottom curtain sits BEHIND the composer: purely visual, so the
          composer reads as floating rather than sitting on a white panel. */}
      <div className="v5-chat-curtain-bottom" aria-hidden />

      {!pinned && turns.length > 3 && (
        <button type="button" className="v5-scroll-end" onClick={scrollToEnd}
          aria-label="Oxirgi xabarga o‘tish">
          <ArrowDown size={18} strokeWidth={2.4}/>
        </button>
      )}

      <div ref={composerRef} className="v15-composer-float">
      <ChatComposer value={input} onChange={handleInput} onSend={() => void send()} onStop={stop} busy={busy}
        attachment={attachment} setAttachment={setAttachment} allSources={allSources}
        context={{ sources: pickedSources, translation, projectName: project?.name ?? null, skill: skillById(activeSkillId) ?? null }}
        onRemoveSource={(id) => setPickedSources((current) => current.filter((source) => source.id !== id))}
        onAddSource={(source) => setPickedSources((current) => current.some((item) => item.id === source.id) ? current.filter((item) => item.id !== source.id) : [...current, source])}
        onClearSkill={() => useSkillStore.getState().setActive(null)} onClearTranslation={() => setTranslation(null)}
        onToggleTranslation={() => setTranslation((current) => current ? null : { from: 'auto', to: 'uz' })}/>
      </div>

      {menuOpen && chat && (
        <ChatMenu chat={chat} anchorRect={menuAnchor}
          onClose={() => setMenuOpen(false)}
          files={chatFiles}
          onFindInChat={() => setSearchOpen(true)}/>
      )}
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
