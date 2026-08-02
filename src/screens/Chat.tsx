import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Calculator, Image as ImageIcon, BookOpen, Languages, CheckCircle2, Lightbulb, ArrowDown,
} from 'lucide-react'
import { UserMessage, AssistantMessage, type Turn } from '@/components/chat/Message'
import { ChatComposer, type Attachment } from '@/components/chat/ChatComposer'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { api, sourceApi } from '@/lib/api'
import { useChatStore, localTitle } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useAuthStore } from '@/store/authStore'
import { useUIStore } from '@/store/uiStore'
import { useSkillStore } from '@/store/skillStore'
import { readChat, writeChat } from '@/lib/cache'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import type { AnswerBlock, Source } from '@/types'

const LOADING_STEPS = [
  'Fan aniqlanmoqda…',
  'Manba ochilmoqda…',
  "Matn o'qilmoqda…",
  'Javob tayyorlanmoqda…',
]

export default function Chat() {
  const { chatId: routeChatId } = useParams()
  const navigate = useNavigate()

  const profile = useAuthStore((s) => s.profile)
  const chats = useChatStore((s) => s.chats)
  const upsertLocal = useChatStore((s) => s.upsertLocal)
  const setDraft = useChatStore((s) => s.setDraft)
  const getDraft = useChatStore((s) => s.getDraft)
  const projectById = useProjectStore((s) => s.byId)
  const loadProjects = useProjectStore((s) => s.load)
  const consumeSource = useUIStore((s) => s.consumeSource)
  const consumeProject = useUIStore((s) => s.consumeProject)
  const consumeHandoff = useUIStore((s) => s.consumeHandoff)
  const activeSkillId = useSkillStore((s) => s.activeId)
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
  const chatIdRef = useRef<string | null>(routeChatId ?? null)
  const { containerRef, endRef, onScroll, pinned, scrollToEnd } = useAutoScroll([turns.length, busy])

  const chat = chats.find((c) => c.id === routeChatId)
  const project = projectById(chat?.project_id ?? null)

  useEffect(() => { void loadProjects(); void loadSkills() }, [loadProjects, loadSkills])

  useEffect(() => {
    sourceApi.list()
      .then((r) => {
        setAllSources(r.sources)
        // A source picked in the library opens the chat already attached.
        const handedOver = consumeSource()
        if (handedOver) {
          const match = r.sources.find((s) => s.id === handedOver)
          if (match) setPickedSources([match])
        }
      })
      .catch(() => {})
  }, [consumeSource])

  /* ---- load history when the route changes; never mix chats ---- */
  useEffect(() => {
    chatIdRef.current = routeChatId ?? null
    setPickedSources([])
    setAttachment(null)
    setInput(getDraft(routeChatId ?? null))

    if (!routeChatId) { setTurns([]); return }

    let cancelled = false
    setHistoryLoading(true)

    // Cached turns paint immediately; the network result replaces them.
    void readChat<Turn>(routeChatId).then((cached) => {
      if (cancelled || chatIdRef.current !== routeChatId || !cached?.length) return
      setTurns(cached)
      setHistoryLoading(false)
    })

    api.history(routeChatId)
      .then((res) => {
        if (cancelled || chatIdRef.current !== routeChatId) return
        const fresh = toTurns(res.messages)
        setTurns(fresh)
        void writeChat(routeChatId, fresh)
      })
      .catch(() => { /* keep whatever the cache gave us */ })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeChatId])

  useEffect(() => {
    if (!busy) { setStep(0); return }
    const t = window.setInterval(
      () => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1500)
    return () => window.clearInterval(t)
  }, [busy])

  // A draft written on General is sent the moment the chat mounts.
  const sentHandoff = useRef(false)
  useEffect(() => {
    if (routeChatId || sentHandoff.current) return
    const { text: handed, attachment } = consumeHandoff()
    if (!handed && !attachment) return
    sentHandoff.current = true
    if (attachment) setAttachment(attachment as Attachment)
    window.setTimeout(() => void send(handed ?? ''), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeChatId])

  const handleInput = useCallback((v: string) => {
    setInput(v)
    setDraft(chatIdRef.current ?? 'new', v)
  }, [setDraft])

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim()
    if ((!text && !attachment) || busy) return

    const sentAttachment = attachment
    setInput('')
    setAttachment(null)
    setDraft(chatIdRef.current ?? 'new', '')
    setBusy(true)

    setTurns((t) => [...t, {
      id: crypto.randomUUID(), role: 'user',
      text: text || 'Rasmdagi vazifa', image: sentAttachment,
    }])

    const controller = new AbortController()
    abortRef.current = controller

    let prompt = text || 'Ushbu rasmdagi vazifani bajar.'
    if (translation) prompt = `/tarjima ${translation.from} ${translation.to} ${prompt}`

    // A Skill is an instruction prefix — it never overrides source rules.
    const skill = skillById(activeSkillId)
    if (skill?.instructions) prompt = `[${skill.name}] ${skill.instructions}\n\n${prompt}`

    try {
      const res = await api.sendMessage({
        chatId: chatIdRef.current,
        text: prompt,
        lockedSourceId: pickedSources[0]?.id ?? null,
        image: sentAttachment,
      })

      if (!chatIdRef.current) {
        chatIdRef.current = res.chatId
        // A chat started from a project workspace belongs to it from birth.
        const targetProject = consumeProject()
        upsertLocal({
          id: res.chatId, title: localTitle(text),
          updated_at: new Date().toISOString(),
          project_id: targetProject,
        })
        if (targetProject) void api.patchChat(res.chatId, { project_id: targetProject })
        navigate(`/chat/${res.chatId}`, { replace: true })
      } else {
        upsertLocal({ id: res.chatId, updated_at: new Date().toISOString() })
      }

      setTurns((t) => {
        const next: Turn[] = [...t, {
          id: res.messageId ?? crypto.randomUUID(),
          role: 'assistant' as const,
        blocks: res.blocks,
        subject: res.subject,
        topic: res.topic,
        citations: res.citations,
        followups: res.followups,
          sourceMode: res.sourceMode,
          pagesUsed: res.pagesUsed,
          cached: res.cached,
        }]
        if (chatIdRef.current) void writeChat(chatIdRef.current, next)
        return next
      })
    } catch (e) {
      if (controller.signal.aborted) {
        setTurns((t) => t.slice(0, -1))
      } else {
        setTurns((t) => [...t, {
          id: crypto.randomUUID(), role: 'assistant',
          error: e instanceof Error ? e.message : 'Javob olinmadi. Qayta urinib ko\'ring.',
        }])
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }, [input, attachment, busy, translation, pickedSources, navigate, setDraft,
      upsertLocal, activeSkillId, skillById, consumeProject])

  const stop = () => { abortRef.current?.abort(); setBusy(false) }

  const retry = () => {
    const lastUser = [...turns].reverse().find((t) => t.role === 'user')
    if (!lastUser?.text) return
    setTurns((t) => t.filter((x) => !x.error))
    void send(lastUser.text)
  }

  const empty = turns.length === 0 && !busy && !historyLoading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Context strip: what this conversation is bound to. */}
      {(project || pickedSources.length > 0 || chat?.title) && (
        <div className="row hide-sb" style={{
          gap: 6, overflowX: 'auto', flexShrink: 0,
          padding: '0 var(--s-4) var(--s-2)',
        }}>
          {project && (
            <span className="chip">
              <span data-emoji>{project.emoji}</span> {project.name}
            </span>
          )}
          {pickedSources.map((s) => (
            <span key={s.id} className="chip chip-strong truncate" style={{ maxWidth: 220 }}>
              <span data-emoji>{s.emoji}</span> {s.title}
            </span>
          ))}
        </div>
      )}

      {/* --- scrolling conversation --- */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        data-scroll-root
        className="hide-sb"
        style={{ flex: 1, overflowY: 'auto', paddingInline: 'var(--s-4)', position: 'relative' }}
      >
        <div style={{
          maxWidth: 'var(--content-max)', margin: '0 auto', width: '100%',
          display: 'grid', gap: 'var(--s-5)', paddingTop: 'var(--s-5)',
        }}>
          {historyLoading && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="skeleton" style={{ height: 46, width: '60%', justifySelf: 'end' }} />
              <div className="skeleton" style={{ height: 120 }} />
            </div>
          )}

          {empty && <EmptyChat name={profile?.preferred_name ?? profile?.full_name ?? null}
            grade={profile?.grade ?? null} onPick={(t) => void send(t)} />}

          {turns.map((t) =>
            t.role === 'user'
              ? <UserMessage key={t.id} turn={t} />
              : <AssistantMessage key={t.id} turn={t} onFollowup={handleInput} onRetry={retry} />
          )}

          {busy && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <VeltrixMark size={22} />
              <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                <span className="micro" aria-live="polite">{LOADING_STEPS[step]}</span>
                <div className="skeleton" style={{ height: 66 }} />
                <div className="skeleton" style={{ height: 96, opacity: 0.55 }} />
              </div>
            </div>
          )}

          <div ref={endRef} style={{ height: 4 }} />
        </div>
      </div>

      {!pinned && turns.length > 3 && (
        <button
          className="btn glass"
          onClick={scrollToEnd}
          aria-label="Oxirgi xabarga o'tish"
          style={{
            position: 'absolute', bottom: 'calc(var(--nav-h) + 96px)',
            left: '50%', transform: 'translateX(-50%)',
            height: 36, paddingInline: 12, zIndex: 20,
          }}
        >
          <ArrowDown size={15} /> Oxirgi xabar
        </button>
      )}

      <ChatComposer
        value={input}
        onChange={handleInput}
        onSend={() => void send()}
        onStop={stop}
        busy={busy}
        attachment={attachment}
        setAttachment={setAttachment}
        allSources={allSources}
        context={{
          sources: pickedSources,
          translation,
          projectName: project?.name ?? null,
          skill: skillById(activeSkillId) ?? null,
        }}
        onRemoveSource={(id) => setPickedSources((s) => s.filter((x) => x.id !== id))}
        onAddSource={(s) => setPickedSources((prev) =>
          prev.some((x) => x.id === s.id) ? prev : [...prev, s])}
        onClearSkill={() => useSkillStore.getState().setActive(null)}
        onClearTranslation={() => setTranslation(null)}
        onToggleTranslation={() =>
          setTranslation((t) => (t ? null : { from: 'auto', to: 'uz' }))}
      />
    </div>
  )
}

