import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Camera, FileAudio, FileText, Image as ImageIcon, LibraryBig, Plus, Search,
  Sparkles, X, Check, Upload,
} from 'lucide-react'
import { capturePhoto, isNative } from '@/lib/native'
import { ACCEPT, type Attachment } from './AttachSheet'
import type { Skill, Source } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  sources: Source[]
  skills: Skill[]
  selectedSourceIds: string[]
  activeSkillId: string | null
  onToggleSource: (source: Source) => void
  onSelectSkill: (skill: Skill | null) => void
  onPickAttachment: (attachment: Attachment) => void
  onCreateSource: () => void
  onCreateSkill: () => void
  onError?: (message: string) => void
}

type Tab = 'file' | 'source' | 'skill'
const MAX_BYTES = 20 * 1024 * 1024

export function ContextAttachSheet(p: Props) {
  const [tab, setTab] = useState<Tab>('file')
  const [query, setQuery] = useState('')
  const imageRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const read = (file: File, kind: Attachment['kind']) => {
    if (file.size > MAX_BYTES) {
      p.onError?.(`Fayl hajmi limitdan katta. Maksimal: ${MAX_BYTES / 1024 / 1024} MB.`)
      return
    }
    if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      p.onError?.('HEIC qo‘llab-quvvatlanmaydi. JPEG yoki WEBP tanlang.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      p.onPickAttachment({
        kind,
        mimeType: file.type || 'application/octet-stream',
        data: reader.result.split(',')[1] ?? '',
        name: file.name,
        size: file.size,
        ext: (file.name.split('.').pop() ?? '?').toUpperCase().slice(0, 5),
      })
      p.onClose()
    }
    reader.onerror = () => p.onError?.('Faylni o‘qib bo‘lmadi.')
    reader.readAsDataURL(file)
  }

  const camera = async () => {
    try {
      const shot = await capturePhoto('camera')
      p.onPickAttachment({
        kind: 'image', mimeType: shot.mimeType, data: shot.data,
        name: 'kamera.jpg', size: Math.round(shot.data.length * .75), ext: 'JPG',
      })
      p.onClose()
    } catch { /* cancelled */ }
  }

  const term = query.trim().toLowerCase()
  const sources = p.sources.filter((s) => s.status === 'ready' && (!term || s.title.toLowerCase().includes(term)))
  const skills = p.skills.filter((s) => !term || `${s.name} ${s.description ?? ''}`.toLowerCase().includes(term))

  return (
    <AnimatePresence>
      {p.open && (
        <>
          <motion.div className="v5-context-sheet-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={p.onClose} />
          <motion.section className="v5-context-sheet" role="dialog" aria-modal="true" aria-label="Chat konteksti"
            initial={{ y: '105%', opacity: .5, scale: .97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '105%', opacity: .4, scale: .98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 31, mass: .86 }}>
            <div className="row" style={{ padding: '14px 16px 4px' }}>
              <div>
                <h2 style={{ fontSize: 20 }}>Chatga qo‘shish</h2>
                <p className="micro">Fayl, manba va skill bir vaqtda ishlashi mumkin.</p>
              </div>
              <button className="v5-round-icon" style={{ marginLeft: 'auto', width: 40, height: 40 }} onClick={p.onClose} aria-label="Yopish"><X size={20}/></button>
            </div>

            <div className="v5-context-tabs">
              <TabButton active={tab === 'file'} onClick={() => setTab('file')} icon={<Upload size={17}/>} label="Fayl" />
              <TabButton active={tab === 'source'} onClick={() => setTab('source')} icon={<LibraryBig size={17}/>} label="Manba" />
              <TabButton active={tab === 'skill'} onClick={() => setTab('skill')} icon={<Sparkles size={17}/>} label="Skill" />
            </div>

            {(tab === 'source' || tab === 'skill') && (
              <label className="surface-2 row" style={{ margin: '0 14px 7px', height: 44, padding: '0 12px', borderRadius: 17 }}>
                <Search size={17} style={{ color: 'var(--text-3)' }}/>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === 'source' ? 'Manba qidirish…' : 'Skill qidirish…'}
                  style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--text)', font: 'inherit' }}/>
              </label>
            )}

            <div className="v5-context-body">
              {tab === 'file' && (
                <div style={{ display: 'grid', gap: 5 }}>
                  {isNative && <PickerItem icon={<Camera size={20}/>} title="Kamera" hint="Vazifani hozir suratga oling" color="#0A6CFF" onClick={() => void camera()} />}
                  <PickerItem icon={<ImageIcon size={20}/>} title="Rasm" hint="JPEG, PNG, WEBP, GIF" color="#20A6F2" onClick={() => imageRef.current?.click()} />
                  <PickerItem icon={<FileAudio size={20}/>} title="Audio" hint="MP3, WAV, M4A, OGG, FLAC" color="#8B5CF6" onClick={() => audioRef.current?.click()} />
                  <PickerItem icon={<FileText size={20}/>} title="Fayl" hint="PDF, TXT, CSV, MD, JSON" color="#12A46B" onClick={() => fileRef.current?.click()} />
                </div>
              )}

              {tab === 'source' && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <button className="v5-picker-item" onClick={p.onCreateSource}>
                    <span className="v5-source-icon" style={{ '--source-color': '#0A6CFF', width: 42, height: 42 } as React.CSSProperties}><Plus size={20}/></span>
                    <span className="col" style={{ gap: 2 }}><strong>Yangi manba qo‘shish</strong><span className="micro">PDF darslikni hisobga saqlash</span></span>
                  </button>
                  {sources.map((s) => {
                    const selected = p.selectedSourceIds.includes(s.id)
                    return <button key={s.id} className="v5-picker-item" data-selected={selected} onClick={() => p.onToggleSource(s)}>
                      <span className="v5-source-icon" style={{ '--source-color': s.color || '#0A6CFF', width: 42, height: 42 } as React.CSSProperties}><span data-emoji>{s.emoji}</span></span>
                      <span className="col" style={{ minWidth: 0, gap: 2, flex: 1 }}><strong className="truncate">{s.title}</strong><span className="micro">{s.grade ? `${s.grade}-sinf · ` : ''}{s.page_count ? `${s.page_count} bet` : 'Tayyor'}</span></span>
                      {selected && <Check size={19} style={{ color: 'var(--brand)' }}/>} 
                    </button>
                  })}
                  {sources.length === 0 && <p className="micro" style={{ padding: 20, textAlign: 'center' }}>Mos tayyor manba topilmadi.</p>}
                </div>
              )}

              {tab === 'skill' && (
                <div style={{ display: 'grid', gap: 4 }}>
                  <button className="v5-picker-item" onClick={p.onCreateSkill}>
                    <span className="v5-source-icon" style={{ '--source-color': '#8B5CF6', width: 42, height: 42 } as React.CSSProperties}><Plus size={20}/></span>
                    <span className="col" style={{ gap: 2 }}><strong>Yangi skill yaratish</strong><span className="micro">Claude Skills kabi qayta ishlatiladigan yo‘riqnoma</span></span>
                  </button>
                  <button className="v5-picker-item" data-selected={!p.activeSkillId} onClick={() => p.onSelectSkill(null)}>
                    <span className="v5-source-icon" style={{ '--source-color': '#64748B', width: 42, height: 42 } as React.CSSProperties}>∅</span>
                    <span className="col" style={{ flex: 1 }}><strong>Skillsiz</strong><span className="micro">Oddiy Veltrix yordamchi</span></span>
                    {!p.activeSkillId && <Check size={19} style={{ color: 'var(--brand)' }}/>} 
                  </button>
                  {skills.map((s) => <button key={s.id} className="v5-picker-item" data-selected={p.activeSkillId === s.id} onClick={() => p.onSelectSkill(s)}>
                    <span className="v5-source-icon" style={{ '--source-color': s.color || '#8B5CF6', width: 42, height: 42 } as React.CSSProperties}><span data-emoji>{s.emoji}</span></span>
                    <span className="col" style={{ minWidth: 0, gap: 2, flex: 1 }}><strong className="truncate">{s.name}</strong><span className="micro clamp-2">{s.description || 'AI yo‘riqnomasi'}</span></span>
                    {p.activeSkillId === s.id && <Check size={19} style={{ color: 'var(--brand)' }}/>} 
                  </button>)}
                </div>
              )}
            </div>

            <input ref={imageRef} hidden type="file" accept={ACCEPT.image.join(',')} onChange={(e) => { const f=e.target.files?.[0]; if(f) read(f,'image'); e.currentTarget.value='' }}/>
            <input ref={audioRef} hidden type="file" accept={ACCEPT.audio.join(',')} onChange={(e) => { const f=e.target.files?.[0]; if(f) read(f,'audio'); e.currentTarget.value='' }}/>
            <input ref={fileRef} hidden type="file" accept={ACCEPT.file.join(',')} onChange={(e) => { const f=e.target.files?.[0]; if(f) read(f,'file'); e.currentTarget.value='' }}/>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className="v5-context-tab" data-active={active} onClick={onClick}><span className="row" style={{ justifyContent: 'center', gap: 6 }}>{icon}{label}</span></button>
}
function PickerItem({ icon, title, hint, color, onClick }: { icon: React.ReactNode; title: string; hint: string; color: string; onClick: () => void }) {
  return <button className="v5-picker-item" onClick={onClick}>
    <span className="v5-source-icon" style={{ '--source-color': color, width: 42, height: 42 } as React.CSSProperties}>{icon}</span>
    <span className="col" style={{ gap: 2 }}><strong>{title}</strong><span className="micro">{hint}</span></span>
  </button>
}
