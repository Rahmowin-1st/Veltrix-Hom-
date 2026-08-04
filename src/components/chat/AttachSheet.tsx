import { useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Camera, Image as ImageIcon, Mic, FileText, BookOpen } from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { capturePhoto, isNative } from '@/lib/native'

export interface Attachment {
  kind: 'image' | 'audio' | 'file'
  mimeType: string
  data: string
  name: string
  size: number
  ext: string
}

/**
 * Every accepted format, grouped the way a user thinks about them.
 * The lists are the real ones the model accepts — nothing is offered here
 * that the backend would later reject.
 */
export const ACCEPT = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'],
  audio: [
    'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
    'audio/aac', 'audio/ogg', 'audio/opus', 'audio/flac', 'audio/aiff', 'audio/webm',
  ],
  file: [
    'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
    'application/json', 'text/html', 'text/xml',
  ],
} as const

const MAX_BYTES = 20 * 1024 * 1024

type Slot = 'image' | 'camera' | 'audio' | 'file' | 'source'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (a: Attachment) => void
  onPickSource?: () => void
  allow?: Slot[]
  onError?: (message: string) => void
}

export function AttachSheet({
  open, onClose, onPick, onPickSource,
  allow = ['image', 'camera', 'audio', 'file'],
  onError,
}: Props) {
  const imageInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const read = (file: File, kind: Attachment['kind']) => {
    if (file.size > MAX_BYTES) {
      onError?.(`Fayl hajmi limitdan katta. Ruxsat etilgan: ${MAX_BYTES / 1024 / 1024} MB.`)
      return
    }
    // HEIC has no safe in-browser decoder, so it is refused with a real reason.
    if (/heic|heif/i.test(file.type) || /\.heic$|\.heif$/i.test(file.name)) {
      onError?.('HEIC formati qo\u02bcllab-quvvatlanmaydi. Rasmni JPEG qilib saqlang.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result
      if (typeof res !== 'string') return
      onPick({
        kind,
        mimeType: file.type || 'application/octet-stream',
        data: res.split(',')[1] ?? '',
        name: file.name,
        size: file.size,
        ext: (file.name.split('.').pop() ?? '?').toUpperCase().slice(0, 4),
      })
    }
    reader.onerror = () => onError?.('Faylni o\u02bcqib bo\u02bclmadi.')
    reader.readAsDataURL(file)
  }

  const camera = async () => {
    try {
      const shot = await capturePhoto('camera')
      onPick({
        kind: 'image', mimeType: shot.mimeType, data: shot.data,
        name: 'kamera.jpg', size: Math.round(shot.data.length * 0.75), ext: 'JPG',
      })
    } catch { /* the user cancelled */ }
  }

  return (
    <AnimatePresence>
      {open && (
        <BottomSheet title="Biriktirish" onClose={onClose} desktopWidth={400}>
          <div style={{ display: 'grid', gap: 3 }}>
            {allow.includes('camera') && isNative && (
              <Item icon={<Camera size={19} />} label="Kamera"
                hint="Vazifani suratga oling" color="#0A6CFF" onClick={() => void camera()} />
            )}

            {allow.includes('image') && (
              <Item icon={<ImageIcon size={19} />} label="Rasm"
                hint="JPEG, PNG, WEBP, GIF" color="#1E9BFF"
                onClick={() => imageInput.current?.click()} />
            )}

            {allow.includes('audio') && (
              <Item icon={<Mic size={19} />} label="Audio"
                hint="MP3, WAV, M4A, OGG, FLAC" color="#8B5CF6"
                onClick={() => audioInput.current?.click()} />
            )}

            {allow.includes('file') && (
              <Item icon={<FileText size={19} />} label="Fayl"
                hint="PDF, TXT, CSV, MD" color="#0E8F52"
                onClick={() => fileInput.current?.click()} />
            )}

            {allow.includes('source') && onPickSource && (
              <Item icon={<BookOpen size={19} />} label="Manbalardan tanlash"
                hint="Yuklangan kitobdan javob" color="#C87B00"
                onClick={onPickSource} />
            )}
          </div>

          <input ref={imageInput} type="file" hidden accept={ACCEPT.image.join(',')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f, 'image'); e.target.value = '' }} />
          <input ref={audioInput} type="file" hidden accept={ACCEPT.audio.join(',')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f, 'audio'); e.target.value = '' }} />
          <input ref={fileInput} type="file" hidden accept={ACCEPT.file.join(',')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f, 'file'); e.target.value = '' }} />
        </BottomSheet>
      )}
    </AnimatePresence>
  )
}

function Item({ icon, label, hint, color, onClick }: {
  icon: React.ReactNode; label: string; hint: string; color: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="pressable"
      style={{
        display: 'flex', alignItems: 'center', gap: 13, width: '100%',
        padding: '13px 12px', minHeight: 62, borderRadius: 'var(--r-md)',
        background: 'transparent', border: 'none', textAlign: 'left',
        color: 'var(--text)', fontFamily: 'var(--font)',
      }}
    >
      <span style={{
        width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center',
        borderRadius: 'var(--r-sm)',
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}>{icon}</span>
      <span className="col" style={{ gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 620 }}>{label}</span>
        <span className="micro truncate">{hint}</span>
      </span>
    </button>
  )
}
