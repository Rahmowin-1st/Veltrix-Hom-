import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Check, Upload, FileText, AlertCircle, Search, Loader2,
} from 'lucide-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { sourceApi } from '@/lib/api'
import type { Source, Subject } from '@/types'

/** Mirrors the server limit in routes/upload.ts. */
const MAX_BYTES = 20 * 1024 * 1024
const NAME_MAX = 15

const ICONS = [
  { emoji: '📘', tags: 'kitob book' },
  { emoji: '📗', tags: 'kitob book' },
  { emoji: '📕', tags: 'kitob book' },
  { emoji: '➗', tags: 'matematika math' },
  { emoji: '📐', tags: 'geometriya geometry math' },
  { emoji: '🔢', tags: 'raqam number math' },
  { emoji: '🧪', tags: 'kimyo chemistry' },
  { emoji: '⚗️', tags: 'kimyo chemistry' },
  { emoji: '🔬', tags: 'biologiya fizika science' },
  { emoji: '🧬', tags: 'biologiya biology' },
  { emoji: '🌱', tags: 'biologiya nature' },
  { emoji: '🌍', tags: 'geografiya geography' },
  { emoji: '🏛️', tags: 'tarix history' },
  { emoji: '🇬🇧', tags: 'ingliz english til language' },
  { emoji: '🇺🇿', tags: 'ona tili uzbek language' },
  { emoji: '💻', tags: 'informatika computer tech' },
  { emoji: '⚡', tags: 'fizika physics' },
  { emoji: '🎨', tags: 'san\u02bcat art' },
  { emoji: '🎵', tags: 'musiqa music' },
  { emoji: '📖', tags: 'adabiyot literature' },
]

const COLORS = [
  { hex: '#0878F5', name: "Ko'k" },
  { hex: '#21B9F5', name: 'Moviy' },
  { hex: '#16995B', name: 'Yashil' },
  { hex: '#D88A00', name: 'Sariq' },
  { hex: '#E8722C', name: 'To\u02bcq sariq' },
  { hex: '#D83D54', name: 'Qizil' },
  { hex: '#8B5CF6', name: 'Binafsha' },
  { hex: '#64748B', name: 'Kulrang' },
]

type Step = 'name' | 'icon' | 'color' | 'file' | 'meta' | 'review' | 'upload'
const ORDER: Step[] = ['name', 'icon', 'color', 'file', 'meta', 'review', 'upload']
const TITLES: Record<Step, string> = {
  name: 'Manba nomi', icon: 'Ikona tanlang', color: 'Rang tanlang',
  file: 'PDF faylni tanlang', meta: 'Sinf va fan', review: "Ko'rib chiqish",
  upload: 'Yuklanmoqda',
}

interface Props {
  subjects: Subject[]
  onClose: () => void
  onCreated: (source: Source) => void
}

