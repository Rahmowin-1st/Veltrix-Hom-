import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Play, X, BookOpen, RotateCcw, Copy, Volume2, Square } from 'lucide-react'
import { AnswerBlocks } from '@/components/chat/AnswerBlocks'
import { AttachSheet, type Attachment } from '@/components/chat/AttachSheet'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { VeltrixMark } from '@/components/brand/VeltrixLogo'
import { modeById, buildPrompt, type ModeField } from '@/lib/modes'
import { activityApi, api, sourceApi, type ChatResponse } from '@/lib/api'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { speak, cancelSpeech, pickVoice } from '@/lib/speech'
import type { Source } from '@/types'

/**
 * One window per mode, generated from the mode's field schema.
 * Everything the window shows is either user input or a real server
 * response — there is no decorative state.
 */
export default function Mode() {
  const { modeId } = useParams()
  const navigate = useNavigate()
  const mode = modeById(modeId)
  const setNavHidden = useUIStore((s) => s.setNavHidden)
  const settings = useAuthStore((s) => s.settings)
  const userId = useAuthStore((s) => s.user?.id ?? null)

  const [values, setValues] = useState<Record<string, string>>({})
  const [attach, setAttach] = useState<Attachment | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [sheet, setSheet] = useState<'attach' | 'source' | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ChatResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNavHidden(true)
    return () => { setNavHidden(false); cancelSpeech() }
  }, [setNavHidden])

  useEffect(() => {
    setSources([]); setSource(null)
    if (!userId) return
    let cancelled = false
    sourceApi.list().then((r) => { if (!cancelled) setSources(r.sources.filter((s) => s.status === 'ready')) }).catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])

  // Translation has its own dedicated workspace.
  if (modeId === 'translate') return <Navigate to="/tarjima" replace />
  if (modeId === 'quiz') return <Navigate to="/testlar?create=1" replace />
  if (!mode) return <Navigate to="/general" replace />

  const set = (key: string, v: string) => setValues((s) => ({ ...s, [key]: v }))

  const missing = mode.fields.some((f) => {
    if (!f.required) return false
    if (f.kind === 'image' || f.kind === 'file') return !attach
    if (f.kind === 'source') return !source
    return !values[f.key]?.trim()
  })

  const run = async () => {
    if (missing || busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    cancelSpeech()
    setSpeaking(false)

    // Stable per-run id so an accidental double-run cannot duplicate work.
    const clientMessageId = crypto.randomUUID()
    try {
      const submit = await api.sendMessage({
        chatId: null,
        text: buildPrompt(mode, values),
        lockedSourceId: source?.id ?? null,
        image: attach ? { mimeType: attach.mimeType, data: attach.data } : null,
        clientRequestId: clientMessageId,
      })

      let res: ChatResponse | null = null
      if (submit.kind === 'completed') {
        res = submit.response
      } else if (submit.kind === 'processing') {
        // Poll the durable request until the one-shot answer is ready.
        for (let attempt = 0; attempt < 45 && !res; attempt++) {
          await new Promise((r) => window.setTimeout(r, Math.min(1500 + attempt * 400, 6000)))
          const status = await api.requestStatus(submit.clientRequestId || clientMessageId)
          if (status.code === 'completed' && status.blocks) {
            res = { messageId: status.messageId ?? null, chatId: status.chatId ?? '', blocks: status.blocks, subject: status.subject, sourceMode: status.sourceMode, latencyMs: 0 }
          } else if (status.code === 'uncertain' || status.code === 'failed') {
            throw new Error(status.message ?? 'Javob olinmadi.')
          }
        }
        if (!res) throw new Error('Javob hali tayyor emas. Qayta urinib ko\u02bcring.')
      } else {
        throw new Error(submit.message)
      }

      setResult(res)
      void activityApi.log({ kind: 'homework_done', points: 5, metadata: { mode: mode.id, chatId: res.chatId } }).catch(() => {})
      if (source) void activityApi.log({ kind: 'source_used', points: 2, metadata: { sourceId: source.id, chatId: res.chatId } }).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Javob olinmadi. Qayta urinib ko\u02bcring.')
    } finally {
      setBusy(false)
    }
  }

  const readAloud = () => {
    if (!result) return
    if (speaking) { cancelSpeech(); setSpeaking(false); return }
    const text = plainText(result)
    const voice = pickVoice('uz-UZ') ?? pickVoice('ru-RU')
    if (!voice) { setError('Bu qurilmada mos ovoz topilmadi.'); return }
    setSpeaking(true)
    speak(text, { voice, lang: voice.lang, rate: settings?.voice_rate ?? 1,
      onEnd: () => setSpeaking(false) })
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 26 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 26 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      data-scroll-root
      className="hide-sb"
      style={{ flex: 1, overflowY: 'auto' }}
    >
      {/* ----------------------- header ----------------------- */}
      <div className="glass-nav" style={{
        position: 'sticky', top: 0, zIndex: 10,
        paddingTop: 'var(--safe-top)',
        borderRadius: 0, borderWidth: '0 0 1px',
      }}>
        <div className="row" style={{ height: 'var(--header-h)', paddingInline: 6, gap: 6 }}>
          <button className="btn btn-ghost btn-icon" style={{ width: 42, height: 42 }}
            onClick={() => navigate(-1)} aria-label="Orqaga">
            <ArrowLeft size={22} />
          </button>
          <span style={{
            width: 30, height: 30, display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-xs)', flexShrink: 0,
            background: `color-mix(in srgb, ${mode.color} 16%, transparent)`,
            color: mode.color,
          }}>
            <mode.Icon size={16} strokeWidth={2.2} />
          </span>
          <span className="truncate" style={{ fontSize: 'var(--fs-lead)', fontWeight: 660 }}>
            {mode.title}
          </span>
        </div>
      </div>

      <div style={{
        maxWidth: 'var(--content-max)', margin: '0 auto',
        padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-4)',
        paddingBottom: 'calc(var(--safe-bottom) + var(--s-9))',
      }}>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', paddingInline: 2 }}>
          {mode.subtitle}
        </p>

        {/* ----------------------- fields ----------------------- */}
        <section className="raised" style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-4)' }}>
          {mode.fields.map((f) => (
            <Field
              key={f.key}
              field={f}
              value={values[f.key] ?? ''}
              onChange={(v) => set(f.key, v)}
              attach={attach}
              onAttach={() => setSheet('attach')}
              onClearAttach={() => setAttach(null)}
              source={source}
              onPickSource={() => setSheet('source')}
              onClearSource={() => setSource(null)}
            />
          ))}

          <motion.button
            className="btn btn-gradient"
            style={{ height: 50, fontSize: 'var(--fs-lead)' }}
            disabled={missing || busy}
            onClick={() => void run()}
            whileTap={{ scale: 0.97 }}
          >
            {busy ? (
              <span className="typing"><span /><span /><span /></span>
            ) : (
              <><Play size={17} /> Bajarish</>
            )}
          </motion.button>
        </section>

        {/* ---------------------- examples ---------------------- */}
        {!result && !busy && mode.examples.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <span className="micro" style={{ paddingInline: 2 }}>Misollar</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {mode.examples.map((ex) => (
                <button key={ex} className="chip chip-btn"
                  onClick={() => set(mode.fields[0]?.key ?? 'task', ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ----------------------- result ----------------------- */}
        <div ref={resultRef}>
          {busy && (
            <div className="surface" style={{ padding: 'var(--s-4)', display: 'grid', gap: 10 }}>
              <span className="micro" aria-live="polite">Javob tayyorlanmoqda…</span>
              <div className="skeleton" style={{ height: 68 }} />
              <div className="skeleton" style={{ height: 104, opacity: .55 }} />
            </div>
          )}

          {error && (
            <div role="alert" className="surface" style={{
              padding: 'var(--s-4)', display: 'grid', gap: 12,
              borderColor: 'color-mix(in srgb, var(--danger) 42%, transparent)',
            }}>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>{error}</span>
              <button className="btn btn-outline" style={{ height: 40, justifySelf: 'start' }}
                onClick={() => void run()}>
                <RotateCcw size={15} /> Qayta urinish
              </button>
            </div>
          )}

          {result && (
            <motion.section
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: .34, ease: [0.16, 1, 0.3, 1] }}
              className="raised"
              style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-3)' }}
            >
              <div className="row" style={{ gap: 9 }}>
                <VeltrixMark size={22} />
                {result.subject && <span className="chip chip-strong">{result.subject}</span>}
                {result.pagesUsed?.length ? (
                  <span className="chip">{result.pagesUsed.join(', ')}-bet</span>
                ) : null}
              </div>

              <AnswerBlocks blocks={result.blocks} />

              <div className="row" style={{ gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                <button className="btn btn-outline" style={{ height: 38 }}
                  onClick={() => void navigator.clipboard.writeText(plainText(result))}>
                  <Copy size={15} /> Nusxalash
                </button>
                <button className="btn btn-outline" style={{ height: 38 }} onClick={readAloud}>
                  {speaking ? <Square size={15} /> : <Volume2 size={15} />}
                  {speaking ? 'To\u02bcxtatish' : 'O\u02bcqib berish'}
                </button>
                <button className="btn btn-ghost" style={{ height: 38 }} onClick={() => void run()}>
                  <RotateCcw size={15} /> Yana
                </button>
              </div>
            </motion.section>
          )}
        </div>
      </div>

      <AttachSheet
        open={sheet === 'attach'}
        onClose={() => setSheet(null)}
        onPick={(a) => { setAttach(a); setSheet(null) }}
        onError={(m) => { setError(m); setSheet(null) }}
        allow={mode.fields.some((f) => f.kind === 'file')
          ? ['file', 'image', 'camera']
          : ['image', 'camera']}
      />

      <AnimatePresence>
        {sheet === 'source' && (
          <BottomSheet title="Manba tanlash" onClose={() => setSheet(null)} desktopWidth={420}>
            <div style={{ display: 'grid', gap: 4 }}>
              {sources.length === 0 && (
                <p className="micro" style={{ padding: '20px 4px', textAlign: 'center', lineHeight: 1.6 }}>
                  Tayyor manba yo'q. Manbalar bo'limidan kitob yuklang.
                </p>
              )}
              {sources.map((s) => (
                <button key={s.id} className="pressable"
                  onClick={() => { setSource(s); setSheet(null) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                    padding: '12px', minHeight: 58, borderRadius: 'var(--r-md)',
                    background: source?.id === s.id ? 'var(--bg-active)' : 'transparent',
                    border: `1px solid ${source?.id === s.id ? 'var(--brand)' : 'var(--border)'}`,
                    textAlign: 'left', color: 'var(--text)', fontFamily: 'var(--font)',
                  }}>
                  <span data-emoji style={{ fontSize: 20 }}>{s.emoji}</span>
                  <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <span className="truncate" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                      {s.title}
                    </span>
                    <span className="micro">{s.page_count ? `${s.page_count} bet` : 'PDF'}</span>
                  </span>
                </button>
              ))}
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ---------------------------- field ------------------------------- */

function Field({
  field, value, onChange, attach, onAttach, onClearAttach,
  source, onPickSource, onClearSource,
}: {
  field: ModeField
  value: string
  onChange: (v: string) => void
  attach: Attachment | null
  onAttach: () => void
  onClearAttach: () => void
  source: Source | null
  onPickSource: () => void
  onClearSource: () => void
}) {
  const label = (
    <span style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--text-2)' }}>
      {field.label}
      {field.required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      {field.hint && <span className="micro" style={{ marginLeft: 7 }}>{field.hint}</span>}
    </span>
  )

  if (field.kind === 'image' || field.kind === 'file') {
    return (
      <div style={{ display: 'grid', gap: 7 }}>
        {label}
        {attach ? (
          <div className="surface-2 row" style={{ padding: 10, gap: 10 }}>
            {attach.kind === 'image' ? (
              <img src={`data:${attach.mimeType};base64,${attach.data}`} alt=""
                width={46} height={46}
                style={{ borderRadius: 'var(--r-xs)', objectFit: 'cover' }} />
            ) : (
              <span style={{
                width: 46, height: 46, display: 'grid', placeItems: 'center',
                borderRadius: 'var(--r-xs)', background: 'var(--brand-soft)',
                color: 'var(--brand)', fontSize: 11, fontWeight: 700,
              }}>{attach.ext}</span>
            )}
            <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
              <span className="truncate" style={{ fontSize: 'var(--fs-label)' }}>{attach.name}</span>
              <span className="micro">{(attach.size / 1024).toFixed(0)} KB</span>
            </span>
            <button className="btn btn-ghost btn-icon" style={{ width: 36, height: 36 }}
              onClick={onClearAttach} aria-label="Olib tashlash"><X size={16} /></button>
          </div>
        ) : (
          <button className="btn btn-outline" style={{ height: 46, justifyContent: 'flex-start' }}
            onClick={onAttach}>
            + {field.kind === 'image' ? 'Rasm tanlash' : 'Fayl tanlash'}
          </button>
        )}
      </div>
    )
  }

  if (field.kind === 'source') {
    return (
      <div style={{ display: 'grid', gap: 7 }}>
        {label}
        {source ? (
          <div className="source-pill source-pill-activating" style={{ alignSelf: 'start' }}>
            <BookOpen size={15} />
            <span className="truncate" style={{ maxWidth: 210 }}>{source.title}</span>
            <button onClick={onClearSource} aria-label="Manbani olib tashlash"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'inherit', padding: 4, margin: -2, display: 'grid' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <button className="btn btn-outline" style={{ height: 46, justifyContent: 'flex-start' }}
            onClick={onPickSource}>
            <BookOpen size={16} /> Manba tanlash
          </button>
        )}
      </div>
    )
  }

  if (field.kind === 'select') {
    return (
      <label style={{ display: 'grid', gap: 7 }}>
        {label}
        <select className="input" value={value || field.options?.[0]?.value}
          onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    )
  }

  if (field.kind === 'page') {
    return (
      <label style={{ display: 'grid', gap: 7 }}>
        {label}
        <input className="input" inputMode="numeric" value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          style={{ maxWidth: 140 }} />
      </label>
    )
  }

  if (field.kind === 'textarea') {
    return (
      <label style={{ display: 'grid', gap: 7 }}>
        {label}
        <textarea className="input" rows={field.rows ?? 3} value={value}
          placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }

  return (
    <label style={{ display: 'grid', gap: 7 }}>
      {label}
      <input className="input" value={value} placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** Flattens blocks for copy and speech. */
function plainText(r: ChatResponse): string {
  const out: string[] = []
  for (const b of r.blocks) {
    switch (b.type) {
      case 'answer': out.push(`Javob: ${b.text}`); break
      case 'steps': out.push(b.items.map((s, i) => `${i + 1}. ${s}`).join('\n')); break
      case 'formula': out.push(b.latex); break
      case 'rule': case 'note': case 'warning': out.push(b.text); break
      case 'code': out.push(b.code); break
      case 'translation': out.push(`${b.original}\n${b.translated}`); break
      case 'table': out.push([b.headers.join(' | '), ...b.rows.map((x) => x.join(' | '))].join('\n')); break
      case 'timeline': out.push(b.items.map((i) => `${i.date}: ${i.event}`).join('\n')); break
      case 'quiz': out.push(`${b.question}\n${b.options.join('\n')}`); break
      default: break
    }
  }
  return out.join('\n\n')
}
