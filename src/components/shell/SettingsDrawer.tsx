import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { animate as animateMotion, motion, useMotionValue, useTransform } from 'framer-motion'
import {
  Calculator, ClipboardList, FolderKanban, Gamepad2,
  GraduationCap, Home, Languages, LibraryBig, MessageSquareText,
  MoreHorizontal, Search, Settings, SquarePen, Star,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useUIStore } from '@/store/uiStore'
import { ChatMenu } from '@/components/chat/ChatMenu'
import { tap } from '@/lib/native'
import { shouldSnapOpen } from '@/lib/drawerGesture'

/**
 * One capability launcher. Manbalar belongs here rather than in a duplicate
 * navigation list: in the drawer it reads as a tool you reach for, and the
 * bottom bar already owns it as a destination.
 */
const QUICK_TOOLS = [
  { to: '/manbalar', label: 'Manbalar', Icon: LibraryBig, tone: 'blue' },
  { to: '/talent', label: 'Talentlar', Icon: GraduationCap, tone: 'cyan' },
  { to: '/tarjima', label: 'Tarjima', Icon: Languages, tone: 'teal' },
  { to: '/kalkulyator', label: 'Kalkulyator', Icon: Calculator, tone: 'indigo' },
  { to: '/testlar', label: 'Testlar', Icon: ClipboardList, tone: 'amber' },
  { to: '/oyin', label: "Fan o‘yini", Icon: Gamepad2, tone: 'violet' },
] as const

type MenuState = { chatId: string; anchor: DOMRect | null } | null

interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (to: string) => void
}

/**
 * Permanently mounted, cache-first drawer. Keeping the shell mounted makes the
 * first open immediate and allows the chat edge gesture to reveal it under the
 * user's finger instead of waiting for React to build it after touchend.
 */