export function AddSourceFlow({ subjects, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('📘')
  const [color, setColor] = useState(COLORS[0]!.hex)
  const [file, setFile] = useState<File | null>(null)
  const [pageGuess, setPageGuess] = useState<number | null>(null)
  const [grade, setGrade] = useState<number | ''>('')
  const [subjectId, setSubjectId] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [iconQuery, setIconQuery] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)
  const pollAttemptsRef = useRef(0)

  const stopPolling = () => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current)
    pollRef.current = null
  }

  useEffect(() => () => stopPolling(), [])

  /** Grapheme-accurate so an emoji counts as one character, not four. */
  const nameLength = useMemo(() => countGraphemes(name), [name])
  const nameValid = name.trim().length > 0 && nameLength <= NAME_MAX

  const filteredIcons = useMemo(() => {
    const q = iconQuery.trim().toLowerCase()
    if (!q) return ICONS
    return ICONS.filter((i) => i.tags.includes(q))
  }, [iconQuery])

  const gradeSubjects = useMemo(() => {
    if (grade === '') return subjects
    // Subjects without a grade band apply to every grade.
    return subjects.filter((s) => !s.min_grade || (grade >= s.min_grade && grade <= (s.max_grade ?? 11)))
  }, [subjects, grade])

  const canAdvance: Record<Step, boolean> = {
    name: nameValid, icon: true, color: true,
    file: Boolean(file) && !fileError, meta: true, review: true, upload: false,
  }

  const goNext = () => {
    const i = ORDER.indexOf(step)
    const next = ORDER[i + 1]
    if (!next) return
    if (next === 'upload') { void startUpload(); return }
    setStep(next)
  }

  const goBack = () => {
    const i = ORDER.indexOf(step)
    if (i <= 0) { onClose(); return }
    setStep(ORDER[i - 1]!)
  }

  /** Client-side gate: magic bytes, size and type — before any network call. */
  const pickFile = async (f: File | null) => {
    setFileError(null)
    setPageGuess(null)
    if (!f) return

    if (f.size > MAX_BYTES) {
      setFileError(`PDF hajmi limitdan katta. Ruxsat etilgan: ${MAX_BYTES / 1024 / 1024} MB.`)
      setFile(null)
      return
    }

    const head = new Uint8Array(await f.slice(0, 1024).arrayBuffer())
    const magic = String.fromCharCode(...head.slice(0, 5))
    if (magic !== '%PDF-') {
      setFileError('Xato: faqat PDF fayl yuklang.')
      setFile(null)
      return
    }

    setFile(f)

    // Rough page count from the object table; the server reports the real one.
    try {
      const text = new TextDecoder('latin1').decode(new Uint8Array(await f.arrayBuffer()))
      const matches = text.match(/\/Type\s*\/Page[^s]/g)
      if (matches) setPageGuess(matches.length)
      if (/\/Encrypt/.test(text.slice(0, 4096))) {
        setFileError('Bu PDF parol bilan himoyalangan. Parolsiz nusxasini yuklang.')
        setFile(null)
      }
    } catch { /* page count is optional */ }
  }

  const startUpload = async () => {
    if (!file) return
    stopPolling()
    pollAttemptsRef.current = 0
    setStep('upload')
    setUploadError(null)
    setProgress(5)

    try {
      const { sourceId } = await sourceApi.upload({
        file, title: name.trim(), emoji, color,
        grade: grade === '' ? null : grade,
        subject_id: subjectId || null,
        onProgress: (pct) => setProgress(Math.min(pct, 30)),
      })

      // The server extracts and embeds in the background; poll the real row.
      pollRef.current = window.setInterval(async () => {
        pollAttemptsRef.current += 1
        if (pollAttemptsRef.current > 170) {
          stopPolling()
          setUploadError('Qayta ishlash uzoq davom etmoqda. Manba saqlandi — Manbalar sahifasidan holatini yangilang yoki qayta ishlashni bosing.')
          return
        }
        try {
          const { sources } = await sourceApi.list()
          const row = sources.find((s) => s.id === sourceId)
          if (!row) return

          setProgress(Math.max(30, row.progress))

          if (row.status === 'ready') {
            stopPolling()
            onCreated(row)
            onClose()
          } else if (row.status === 'failed') {
            stopPolling()
            setUploadError(row.error_message ?? 'Manbani qayta ishlashda xato yuz berdi.')
          }
        } catch { /* keep polling */ }
      }, 1800)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Yuklab bo\u02bclmadi.')
    }
  }

  const stepIndex = ORDER.indexOf(step)

  return (
    <BottomSheet title={TITLES[step]} onClose={onClose} desktopWidth={480} maxHeight="90dvh">
      <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
        {/* progress rail */}
        <div className="row" style={{ gap: 4 }} aria-hidden>
          {ORDER.slice(0, 6).map((s, i) => (
            <span key={s} style={{
              flex: 1, height: 3, borderRadius: 99,
              background: i <= stepIndex ? 'var(--brand)' : 'var(--border)',
              transition: 'background var(--t-hover) var(--ease)',
            }} />
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: 'grid', gap: 'var(--s-4)', minHeight: 190 }}
        >
          {step === 'name' && (
            <>
              <p className="micro">Manbaga qisqa nom bering.</p>
              <input
                className="input" autoFocus value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Algebra 8-sinf"
              />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="micro">
                  {nameLength > NAME_MAX ? 'Juda uzun' : '1–15 belgi'}
                </span>
                <span className="micro" style={{
                  color: nameLength > NAME_MAX ? 'var(--danger)' : undefined,
                }}>{nameLength}/{NAME_MAX}</span>
              </div>
            </>
          )}

          {step === 'icon' && (
            <>
              <div className="row surface-quiet" style={{ padding: '0 10px', height: 40 }}>
                <Search size={15} style={{ color: 'var(--text-3)' }} />
                <input
                  value={iconQuery} onChange={(e) => setIconQuery(e.target.value)}
                  placeholder="matematika, kitob, fizika…" aria-label="Ikona qidirish"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--text)', fontSize: 'var(--fs-label)', fontFamily: 'var(--font)',
                  }}
                />
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', gap: 6,
              }}>
                {filteredIcons.map(({ emoji: e }) => (
                  <button key={e} onClick={() => setEmoji(e)} aria-pressed={emoji === e} aria-label={e}
                    style={{
                      height: 50, borderRadius: 'var(--r-md)', fontSize: 22, cursor: 'pointer',
                      background: emoji === e ? 'var(--bg-active)' : 'var(--bg-hover)',
                      border: `1px solid ${emoji === e ? 'var(--brand)' : 'transparent'}`,
                    }}>{e}</button>
                ))}
              </div>
            </>
          )}

          {step === 'color' && (
            <>
              <p className="micro">Manba kartasi shu rangda ko'rinadi.</p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8,
              }}>
                {COLORS.map((c) => (
                  <button key={c.hex} onClick={() => setColor(c.hex)} aria-pressed={color === c.hex}
                    style={{
                      display: 'grid', gap: 6, justifyItems: 'center', padding: '10px 4px',
                      borderRadius: 'var(--r-md)', cursor: 'pointer',
                      background: color === c.hex ? 'var(--bg-active)' : 'transparent',
                      border: `1px solid ${color === c.hex ? 'var(--brand)' : 'var(--border)'}`,
                    }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: 99, background: c.hex,
                      display: 'grid', placeItems: 'center', color: '#fff',
                    }}>
                      {color === c.hex && <Check size={15} />}
                    </span>
                    <span className="micro">{c.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'file' && (
            <>
              <button
                onClick={() => inputRef.current?.click()}
                className="surface-quiet"
                style={{
                  padding: 'var(--s-6) var(--s-4)', display: 'grid', gap: 8, justifyItems: 'center',
                  cursor: 'pointer', borderStyle: 'dashed', borderColor: 'var(--border-strong)',
                  fontFamily: 'var(--font)', color: 'var(--text)',
                }}
              >
                <Upload size={26} style={{ color: 'var(--brand)' }} />
                <strong style={{ fontSize: 'var(--fs-sm)' }}>
                  {file ? 'Boshqa fayl tanlash' : 'PDF faylni tanlang'}
                </strong>
                <span className="micro">Maksimal {MAX_BYTES / 1024 / 1024} MB</span>
              </button>

              <input ref={inputRef} type="file" hidden accept="application/pdf,.pdf"
                onChange={(e) => { void pickFile(e.target.files?.[0] ?? null); e.target.value = '' }} />

              {fileError && (
                <div role="alert" className="row" style={{
                  gap: 8, padding: '10px 12px', borderRadius: 'var(--r-md)',
                  background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                  color: 'var(--danger)', fontSize: 'var(--fs-label)',
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />{fileError}
                </div>
              )}

              {file && !fileError && (
                <div className="surface-quiet" style={{ padding: 'var(--s-3)', display: 'grid', gap: 6 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <FileText size={17} style={{ color: 'var(--brand)' }} />
                    <span className="truncate" style={{ fontSize: 'var(--fs-label)', flex: 1 }}>
                      {file.name}
                    </span>
                    <Check size={16} style={{ color: 'var(--success)' }} />
                  </div>
                  <span className="micro">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                    {pageGuess ? ` · taxminan ${pageGuess} bet` : ''}
                  </span>
                </div>
              )}
            </>
          )}

          {step === 'meta' && (
            <>
              <Field label="Sinf">
                <select className="input" value={grade}
                  onChange={(e) => { setGrade(e.target.value === '' ? '' : Number(e.target.value)); setSubjectId('') }}>
                  <option value="">Tanlanmagan</option>
                  {Array.from({ length: 11 }, (_, i) => i + 1).map((g) =>
                    <option key={g} value={g}>{g}-sinf</option>)}
                </select>
              </Field>
              <Field label="Fan" hint={grade === '' ? undefined : 'sinfga mos fanlar'}>
                <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">Tanlanmagan</option>
                  {gradeSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <p className="micro" style={{ lineHeight: 1.55 }}>
                Ikkalasi ham majburiy emas — AI fanni javob paytida o'zi ham aniqlaydi.
              </p>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="surface-quiet" style={{
                padding: 'var(--s-4)', display: 'flex', gap: 12, alignItems: 'center',
              }}>
                <span aria-hidden style={{
                  width: 48, height: 48, borderRadius: 'var(--r-md)', fontSize: 24,
                  display: 'grid', placeItems: 'center',
                  background: `color-mix(in srgb, ${color} 16%, transparent)`,
                }}>{emoji}</span>
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <strong className="truncate" style={{ fontSize: 'var(--fs-sm)' }}>{name}</strong>
                  <span className="micro truncate">
                    {[grade ? `${grade}-sinf` : null,
                      subjects.find((s) => s.id === subjectId)?.name ?? null]
                      .filter(Boolean).join(' · ') || 'Fan tanlanmagan'}
                  </span>
                </div>
              </div>

              <dl style={{ display: 'grid', gap: 8, margin: 0 }}>
                <Row k="Fayl" v={file?.name ?? '—'} />
                <Row k="Hajmi" v={file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '—'} />
                {pageGuess && <Row k="Betlar" v={`~${pageGuess}`} />}
              </dl>

              <p className="micro" style={{ lineHeight: 1.55 }}>
                Yuklangandan so'ng matn ajratiladi va indekslanadi. Bu bir necha
                daqiqa olishi mumkin — oynani yopsangiz ham jarayon davom etadi.
              </p>
            </>
          )}

          {step === 'upload' && (
            <div style={{ display: 'grid', gap: 'var(--s-4)', justifyItems: 'center', paddingTop: 8 }}>
              {uploadError ? (
                <>
                  <AlertCircle size={34} style={{ color: 'var(--danger)' }} />
                  <p role="alert" style={{
                    fontSize: 'var(--fs-sm)', color: 'var(--danger)', textAlign: 'center', lineHeight: 1.6,
                  }}>{uploadError}</p>
                  <button className="btn btn-outline" onClick={() => setStep('review')}>
                    <ArrowLeft size={15} /> Orqaga
                  </button>
                </>
              ) : (
                <>
                  <Loader2 size={30} style={{ color: 'var(--brand)' }} className="spin" />
                  <div style={{ width: '100%', display: 'grid', gap: 6 }}>
                    <div style={{
                      height: 6, borderRadius: 99, background: 'var(--bg-hover)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: `${progress}%`, borderRadius: 99,
                        background: 'var(--brand-gradient)',
                        transition: 'width 400ms var(--ease)',
                      }} />
                    </div>
                    <span className="micro" aria-live="polite" style={{ textAlign: 'center' }}>
                      {progress < 30 ? 'Fayl yuborilmoqda…'
                        : progress < 95 ? 'Matn ajratilmoqda va indekslanmoqda…'
                        : 'Yakunlanmoqda…'} {progress}%
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>

        {step !== 'upload' && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={goBack}>
              {stepIndex === 0 ? 'Bekor' : 'Orqaga'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              disabled={!canAdvance[step]} onClick={goNext}>
              {step === 'review' ? 'Manbani qo\u02bcshish' : 'Davom etish'}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

/* ----------------------------- helpers ----------------------------- */

/** Counts user-perceived characters so emoji are not over-counted. */
function countGraphemes(s: string): number {
  const trimmed = s.trim()
  if (!trimmed) return 0
  const Seg = (Intl as unknown as {
    Segmenter?: new (l?: string, o?: { granularity: string }) => {
      segment(s: string): Iterable<unknown>
    }
  }).Segmenter
  if (Seg) return [...new Seg('uz', { granularity: 'grapheme' }).segment(trimmed)].length
  return [...trimmed].length
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)', fontWeight: 540 }}>
        {label}{hint && <span className="micro" style={{ marginLeft: 6 }}>{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
      <dt className="micro">{k}</dt>
      <dd className="truncate" style={{ margin: 0, fontSize: 'var(--fs-label)' }}>{v}</dd>
    </div>
  )
}
