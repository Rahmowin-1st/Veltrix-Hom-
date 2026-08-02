import { BlockMath, InlineMath } from 'react-katex'
import type { AnswerBlock } from '@/types'

/** Renders the 15 block types the AI is allowed to emit. Nothing else. */
export function AnswerBlocks({ blocks }: { blocks: AnswerBlock[] }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  )
}

function Block({ block }: { block: AnswerBlock }) {
  switch (block.type) {
    case 'answer':
      return (
        <Card label="🎯 JAVOB" accent="var(--success)">
          <div style={{ fontSize: 22, fontWeight: 650, textAlign: 'center', padding: '6px 0' }}>
            <MathText text={block.text} />
          </div>
        </Card>
      )

    case 'steps':
      return (
        <Card label="🧩 YECHIM">
          <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {block.items.map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                    background: 'color-mix(in srgb, var(--violet) 18%, transparent)',
                    color: 'var(--violet)', fontSize: 12, fontWeight: 600,
                    display: 'grid', placeItems: 'center',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ lineHeight: 1.55 }}><MathText text={s} /></span>
              </li>
            ))}
          </ol>
        </Card>
      )

    case 'formula':
      return (
        <Card label="ƒ FORMULA">
          <div style={{ textAlign: 'center', overflowX: 'auto', padding: '4px 0' }}>
            <BlockMath math={block.latex} />
          </div>
          {block.caption && <Caption>{block.caption}</Caption>}
        </Card>
      )

    case 'table':
      return (
        <Card label="📊 JADVAL">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body-sm)' }}>
              <thead>
                <tr>
                  {block.headers.map((h, i) => (
                    <th key={i} style={{
                      textAlign: 'left', padding: '8px 10px', color: 'var(--text-2)',
                      fontSize: 'var(--fs-label)', fontWeight: 600,
                      borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} style={{ background: r % 2 ? 'var(--surface-raised)' : 'transparent' }}>
                    {row.map((cell, c) => (
                      <td key={c} style={{ padding: '8px 10px', lineHeight: 1.5 }}>
                        <MathText text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )

    case 'timeline':
      return (
        <Card label="🕰 XRONOLOGIYA">
          <div style={{ display: 'grid', gap: 14, paddingLeft: 4 }}>
            {block.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--violet)', marginTop: 5 }} />
                  {i < block.items.length - 1 && (
                    <span style={{ flex: 1, width: 1, background: 'var(--border)', marginTop: 4 }} />
                  )}
                </div>
                <div style={{ paddingBottom: 4 }}>
                  <strong style={{ color: 'var(--cyan)', fontSize: 'var(--fs-label)' }}>{it.date}</strong>
                  <p style={{ margin: '3px 0 0', lineHeight: 1.5 }}>{it.event}</p>
                  {it.cause && <Caption>Sabab: {it.cause}</Caption>}
                  {it.result && <Caption>Natija: {it.result}</Caption>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )

    case 'given':
      return (
        <Card label="📥 BERILGAN">
          <div style={{ display: 'grid', gap: 6 }}>
            {block.items.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 'var(--fs-body-sm)' }}>
                <span style={{ minWidth: 62, color: 'var(--text-2)', fontWeight: 500 }}>
                  <MathText text={g.symbol} />
                </span>
                <span style={{ color: 'var(--text-2)' }}>=</span>
                <span><MathText text={g.value} /></span>
              </div>
            ))}
          </div>
        </Card>
      )

    case 'rule':
      return (
        <div className="solid" style={{ padding: '12px 14px', borderLeft: '3px solid var(--violet)' }}>
          {block.title && (
            <strong style={{ display: 'block', marginBottom: 4, fontSize: 'var(--fs-label)', color: 'var(--violet)' }}>
              {block.title}
            </strong>
          )}
          <p style={{ margin: 0, lineHeight: 1.55, fontSize: 'var(--fs-body-sm)' }}>
            <MathText text={block.text} />
          </p>
        </div>
      )

    case 'compare':
      return (
        <Card label="⚖️ TAQQOSLASH">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Column tint="var(--success)" head="✅ To'g'ri" items={block.correct} />
            <Column tint="var(--danger)" head="❌ Noto'g'ri" items={block.wrong} />
          </div>
        </Card>
      )

    case 'translation':
      return (
        <Card label="🌐 TARJIMA">
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <Caption>{block.from}</Caption>
              <p style={{ margin: '2px 0 0', lineHeight: 1.55 }}>{block.original}</p>
            </div>
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />
            <div>
              <Caption>{block.to}</Caption>
              <p style={{ margin: '2px 0 0', lineHeight: 1.55, fontWeight: 500 }}>{block.translated}</p>
            </div>
          </div>
        </Card>
      )

    case 'warning':
      return (
        <div className="solid" style={{
          padding: '11px 14px', fontSize: 'var(--fs-body-sm)', lineHeight: 1.5,
          borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)',
          background: 'color-mix(in srgb, var(--warning) 8%, var(--surface))',
        }}>
          ⚠️ {block.text}
        </div>
      )

    case 'source_not_found':
      return (
        <div className="solid" style={{
          padding: 14, borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)',
          background: 'color-mix(in srgb, var(--danger) 7%, var(--surface))',
        }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>
            ⚠️ Bu ma'lumot tanlangan source ichida topilmadi.
          </strong>
          <Caption>📚 Qidirildi: {block.searched}</Caption>
          {block.nearby.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {block.nearby.map((n, i) => (
                <span key={i} className="pill">{n.page}-bet · {n.topic}</span>
              ))}
            </div>
          )}
        </div>
      )

    case 'chips':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {block.items.map((c, i) => <span key={i} className="pill pill-active">{c}</span>)}
        </div>
      )

    case 'quiz':
      return <Quiz block={block} />

    case 'note':
      return (
        <p style={{ margin: 0, fontSize: 'var(--fs-label)', color: 'var(--text-2)', lineHeight: 1.55 }}>
          <MathText text={block.text} />
        </p>
      )

    case 'code':
      return (
        <Card label={`💻 ${block.language.toUpperCase()}`}>
          <pre style={{
            margin: 0, overflowX: 'auto', fontSize: 13, lineHeight: 1.6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>
            <code>{block.code}</code>
          </pre>
        </Card>
      )
  }
}

