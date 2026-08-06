import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowLeftRight, Search, Check, Plus, X, Copy, Volume2, Square,
  RotateCcw, FileText, ImageIcon, Mic, ChevronDown,
} from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { translateApi, type Language, type TranslateResult } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { speak, cancelSpeech, pickVoice } from '@/lib/speech'

type Phase =
  | 'idle' | 'validating' | 'uploading' | 'extracting'
  | 'translating' | 'success' | 'error'

const MAX_CHARS = 5000

export default function Translate() {
  const navigate = useNavigate()
  const settings = useAuthStore((s) => s.settings)
  const patchSettings = useAuthStore((s) => s.patchSettings)

  const [languages, setLanguages] = useState<Language[]>([])
  const [accepts, setAccepts] = useState<Record<string, string[]>>({})
  const [maxBytes, setMaxBytes] = useState(20 * 1024 * 1024)

  const [from, setFrom] = useState('auto')
  const [to, setTo] = useState('uz')
  const [picker, setPicker] = useState<'from' | 'to' | null>(null)

  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detectedOpen, setDetectedOpen] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    translateApi.languages()
      .then((r) => {
        setLanguages(r.languages)
        setAccepts(r.accepts as unknown as Record<string, string[]>)
        setMaxBytes(r.maxBytes)
      })
      .catch(() => {})
  }, [])

  // Target defaults to the last successful one, then the saved preference.
  useEffect(() => {
    if (!settings) return
    setTo(settings.tr_last_target || settings.tr_target_lang || 'uz')
    setFrom(settings.tr_source_lang || 'auto')
  }, [settings?.tr_last_target, settings?.tr_target_lang, settings?.tr_source_lang])

  useEffect(() => () => { cancelSpeech(); abortRef.current?.abort() }, [])

  const langName = useCallback((code: string) => {
    if (code === 'auto') return 'Avto aniqlash'
    return languages.find((l) => l.code === code)?.native ?? code
  }, [languages])

  const acceptAttr = Object.values(accepts).flat().join(',')

  /** Swap is meaningless while the source is still unknown. */
  const canSwap = from !== 'auto' || Boolean(result?.detected && result.detected !== 'auto')

  const swap = () => {
    const realFrom = from === 'auto' ? (result?.detected ?? 'auto') : from
    if (realFrom === 'auto') return
    setFrom(to)
    setTo(realFrom)
    setResult(null)
    setPhase('idle')
  }

  const chooseFile = (f: File | null) => {
    if (!f) return
    setError(null)
    if (f.size > maxBytes) {
      setError(`Fayl hajmi limitdan katta. Ruxsat etilgan: ${Math.round(maxBytes / 1024 / 1024)} MB.`)
      return
    }
    // iPhone photos often arrive as HEIC, which the model cannot read.
    // There is no safe in-browser converter bundled, so say so plainly.
    if (/heic|heif/i.test(f.type) || /\.heic$|\.heif$/i.test(f.name)) {
      setError(
        'HEIC formati qo\u02bcllab-quvvatlanmaydi. iPhone sozlamalarida ' +
        'Kamera → Formatlar → "Eng mos" ni tanlang yoki rasmni JPEG qilib saqlang.'
      )
      return
    }

    const allowed = Object.values(accepts).flat()
    if (allowed.length && !allowed.includes(f.type)) {
      setError('Bu fayl turi qo\u02bcllab-quvvatlanmaydi.')
      return
    }
    setFile(f)
  }

  const run = async () => {
    if (!text.trim() && !file) return
    cancelSpeech()
    setSpeaking(false)
    setError(null)
    setResult(null)

    const controller = new AbortController()
    abortRef.current = controller

    setPhase(file ? 'uploading' : 'translating')
    try {
      if (file) {
        // Extraction happens server-side; reflect it so the wait is explained.
        window.setTimeout(() => setPhase((p) => (p === 'uploading' ? 'extracting' : p)), 900)
        window.setTimeout(() => setPhase((p) => (p === 'extracting' ? 'translating' : p)), 2400)
      }

      const res = await translateApi.translate({ text: text.trim(), from, to, file })
      setResult(res)
      setPhase('success')
      void patchSettings({ tr_last_target: to })

      if (settings?.tr_auto_read) readAloud(res)
    } catch (e) {
      if (controller.signal.aborted) { setPhase('idle'); return }
      setError(e instanceof Error ? e.message : 'Tarjima olinmadi. Qayta urinib ko\u02bcring.')
      setPhase('error')
    } finally {
      abortRef.current = null
    }
  }

  const readAloud = (r: TranslateResult) => {
    if (speaking) { cancelSpeech(); setSpeaking(false); return }
    const voice = pickVoice(r.targetBcp47)
    if (!voice) {
      setError('Bu til uchun mos ovoz topilmadi.')
      return
    }
    setSpeaking(true)
    speak(r.translated, {
      voice,
      lang: r.targetBcp47,
      rate: settings?.voice_rate ?? 1,
      onEnd: () => setSpeaking(false),
    })
  }

  const busy = phase === 'uploading' || phase === 'extracting' || phase === 'translating'
  const PHASE_LABEL: Record<string, string> = {
    uploading: 'Fayl yuborilmoqda…',
    extracting: 'Matn ajratilmoqda…',
    translating: 'Tarjima qilinmoqda…',
  }

  return (
    <div
      data-scroll-root
      className="hide-sb"
      style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4)' }}
    >
      <div style={{
        maxWidth: 'var(--content-max)', margin: '0 auto',
        display: 'grid', gap: 'var(--s-4)',
        paddingBottom: 'calc(var(--safe-bottom) + var(--s-8))',
      }}>
        <header className="row" style={{ gap: 10 }}>
          <button className="v5-round-icon" onClick={() => navigate(-1)} aria-label="Orqaga"><ArrowLeft size={21}/></button>
          <div><p className="micro">MULTIMODAL TARJIMA</p><h1 style={{ fontSize: 'clamp(29px,8vw,42px)' }}>Tarjima</h1></div>
        </header>
        {/* ---------------- language bar ---------------- */}
        <div className="glass" style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center', gap: 4, padding: 6,
        }}>
          <LangButton label="Manba tili" value={langName(from)} onClick={() => setPicker('from')} />
          <button
            className="btn btn-ghost btn-icon"
            onClick={swap}
            disabled={!canSwap}
            aria-label="Tillarni almashtirish"
            title={canSwap ? 'Almashtirish' : 'Avval til aniqlansin'}
            style={{ width: 40, height: 40 }}
          >
            <ArrowLeftRight size={18} />
          </button>
          <LangButton label="Maqsad tili" value={langName(to)} onClick={() => setPicker('to')} align="right" />
        </div>

        {/* ---------------- input ---------------- */}
        <section className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            rows={5}
            className="input"
            placeholder="Matn kiriting yoki fayl biriktiring…"
            aria-label="Tarjima qilinadigan matn"
            style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 'var(--fs-lead)' }}
          />

          {file && (
            <div className="row surface-quiet" style={{ padding: '8px 10px', gap: 8 }}>
              <FileKind mime={file.type} />
              <span className="col" style={{ minWidth: 0, gap: 1, flex: 1 }}>
                <span className="truncate" style={{ fontSize: 'var(--fs-label)' }}>{file.name}</span>
                <span className="micro">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </span>
              <button className="btn btn-ghost btn-icon" style={{ width: 34, height: 34 }}
                onClick={() => setFile(null)} aria-label="Faylni olib tashlash">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-outline" style={{ height: 38 }}
                onClick={() => fileInput.current?.click()}>
                <Plus size={16} /> Fayl
              </button>
              {(text || file) && (
                <button className="btn btn-ghost" style={{ height: 38 }}
                  onClick={() => { setText(''); setFile(null); setResult(null); setPhase('idle') }}>
                  Tozalash
                </button>
              )}
            </div>
            <span className="micro">{text.length}/{MAX_CHARS}</span>
          </div>

          <input
            ref={fileInput} type="file" hidden accept={acceptAttr || undefined}
            onChange={(e) => { chooseFile(e.target.files?.[0] ?? null); e.target.value = '' }}
          />

          <button
            className="btn btn-primary"
            style={{ height: 46 }}
            disabled={busy || (!text.trim() && !file)}
            onClick={() => void run()}
          >
            {busy ? PHASE_LABEL[phase] : 'Tarjima qilish'}
          </button>
        </section>

        {/* ---------------- states ---------------- */}
        {busy && (
          <div className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 8 }}>
            <span className="micro" aria-live="polite">{PHASE_LABEL[phase]}</span>
            <div className="skeleton" style={{ height: 18, width: '40%' }} />
            <div className="skeleton" style={{ height: 56 }} />
          </div>
        )}

        {error && (
          <div role="alert" className="surface" style={{
            padding: 'var(--s-4)', display: 'grid', gap: 10,
            borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)',
          }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{error}</span>
            {phase === 'error' && (
              <button className="btn btn-outline" style={{ height: 38, justifySelf: 'start' }}
                onClick={() => void run()}>
                <RotateCcw size={15} /> Qayta urinish
              </button>
            )}
          </div>
        )}

        {/* ---------------- result ---------------- */}
        {result && phase === 'success' && (
          <motion.section
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="surface"
            style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)' }}
          >
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="chip">
                <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--success)' }} />
                {langName(result.detected)} {result.detected !== from && '(aniqlandi)'}
              </span>
              <span className="chip chip-strong">{langName(to)}</span>
            </div>

            <p style={{ fontSize: 'var(--fs-lead)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {result.translated}
            </p>

            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-outline" style={{ height: 36 }}
                onClick={() => void navigator.clipboard.writeText(result.translated)}>
                <Copy size={15} /> Nusxalash
              </button>
              <button className="btn btn-outline" style={{ height: 36 }} onClick={() => readAloud(result)}>
                {speaking ? <Square size={15} /> : <Volume2 size={15} />}
                {speaking ? 'To\u02bcxtatish' : 'O\u02bcqib berish'}
              </button>
              <button className="btn btn-ghost" style={{ height: 36 }} onClick={() => void run()}>
                <RotateCcw size={15} /> Qayta
              </button>
            </div>

            {/* Only offered when the server really extracted something. */}
            {result.extracted && result.original.trim() && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <button
                  onClick={() => setDetectedOpen((o) => !o)}
                  aria-expanded={detectedOpen}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-2)', fontSize: 'var(--fs-label)',
                    fontFamily: 'var(--font)', padding: 2,
                  }}
                >
                  <ChevronDown size={14} style={{
                    transform: detectedOpen ? 'none' : 'rotate(-90deg)',
                    transition: 'transform 150ms var(--ease)',
                  }} />
                  Aniqlangan matn
                </button>
                {detectedOpen && (
                  <div style={{ display: 'grid', gap: 8, paddingTop: 8 }}>
                    <p className="micro" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {result.original}
                    </p>
                    <button className="btn btn-ghost" style={{ height: 32, justifySelf: 'start' }}
                      onClick={() => { setText(result.original); setFile(null) }}>
                      Tahrirlash uchun ko\u02bcchirish
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.section>
        )}
      </div>

      <AnimatePresence>
        {picker && (
          <LanguagePicker
            key={picker}
            title={picker === 'from' ? 'Manba tili' : 'Maqsad tili'}
            languages={languages}
            selected={picker === 'from' ? from : to}
            includeAuto={picker === 'from'}
            onPick={(code) => {
              if (picker === 'from') setFrom(code)
              else { setTo(code); void patchSettings({ tr_target_lang: code }) }
              setPicker(null)
            }}
            onClose={() => setPicker(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------ pieces ------------------------------ */

function LangButton({ label, value, onClick, align = 'left' }: {
  label: string; value: string; onClick: () => void; align?: 'left' | 'right'
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'grid', gap: 1, padding: '9px 12px', minHeight: 48,
        borderRadius: 'var(--r-md)', background: 'transparent', border: 'none',
        cursor: 'pointer', fontFamily: 'var(--font)',
        textAlign: align, justifyItems: align === 'right' ? 'end' : 'start',
      }}
    >
      <span className="micro">{label}</span>
      <span className="truncate" style={{
        fontSize: 'var(--fs-sm)', fontWeight: 580, color: 'var(--text)', maxWidth: '100%',
      }}>
        {value}
      </span>
    </button>
  )
}

function FileKind({ mime }: { mime: string }) {
  const Icon = mime.startsWith('image/') ? ImageIcon : mime.startsWith('audio/') ? Mic : FileText
  return <Icon size={17} style={{ color: 'var(--brand)', flexShrink: 0 }} />
}

function LanguagePicker({ title, languages, selected, includeAuto, onPick, onClose }: {
  title: string
  languages: Language[]
  selected: string
  includeAuto: boolean
  onPick: (code: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')

  const term = q.trim().toLowerCase()
  const list = term
    ? languages.filter((l) =>
        l.name.toLowerCase().includes(term) ||
        l.native.toLowerCase().includes(term) ||
        l.code.includes(term))
    : languages

  return (
    <BottomSheet title={title} onClose={onClose} desktopWidth={420}>
      <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
        <div className="row surface-quiet" style={{ padding: '0 10px', height: 42 }}>
          <Search size={16} style={{ color: 'var(--text-3)' }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Til qidirish…" aria-label="Til qidirish"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
            }}
          />
        </div>

        <div style={{ display: 'grid', gap: 2 }}>
          {includeAuto && !term && (
            <LangRow
              native="Avto aniqlash" name="Tilni o\u02bczi aniqlaydi"
              active={selected === 'auto'} onClick={() => onPick('auto')}
            />
          )}
          {list.map((l) => (
            <LangRow
              key={l.code} native={l.native} name={l.name}
              active={selected === l.code} onClick={() => onPick(l.code)}
            />
          ))}
          {list.length === 0 && (
            <p className="micro" style={{ padding: '20px 4px', textAlign: 'center' }}>
              Til topilmadi.
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

function LangRow({ native, name, active, onClick }: {
  native: string; name: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px', minHeight: 48, borderRadius: 'var(--r-md)',
        background: active ? 'var(--bg-active)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: 'var(--text)', fontFamily: 'var(--font)',
      }}
    >
      <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
        <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 540 }}>{native}</span>
        <span className="micro truncate">{name}</span>
      </span>
      {active && <Check size={16} style={{ color: 'var(--brand)' }} />}
    </button>
  )
}
