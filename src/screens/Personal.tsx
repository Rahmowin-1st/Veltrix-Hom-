import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Image as ImageIcon, X, Send, BookOpen, Languages } from 'lucide-react'
import { AnswerBlocks } from '@/components/chat/AnswerBlocks'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { api, sourceApi, type ChatResponse } from '@/lib/api'
import { capturePhoto, isNative, tap } from '@/lib/native'
import { useAuthStore } from '@/store/authStore'
import type { Source } from '@/types'

/**
 * Personal — a single-shot homework workspace.
 * Pick a source and page, choose how the answer should look, send once.
 * It uses the same /api/chat endpoint; the answer mode maps onto the
 * slash commands the backend already understands.
 */

const MODES = [
  { id: 'answer_only', label: 'Faqat javob', cmd: '/qisqa', hint: 'Faqat yakuniy natija.' },
  { id: 'short', label: 'Qisqa izoh', cmd: '', hint: 'Natija va bir-ikki jumla izoh.' },
  { id: 'full', label: 'Bosqichma-bosqich', cmd: '/toliq', hint: 'Har bir qadam ochib beriladi.' },
  { id: 'notebook', label: 'Daftar formati', cmd: '/daftar',
    hint: "Daftarga ko'chirishga tayyor, tartibli javob." },
  { id: 'check', label: 'Javobni tekshirish', cmd: '/tekshir',
    hint: "Javobingiz to'g'rimi — xato aynan qayerda." },
  { id: 'quiz', label: 'Test yaratish', cmd: '/test 5', hint: '5 ta savol va javoblar.' },
  { id: 'simple', label: 'Sodda tushuntirish', cmd: '/sodda',
    hint: 'Sinfingizga mos til, misol bilan.' },
  { id: 'translate', label: 'Tarjima', cmd: '/tarjima auto uz', hint: 'Matnni tarjima qiladi.' },
] as const

const TEMPLATES = [
  'Shu betdagi barcha mashqlarni bajar',
  'Faqat javoblarni yoz',
  'Xatolarimni tekshir',
  'Eng qisqa yo\'l bilan yech',
  'Bu mavzuni sodda tushuntir',
  'Savollar va javoblar yarat',
] as const