/* ------------------------------- parts ----------------------------- */

function Card({ label, accent, children }: {
  label: string; accent?: string; children: React.ReactNode
}) {
  return (
    <section className="solid" style={{
      padding: '12px 14px',
      ...(accent ? { borderColor: `color-mix(in srgb, ${accent} 50%, transparent)` } : {}),
    }}>
      <span style={{
        display: 'block', marginBottom: 8, fontSize: 'var(--fs-label)',
        fontWeight: 600, letterSpacing: '0.04em',
        color: accent ?? 'var(--text-2)',
      }}>{label}</span>
      {children}
    </section>
  )
}

function Column({ tint, head, items }: { tint: string; head: string; items: string[] }) {
  return (
    <div>
      <strong style={{ display: 'block', marginBottom: 6, fontSize: 'var(--fs-label)', color: tint }}>
        {head}
      </strong>
      <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4 }}>
        {items.map((s, i) => (
          <li key={i} style={{ fontSize: 'var(--fs-body-sm)', lineHeight: 1.5 }}>{s}</li>
        ))}
      </ul>
    </div>
  )
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', fontSize: 'var(--fs-citation)', color: 'var(--text-2)', marginTop: 3 }}>
      {children}
    </span>
  )
}

function Quiz({ block }: { block: Extract<AnswerBlock, { type: 'quiz' }> }) {
  return (
    <Card label="🧠 TEKSHIRUV">
      <p style={{ margin: '0 0 10px', lineHeight: 1.5 }}><MathText text={block.question} /></p>
      <div style={{ display: 'grid', gap: 6 }}>
        {block.options.map((opt, i) => (
          <QuizOption key={i} text={opt} correct={i === block.answerIndex} />
        ))}
      </div>
    </Card>
  )
}

function QuizOption({ text, correct }: { text: string; correct: boolean }) {
  return (
    <button
      className="press"
      onClick={(e) => {
        const el = e.currentTarget
        el.style.borderColor = correct ? 'var(--success)' : 'var(--danger)'
        el.style.background = correct
          ? 'color-mix(in srgb, var(--success) 12%, transparent)'
          : 'color-mix(in srgb, var(--danger) 12%, transparent)'
      }}
      style={{
        textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)', background: 'var(--surface-raised)',
        color: 'var(--text)', fontSize: 'var(--fs-body-sm)', fontFamily: 'var(--font)',
        cursor: 'pointer',
      }}
    >
      {text}
    </button>
  )
}

/** Splits $inline$ and $$block$$ maths out of plain text. */
function MathText({ text }: { text: string }) {
  if (!text.includes('$')) return <>{text}</>
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('$$') && p.endsWith('$$')) {
          return <BlockMath key={i} math={p.slice(2, -2)} />
        }
        if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
          return <InlineMath key={i} math={p.slice(1, -1)} />
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
