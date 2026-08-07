import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, Check, ChevronRight, FileAudio, FileText, FolderInput, FolderMinus,
  Paperclip, Pencil, Pin, PinOff, Search, Trash2, X,
} from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import { useOverlayRegistration } from '@/hooks/useOverlayRegistration'
import type { ChatSummary } from '@/types'

type View = 'root' | 'rename' | 'project' | 'confirm' | 'files'

interface Props {
  chat: ChatSummary
  onClose: () => void
  anchorRect?: DOMRect | null
  /**
   * Attachments actually present in this conversation's messages. Supplied by
   * the chat screen, which owns the turns — the menu never fetches or invents
   * a file list. Omitted on surfaces (like the sidebar) where the messages are
   * not loaded, and the entry is then hidden rather than shown empty.
   */
  files?: ChatFile[]
  /** Opens in-conversation search. Omitted where there is no conversation. */
  onFindInChat?: () => void
}

export interface ChatFile {
  id: string
  name: string
  kind: 'image' | 'audio' | 'file'
  mimeType: string
  data: string
  size?: number
}

/**
 * Compact anchored chat menu used by ellipsis and touch long-press.
 * It is intentionally not a full-width bottom sheet: the menu stays visually
 * connected to the row that invoked it, like the ChatGPT mobile reference.
 */