export default function Personal() {
  const navigate = useNavigate()
  const settings = useAuthStore((s) => s.settings)
  const [sources, setSources] = useState<Source[]>([])
  const [sourceId, setSourceId] = useState('')
  const [page, setPage] = useState('')
  const [mode, setMode] = useState<string>('full')
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<{ mimeType: string; data: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ChatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sourceApi.list().then((r) => setSources(r.sources.filter((s) => s.status === 'ready'))).catch(() => {})
  }, [])

  useEffect(() => {
    if (settings?.default_answer_mode) setMode(settings.default_answer_mode)
  }, [settings?.default_answer_mode])

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  const run = async () => {
    if ((!text.trim() && !photo) || busy) return
    void tap('medium')
    setBusy(true)
    setError(null)
    setResult(null)

    const cmd = MODES.find((m) => m.id === mode)?.cmd ?? ''
    const pageCmd = page.trim() ? `/bet ${page.trim()}` : ''
    const prompt = [cmd, pageCmd, text.trim() || 'Ushbu rasmdagi vazifani bajar.']
      .filter(Boolean).join(' ')

    try {
      const res = await api.sendMessage({
        chatId: null,
        text: prompt,
        lockedSourceId: sourceId || null,
        image: photo,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Javob olinmadi. Qayta urinib ko\'ring.')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (src: 'camera' | 'gallery') => {
    try { setPhoto(await capturePhoto(src)) } catch { /* cancelled */ }
  }

  return (
    <div data-scroll-root className="hide-sb"
      style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4)' }}>
      <div style={{
        maxWidth: 'var(--content-max)', margin: '0 auto',
        display: 'grid', gap: 'var(--s-4)',
        paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--s-8))',
      }}>
        <header style={{ display: 'grid', gap: 3 }}>
          <h1 style={{ fontSize: 'var(--fs-title)' }}>Personal</h1>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
            Shaxsiy uy vazifa yordamchisi
          </p>
        </header>

        {/* --- source + page --- */}
        <section className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)' }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6, flex: 1, minWidth: 170 }}>
              <span className="micro">Manba</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={inputCss}>
                <option value="">Avtomatik tanlash</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, width: 110 }}>
              <span className="micro">Bet</span>
              <input value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="54" style={inputCss} />
            </label>
          </div>

          {sources.length === 0 && (
            <p className="micro" style={{ margin: 0, lineHeight: 1.55 }}>
              <BookOpen size={12} style={{ verticalAlign: -2 }} /> Manba yo'q — AI umumiy bilimidan javob beradi.
            </p>
          )}
        </section>

        {/* --- answer mode --- */}
        <section className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 10 }}>
          <span className="micro">Javob turi</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MODES.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
                className={mode === m.id ? 'chip chip-strong chip-btn' : 'chip chip-btn'}
                style={{ height: 36 }}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="micro" style={{ lineHeight: 1.5 }} aria-live="polite">
            {MODES.find((m) => m.id === mode)?.hint}
          </p>
        </section>

        {/* --- task --- */}
        <section className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TEMPLATES.map((t) => (
              <button key={t} className="chip chip-btn" onClick={() => setText(t)}>{t}</button>
            ))}
          </div>

          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder="Vazifani yozing yoki yuqoridagi shablonlardan tanlang…"
            aria-label="Vazifa matni"
            style={{ ...inputCss, height: 'auto', paddingTop: 10, resize: 'vertical', lineHeight: 1.55 }}
          />

          {photo && (
            <div className="row" style={{ gap: 8 }}>
              <img src={`data:${photo.mimeType};base64,${photo.data}`} alt=""
                width={44} height={44} style={{ borderRadius: 'var(--r-xs)', objectFit: 'cover' }} />
              <span className="micro">Rasm biriktirildi</span>
              <button className="btn btn-ghost" style={{ height: 30, marginLeft: 'auto' }}
                onClick={() => setPhoto(null)}><X size={14} /></button>
            </div>
          )}

          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {isNative && (
              <button className="btn btn-outline" style={{ height: 36 }} onClick={() => void pick('camera')}>
                <Camera size={15} /> Rasmga olish
              </button>
            )}
            <button className="btn btn-outline" style={{ height: 36 }} onClick={() => void pick('gallery')}>
              <ImageIcon size={15} /> Rasm yuklash
            </button>
            <button className="btn btn-ghost" style={{ height: 36 }}
              onClick={() => navigate('/rejim/check')}>
              <Languages size={15} /> Boshqa rejimlar
            </button>
            <button className="btn btn-primary" style={{ height: 36, marginLeft: 'auto' }}
              disabled={busy || (!text.trim() && !photo)} onClick={() => void run()}>
              <Send size={15} /> {busy ? 'Bajarilmoqda…' : 'Bajarish'}
            </button>
          </div>
        </section>

        {/* --- result --- */}
        <div ref={resultRef}>
          {busy && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="skeleton" style={{ height: 70 }} />
              <div className="skeleton" style={{ height: 110, opacity: 0.55 }} />
            </div>
          )}

          {error && (
            <div role="alert" className="surface" style={{
              padding: '12px 14px', fontSize: 'var(--fs-sm)', color: 'var(--danger)',
              borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)',
            }}>{error}</div>
          )}

          {result && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <VeltrixMark size={22} />
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 10 }}>
                {result.subject && (
                  <div className="row hide-sb" style={{ gap: 6, overflowX: 'auto' }}>
                    <span className="chip chip-strong">{result.subject}</span>
                    {result.pagesUsed?.length ? (
                      <span className="chip">{result.pagesUsed.join(', ')}-bet</span>
                    ) : null}
                  </div>
                )}
                <AnswerBlocks blocks={result.blocks} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputCss: React.CSSProperties = {
  height: 42, padding: '0 12px', width: '100%',
  borderRadius: 'var(--r-md)', background: 'var(--bg-input)',
  border: '1px solid var(--border)', color: 'var(--text)',
  fontSize: 'var(--fs-sm)', fontFamily: 'var(--font)',
}
