import { useEffect, useState } from 'react'
import {
  Pencil, Pin, PinOff, FolderInput, FolderMinus, Trash2, Check,
} from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useChatStore } from '@/store/chatStore'
import { useProjectStore } from '@/store/projectStore'
import type { ChatSummary } from '@/types'

type View = 'root' | 'rename' | 'project' | 'confirm'

/**
 * One menu for a chat, used from every surface that lists chats.
 * Always a sheet, so it opens the same way on every screen size.
 */
export function ChatMenu({ chat, onClose }: { chat: ChatSummary; onClose: () => void }) {
  const rename = useChatStore((s) => s.rename)
  const togglePin = useChatStore((s) => s.togglePin)
  const moveToProject = useChatStore((s) => s.moveToProject)
  const remove = useChatStore((s) => s.remove)
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.load)

  const [view, setView] = useState<View>('root')
  const [name, setName] = useState(chat.title ?? '')

  useEffect(() => { void loadProjects() }, [loadProjects])

  const title = view === 'confirm' ? "O'chirilsinmi?"
    : view === 'rename' ? 'Nomini o\u02bczgartirish'
    : view === 'project' ? 'Loyihaga ko\u02bcchirish'
    : (chat.title ?? 'Chat')

  return (
    <BottomSheet title={title} onClose={onClose} desktopWidth={380}>
      {view === 'root' && (
        <div style={{ display: 'grid', gap: 3 }}>
          <Item icon={<Pencil size={18} />} label="Nomini o'zgartirish"
            onClick={() => setView('rename')} />
          <Item
            icon={chat.pinned ? <PinOff size={18} /> : <Pin size={18} />}
            label={chat.pinned ? 'Mahkamdan olish' : 'Mahkamlash'}
            onClick={() => { void togglePin(chat.id); onClose() }}
          />
          {chat.project_id ? (
            <Item icon={<FolderMinus size={18} />} label="Loyihadan chiqarish"
              onClick={() => { void moveToProject(chat.id, null); onClose() }} />
          ) : (
            <Item icon={<FolderInput size={18} />} label="Loyihaga ko'chirish"
              onClick={() => setView('project')} />
          )}
          <Item icon={<Trash2 size={18} />} label="O'chirish" danger
            onClick={() => setView('confirm')} />
        </div>
      )}

      {view === 'rename' && (
        <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
          <input className="input" autoFocus value={name} maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) { void rename(chat.id, name.trim()); onClose() }
            }} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }}
              onClick={() => setView('root')}>Orqaga</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!name.trim()}
              onClick={() => { void rename(chat.id, name.trim()); onClose() }}>Saqlash</button>
          </div>
        </div>
      )}

      {view === 'project' && (
        <div style={{ display: 'grid', gap: 3 }}>
          {projects.length === 0 && (
            <p className="micro" style={{ padding: 16, textAlign: 'center', lineHeight: 1.6 }}>
              Loyiha yo'q. Chatlar → Loyihalar bo'limidan yarating.
            </p>
          )}
          {projects.map((p) => (
            <Item key={p.id}
              icon={<span data-emoji style={{ fontSize: 17 }}>{p.emoji}</span>}
              label={p.name}
              trailing={chat.project_id === p.id ? <Check size={16} /> : undefined}
              onClick={() => { void moveToProject(chat.id, p.id); onClose() }} />
          ))}
          <Item icon={<span />} label="Orqaga" onClick={() => setView('root')} />
        </div>
      )}

      {view === 'confirm' && (
        <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
            Bu chat va uning barcha xabarlari o'chiriladi. Buni qaytarib bo'lmaydi.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }}
              onClick={() => setView('root')}>Bekor</button>
            <button className="btn btn-danger" style={{ flex: 1 }}
              onClick={() => { void remove(chat.id); onClose() }}>O'chirish</button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

function Item({ icon, label, onClick, danger, trailing }: {
  icon: React.ReactNode; label: string; onClick: () => void
  danger?: boolean; trailing?: React.ReactNode
}) {
  return (
    <button onClick={onClick} className="pressable"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '13px 11px', minHeight: 54, borderRadius: 'var(--r-md)',
        background: 'transparent', border: 'none', textAlign: 'left',
        color: danger ? 'var(--danger)' : 'var(--text)',
        fontSize: 'var(--fs-sm)', fontWeight: 540, fontFamily: 'var(--font)',
      }}>
      {icon}
      <span className="truncate" style={{ flex: 1 }}>{label}</span>
      {trailing}
    </button>
  )
}
