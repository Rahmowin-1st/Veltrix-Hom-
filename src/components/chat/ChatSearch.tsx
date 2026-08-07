import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useOverlayRegistration } from '@/hooks/useOverlayRegistration'

/**
 * Find-in-chat.
 *
 * Searches only the conversation already in memory — no request, so results
 * appear as the user types. Matching runs over the plain text the message
 * renderer produces, so a match in an answer block is findable even though the
 * block is rendered as structured UI rather than a paragraph.
 */

export interface SearchableTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  turns: SearchableTurn[]
  onClose: () => void
  /** Scrolls the message with this id into view and flashes it. */
  onNavigate: (turnId: string) => void
}

/** Case- and diacritic-insensitive, so "o'zgaruvchi" matches "ozgaruvchi". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Uzbek text mixes U+2018/U+2019/U+02BB/U+02BC for the same sound.
    .replace(/[\u2018\u2019\u02BB\u02BC\u0060']/g, "'")
}

export function findMatches(turns: SearchableTurn[], query: string): string[] {
  const needle = normalize(query.trim())
  if (needle.length < 2) return []
  return turns.filter((turn) => normalize(turn.text).includes(needle)).map((turn) => turn.id)
}

export function ChatSearch({ turns, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Registers as an overlay so Android/browser Back closes search first,
  // before it closes the chat.
  useOverlayRegistration(true, 'chat-search', onClose)

  const matches = useMemo(() => findMatches(turns, query), [turns, query])

  useEffect(() => { inputRef.current?.focus() }, [])
  // A new query invalidates the old cursor position.
  useEffect(() => { setIndex(0) }, [query])

  useEffect(() => {
    const target = matches[index]
    if (target) onNavigate(target)
  }, [matches, index, onNavigate])

  const step = (delta: number) => {
    if (!matches.length) return
    // Wraps in both directions, so the control never dead-ends.
    setIndex((current) => (current + delta + matches.length) % matches.length)
  }

  return (
    <div className="v15-chat-search" role="search">
      <Search size={17} aria-hidden />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); step(event.shiftKey ? -1 : 1) }
          if (event.key === 'Escape') { event.preventDefault(); onClose() }
        }}
        placeholder="Chatdan qidirish…"
        aria-label="Chatdan qidirish"
      />
      <span className="v15-search-count" aria-live="polite">
        {query.trim().length < 2 ? '' : matches.length ? `${index + 1}/${matches.length}` : '0'}
      </span>
      <button type="button" onClick={() => step(-1)} disabled={!matches.length} aria-label="Oldingi natija">
        <ChevronUp size={17} />
      </button>
      <button type="button" onClick={() => step(1)} disabled={!matches.length} aria-label="Keyingi natija">
        <ChevronDown size={17} />
      </button>
      <button type="button" onClick={onClose} aria-label="Qidiruvni yopish">
        <X size={17} />
      </button>
    </div>
  )
}