export function SettingsDrawer({ open, onClose, onNavigate }: Props) {
  const location = useLocation()
  const profile = useAuthStore((state) => state.profile)
  const chats = useChatStore((state) => state.chats)
  const loadChatsIfStale = useChatStore((state) => state.loadIfStale)
  const projects = useProjectStore((state) => state.projects)
  const loadProjects = useProjectStore((state) => state.load)
  const setSearch = useUIStore((state) => state.setSearch)

  const [menu, setMenu] = useState<MenuState>(null)
  const [interactive, setInteractive] = useState(open)
  const asideRef = useRef<HTMLElement>(null)
  const widthRef = useRef(344)
  const animationRef = useRef<ReturnType<typeof animateMotion> | null>(null)
  const x = useMotionValue(-344)
  const scrimOpacity = useTransform(x, [-344, 0], [0, .44])

  useEffect(() => {
    void loadChatsIfStale()
    void loadProjects()
  }, [loadChatsIfStale, loadProjects])

  useEffect(() => {
    const node = asideRef.current
    if (!node) return
    const update = () => {
      widthRef.current = node.getBoundingClientRect().width || 344
      if (!open && useUIStore.getState().drawerGestureProgress === null) x.set(-widthRef.current)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [open, x])

  const settle = (target: number, then?: () => void) => {
    animationRef.current?.stop()
    animationRef.current = animateMotion(x, target, {
      type: 'spring', stiffness: 390, damping: 40, mass: .78,
      onComplete: then,
    })
  }

  useEffect(() => {
    const progress = useUIStore.getState().drawerGestureProgress
    if (open) {
      setInteractive(true)
      settle(0)
    } else if (progress === null) {
      settle(-widthRef.current, () => setInteractive(false))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe imperatively: touchmove updates a MotionValue without forcing a
  // React render for every pixel of the gesture.
  useEffect(() => useUIStore.subscribe((state, previous) => {
    const progress = state.drawerGestureProgress
    if (progress === previous.drawerGestureProgress) return

    if (progress !== null) {
      animationRef.current?.stop()
      setInteractive(true)
      x.set(-widthRef.current * (1 - progress))
      return
    }

    if (state.drawerOpen) settle(0)
    else settle(-widthRef.current, () => setInteractive(false))
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => animationRef.current?.stop(), [])

  const pinned = useMemo(() => chats.filter((chat) => chat.pinned), [chats])
  const recent = useMemo(() => chats.filter((chat) => !chat.pinned).slice(0, 18), [chats])
  const first = profile?.preferred_name ?? profile?.full_name ?? 'Foydalanuvchi'
  const visible = open || interactive
  const inChat = location.pathname.startsWith('/chat')

  const go = (to: string) => {
    void tap()
    onNavigate(to)
  }

  const showMenu = (chatId: string, anchor: DOMRect | null) => setMenu({ chatId, anchor })

  return (
    <>
      <motion.button
        type="button"
        tabIndex={visible ? 0 : -1}
        aria-label="Menyuni yopish"
        className="v12-drawer-scrim"
        style={{ opacity: scrimOpacity, pointerEvents: visible ? 'auto' : 'none' }}
        onClick={onClose}
      />

      <motion.aside
        ref={asideRef}
        role="dialog"
        aria-modal={visible ? 'true' : undefined}
        aria-label="Veltrix menyusi"
        aria-hidden={!visible}
        {...(!visible ? { inert: '' } : {})}
        className="v12-drawer"
        style={{ x, pointerEvents: visible ? 'auto' : 'none' }}
        drag={open ? 'x' : false}
        dragConstraints={{ left: -380, right: 0 }}
        dragElastic={{ left: .08, right: 0 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          // Same decision the edge-open gesture uses, so opening and closing
          // feel like one system rather than two thresholds.
          const progress = 1 + x.get() / widthRef.current
          const shouldClose = !shouldSnapOpen({
            progress: Math.min(1, Math.max(0, progress)),
            velocity: info.velocity.x / 1000,   // px/s → px/ms
            wasOpen: true,
          })
          if (shouldClose) onClose()
          else settle(0)
        }}
      >
        {/*
          Account and the return control share one row. The return action used
          to be a full-width list item, which made it read as another
          navigation entry; as a compact control beside the identity it reads
          as what it is — "take me back" — and costs no vertical space.
        */}
        <div className="v12-drawer-top">
          <button type="button" className="v12-drawer-account" onClick={() => go('/settings')}>
            <span className="v12-drawer-avatar" aria-hidden>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" />
                : (first[0] ?? 'V').toUpperCase()}
            </span>
            <span className="v12-drawer-account-copy">
              <strong className="truncate">{first}</strong>
              <span>{profile?.grade ? `${profile.grade}-sinf` : 'Profil va sozlamalar'}</span>
            </span>
          </button>

          <button type="button" className="v12-drawer-return-btn"
            onClick={inChat ? onClose : () => go('/general')}
            aria-label={inChat ? 'Chatga qaytish' : 'Bosh sahifaga qaytish'}
            title={inChat ? 'Chatga qaytish' : 'Bosh sahifa'}>
            {inChat ? <MessageSquareText size={19} /> : <Home size={19} />}
          </button>
        </div>

        <div className="v12-drawer-body hide-sb" data-scroll-root>

          <section className="v12-drawer-section" aria-labelledby="quick-tools-title">
            <SectionTitle id="quick-tools-title" label="Tezkor vositalar" />
            <div className="v12-tool-rail" role="group" aria-label="Tezkor vositalar">
              {QUICK_TOOLS.map(({ to, label, Icon, tone }) => (
                <button key={to} type="button" className="v12-tool" data-tone={tone}
                  onClick={() => go(to)}>
                  {/* Selective depth: capability icons earn a 3D tile because
                      it aids recognition in a dense list. Chat rows and utility
                      icons below stay flat on purpose. */}
                  <span className="v12-tool-glyph" aria-hidden><Icon size={19} strokeWidth={2} /></span>
                  <span className="v12-tool-label">{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="v12-drawer-section" aria-labelledby="starred-title">
            <SectionTitle id="starred-title" icon={<Star size={15} />} label="Yulduzlangan" count={pinned.length} />
            {pinned.length === 0
              ? <SidebarEmpty text="Yulduzlangan chat yo‘q" />
              : pinned.map((chat) => (
                  <ChatRow key={chat.id} title={chat.title ?? 'Yangi chat'}
                    active={location.pathname === `/chat/${chat.id}`}
                    onOpen={() => go(`/chat/${chat.id}`)}
                    onMenu={(anchor) => showMenu(chat.id, anchor)} />
                ))}
          </section>

          <section className="v12-drawer-section" aria-labelledby="projects-title">
            <SectionTitle id="projects-title" icon={<FolderKanban size={15} />} label="Loyihalar" count={projects.length} />
            {projects.length === 0
              ? <SidebarEmpty text="Hali loyiha yo‘q" />
              : projects.slice(0, 10).map((project) => (
                  <button key={project.id} type="button" className="v12-project-row"
                    onClick={() => go(`/loyiha/${project.id}`)}>
                    <span data-emoji style={{ background: `${project.color}1A`, color: project.color }}>{project.emoji}</span>
                    <span className="v12-project-copy">
                      <strong className="truncate">{project.name}</strong>
                      <small>{project.chat_count ?? 0} chat · {project.source_count ?? 0} manba</small>
                    </span>
                  </button>
                ))}
          </section>

          <section className="v12-drawer-section" aria-labelledby="recent-title">
            <SectionTitle id="recent-title" icon={<MessageSquareText size={15} />} label="So‘nggi chatlar" count={recent.length} />
            {recent.length === 0
              ? <SidebarEmpty text="Hali chat yo‘q" />
              : recent.map((chat) => (
                  <ChatRow key={chat.id} title={chat.title ?? 'Yangi chat'}
                    active={location.pathname === `/chat/${chat.id}`}
                    onOpen={() => go(`/chat/${chat.id}`)}
                    onMenu={(anchor) => showMenu(chat.id, anchor)} />
                ))}
          </section>
        </div>

        <div className="v12-drawer-bottom">
          <button type="button" className="v12-drawer-search-action"
            onClick={() => {
              void tap()
              // Swap the drawer overlay for search at the same history depth;
              // do not stack a search entry on top of a drawer entry.
              onClose()
              setSearch(true)
            }}>
            <Search size={21} /><span>Qidirish</span>
          </button>
          <button type="button" className="v12-drawer-circle" onClick={() => go('/settings')} aria-label="Sozlamalar">
            <Settings size={21} />
          </button>
          <button type="button" className="v12-drawer-circle v12-drawer-new" onClick={() => go('/general')} aria-label="Yangi chat">
            <SquarePen size={21} />
          </button>
        </div>
      </motion.aside>

      {menu && (() => {
        const selected = chats.find((chat) => chat.id === menu.chatId)
        return selected
          ? <ChatMenu chat={selected} anchorRect={menu.anchor} onClose={() => setMenu(null)} />
          : null
      })()}
    </>
  )
}

function SectionTitle({ id, icon, label, count }: {
  id: string
  icon?: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <div id={id} className="v12-drawer-section-title">
      {icon}<span>{label}</span>{typeof count === 'number' && <small>{count}</small>}
    </div>
  )
}

function SidebarEmpty({ text }: { text: string }) {
  return <p className="v12-drawer-empty">{text}</p>
}

function ChatRow({ title, active, onOpen, onMenu }: {
  title: string
  active: boolean
  onOpen: () => void
  onMenu: (anchor: DOMRect | null) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef({ x: 0, y: 0 })
  const suppressOpenRef = useRef(false)

  const cancel = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    document.removeEventListener('scroll', cancel, true)
  }

  useEffect(() => cancel, [])

  const openMenu = () => {
    suppressOpenRef.current = true
    void tap('medium')
    onMenu(rowRef.current?.getBoundingClientRect() ?? null)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if ((event.target as Element).closest('[data-menu-trigger]')) return
    startRef.current = { x: event.clientX, y: event.clientY }
    cancel()
    document.addEventListener('scroll', cancel, true)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      document.removeEventListener('scroll', cancel, true)
      openMenu()
    }, 470)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (timerRef.current === null) return
    const dx = event.clientX - startRef.current.x
    const dy = event.clientY - startRef.current.y
    if (Math.hypot(dx, dy) > 10) cancel()
  }

  return (
    <div ref={rowRef} className="v12-chat-row" data-active={active ? '' : undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={cancel} onPointerCancel={cancel}
      onContextMenu={(event) => { event.preventDefault(); cancel(); openMenu() }}>
      <button type="button" className="v12-chat-row-main" onClick={(event) => {
        if (suppressOpenRef.current) {
          event.preventDefault()
          suppressOpenRef.current = false
          return
        }
        onOpen()
      }}>
        <MessageSquareText size={17} />
        <span className="truncate">{title}</span>
      </button>
      <button type="button" data-menu-trigger className="v12-chat-row-menu"
        onClick={() => onMenu(rowRef.current?.getBoundingClientRect() ?? null)}
        aria-label="Chat amallari">
        <MoreHorizontal size={18} />
      </button>
    </div>
  )
}