export function ChatMenu({ chat, onClose, anchorRect, files, onFindInChat }: Props) {
  const rename = useChatStore((state) => state.rename)
  const togglePin = useChatStore((state) => state.togglePin)
  const moveToProject = useChatStore((state) => state.moveToProject)
  const remove = useChatStore((state) => state.remove)
  const projects = useProjectStore((state) => state.projects)
  const loadProjects = useProjectStore((state) => state.load)

  const [view, setView] = useState<View>('root')
  const [name, setName] = useState(chat.title ?? '')
  const [position, setPosition] = useState({ top: 90, left: 16 })
  const cardRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useOverlayRegistration(true, `chat-menu-${chat.id}`, onClose)

  useEffect(() => { void loadProjects() }, [loadProjects])

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const focusable = cardRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previousFocus.current?.focus?.()
    }
  }, [onClose])

  useLayoutEffect(() => {
    const place = () => {
      const card = cardRef.current
      if (!card) return
      const margin = 10
      const width = card.offsetWidth || 288
      const height = card.offsetHeight || 240
      const anchor = anchorRect ?? new DOMRect(window.innerWidth - 52, 90, 40, 40)

      let left = anchor.right - width
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

      let top = anchor.bottom + 7
      if (top + height > window.innerHeight - margin) top = anchor.top - height - 7
      top = Math.max(margin + safeTop(), Math.min(top, window.innerHeight - height - margin - safeBottom()))
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorRect, view, projects.length])

  const saveRename = async () => {
    const next = name.trim()
    if (!next) return
    await rename(chat.id, next)
    onClose()
  }

  const content = (
    <>
      <motion.button
        type="button"
        aria-label="Menyuni yopish"
        className="v12-chat-menu-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chat amallari"
        className="v12-chat-menu"
        style={{ top: position.top, left: position.left }}
        initial={{ opacity: 0, scale: .94, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: .95, y: 5 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38, mass: .72 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view}
            initial={{ opacity: 0, x: view === 'root' ? -6 : 8 }}
            animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
            transition={{ duration: .12 }}>
            {view === 'root' ? (
              <div className="v12-chat-menu-list" role="menu">
                <MenuItem
                  icon={chat.pinned ? <PinOff size={19} /> : <Pin size={19} />}
                  label={chat.pinned ? 'Yulduzdan olish' : 'Yulduzlash'}
                  onClick={() => { void togglePin(chat.id); onClose() }}
                />
                <MenuItem icon={<Pencil size={19} />} label="Nomini o‘zgartirish"
                  onClick={() => setView('rename')} />
                {chat.project_id ? (
                  <MenuItem icon={<FolderMinus size={19} />} label="Loyihadan chiqarish"
                    onClick={() => { void moveToProject(chat.id, null); onClose() }} />
                ) : (
                  <MenuItem icon={<FolderInput size={19} />} label="Loyihaga qo‘shish"
                    trailing={<ChevronRight size={18} />} onClick={() => setView('project')} />
                )}
                {/* Only offered where the conversation is actually loaded, so
                    the entry can never open an empty or fabricated list. */}
                {files && (
                  <MenuItem icon={<Paperclip size={19} />} label="Yuklangan fayllar"
                    trailing={<span className="v12-menu-count">{files.length}</span>}
                    onClick={() => setView('files')} />
                )}
                {onFindInChat && (
                  <MenuItem icon={<Search size={19} />} label="Chatdan qidirish"
                    onClick={() => { onClose(); onFindInChat() }} />
                )}
                <MenuItem icon={<Trash2 size={19} />} label="O‘chirish" danger
                  onClick={() => setView('confirm')} />
              </div>
            ) : (
              <>
                <MenuHeader
                  title={view === 'rename' ? 'Nomini o‘zgartirish'
                    : view === 'project' ? 'Loyihaga qo‘shish'
                      : view === 'files' ? 'Yuklangan fayllar'
                        : 'Chat o‘chirilsinmi?'}
                  onBack={() => setView('root')} onClose={onClose}
                />

                {view === 'rename' && (
                  <div className="v12-chat-menu-pane">
                    <input autoFocus className="input" value={name} maxLength={120}
                      aria-label="Chat nomi"
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') void saveRename() }} />
                    <button className="btn btn-primary" disabled={!name.trim()} onClick={() => void saveRename()}>
                      Saqlash
                    </button>
                  </div>
                )}

                {view === 'project' && (
                  <div className="v12-chat-menu-list v12-chat-menu-projects">
                    {projects.length === 0 && (
                      <p className="micro" style={{ padding: '14px 12px', lineHeight: 1.55 }}>
                        Hali loyiha yo‘q. Avval Loyihalar bo‘limidan yarating.
                      </p>
                    )}
                    {projects.map((project) => (
                      <MenuItem key={project.id}
                        icon={<span data-emoji>{project.emoji}</span>}
                        label={project.name}
                        trailing={chat.project_id === project.id ? <Check size={17} /> : undefined}
                        onClick={() => { void moveToProject(chat.id, project.id); onClose() }} />
                    ))}
                  </div>
                )}

                {view === 'files' && (
                  <div className="v12-menu-files">
                    {files && files.length > 0 ? files.map((file) => (
                      <a key={file.id} className="v12-menu-file"
                        href={`data:${file.mimeType};base64,${file.data}`}
                        download={file.name} rel="noopener">
                        {file.kind === 'image'
                          ? <img src={`data:${file.mimeType};base64,${file.data}`} alt="" />
                          : <span className="v12-menu-file-icon">
                              {file.kind === 'audio' ? <FileAudio size={17} /> : <FileText size={17} />}
                            </span>}
                        <span className="col" style={{ minWidth: 0, gap: 1, alignItems: 'flex-start' }}>
                          <strong className="truncate">{file.name}</strong>
                          {file.size ? <span className="micro">{Math.max(1, Math.round(file.size / 1024))} KB</span> : null}
                        </span>
                      </a>
                    )) : (
                      <p className="micro" style={{ padding: '14px 6px', textAlign: 'center' }}>
                        Bu chatda hali fayl yuborilmagan.
                      </p>
                    )}
                  </div>
                )}

                {view === 'confirm' && (
                  <div className="v12-chat-menu-pane">
                    <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.55 }}>
                      Bu chat va uning barcha xabarlari o‘chiriladi. Buni qaytarib bo‘lmaydi.
                    </p>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setView('root')}>Bekor</button>
                      <button className="btn btn-danger" style={{ flex: 1 }}
                        onClick={() => { void remove(chat.id); onClose() }}>O‘chirish</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </>
  )

  return createPortal(content, document.body)
}

function MenuHeader({ title, onBack, onClose }: { title: string; onBack: () => void; onClose: () => void }) {
  return (
    <div className="v12-chat-menu-header">
      <button type="button" onClick={onBack} aria-label="Orqaga"><ArrowLeft size={18} /></button>
      <strong className="truncate">{title}</strong>
      <button type="button" onClick={onClose} aria-label="Yopish"><X size={18} /></button>
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger, trailing }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  trailing?: React.ReactNode
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className="v12-chat-menu-item" data-danger={danger ? '' : undefined}>
      <span aria-hidden>{icon}</span>
      <span className="truncate">{label}</span>
      {trailing && <span aria-hidden style={{ marginLeft: 'auto' }}>{trailing}</span>}
    </button>
  )
}

function safeTop(): number {
  return Math.max(0, window.visualViewport?.offsetTop ?? 0)
}
function safeBottom(): number {
  const viewport = window.visualViewport
  if (!viewport) return 0
  return Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
}