/* --------------------------- empty state ---------------------------- */

const QUICK = [
  { icon: Calculator, label: 'Masalani yechish', prompt: 'Bu masalani bosqichma-bosqich yech: ' },
  { icon: ImageIcon, label: 'Rasmni tahlil qilish', prompt: 'Rasmdagi vazifani bajar' },
  { icon: BookOpen, label: 'Kitobdan javob topish', prompt: '/kitob ' },
  { icon: Languages, label: 'Tarjima qilish', prompt: '/tarjima en uz ' },
  { icon: CheckCircle2, label: 'Javobni tekshirish', prompt: 'Mening javobimni tekshir: ' },
  { icon: Lightbulb, label: 'Sodda tushuntirish', prompt: 'Bu mavzuni sodda tushuntir: ' },
] as const

function EmptyChat({ name, grade, onPick }: {
  name: string | null; grade: number | null; onPick: (t: string) => void
}) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech'
  const first = name?.split(' ')[0]

  return (
    <div style={{
      display: 'grid', justifyItems: 'center', gap: 'var(--s-5)',
      paddingTop: 'clamp(24px, 8vh, 72px)', textAlign: 'center',
    }}>
      <VeltrixMark size={40} />
      <div style={{ display: 'grid', gap: 5 }}>
        <h1 style={{ fontSize: 'var(--fs-display)' }}>
          {greeting}{first ? `, ${first}` : ''}
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
          Bugun qaysi vazifani bajaramiz?
          {grade ? ` Javoblar ${grade}-sinfga moslanadi.` : ''}
        </p>
      </div>

      <div style={{
        display: 'grid', gap: 8, width: '100%',
        gridTemplateColumns: 'repeat(auto-fit, minmax(158px, 1fr))',
      }}>
        {QUICK.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            onClick={() => onPick(prompt)}
            className="surface"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '12px 13px', minHeight: 48, cursor: 'pointer',
              color: 'var(--text)', fontSize: 'var(--fs-sm)',
              fontFamily: 'var(--font)', textAlign: 'left',
              transition: 'border-color var(--t-hover) var(--ease), transform var(--t-hover) var(--ease)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Icon size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------------------------- history mapping -------------------------- */

interface RawMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string | null
  blocks: AnswerBlock[] | null
  detected_subject: string | null
  source_mode: string | null
}

function toTurns(raw: unknown[]): Turn[] {
  return (raw as RawMessage[])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      text: m.content ?? undefined,
      blocks: m.blocks ?? undefined,
      subject: m.detected_subject,
      sourceMode: (m.source_mode ?? undefined) as Turn['sourceMode'],
    }))
}
