import type { LucideIcon } from 'lucide-react'
import {
  Calculator, ScanText, BookOpenCheck, CheckCircle2,
  Lightbulb, ListChecks, Languages, FileSearch,
} from 'lucide-react'

/**
 * Modes are the product's real capabilities. Each one declares the fields
 * it needs and how those fields become a prompt, so a mode window is
 * generated from data rather than hand-built eight times.
 *
 * Every mode maps onto slash commands the backend already understands —
 * nothing here invents a capability the server cannot serve.
 */

export type FieldKind = 'text' | 'textarea' | 'source' | 'page' | 'image' | 'file' | 'select'

export interface ModeField {
  key: string
  kind: FieldKind
  label: string
  placeholder?: string
  hint?: string
  required?: boolean
  rows?: number
  options?: { value: string; label: string }[]
  /** Accepted MIME list for image/file fields. */
  accept?: string
}

export interface ModeDef {
  id: string
  title: string
  subtitle: string
  Icon: LucideIcon
  color: string
  /** Slash command prefix the backend already parses. */
  command: string
  fields: ModeField[]
  /** Turns collected values into the final prompt text. */
  build: (v: Record<string, string>) => string
  /** Shown in the empty state of the mode window. */
  examples: string[]
}

const SOURCE_FIELD: ModeField = {
  key: 'source', kind: 'source', label: 'Manba',
  hint: 'Tanlanmasa AI mos kitobni o\u02bczi qidiradi',
}

const PAGE_FIELD: ModeField = {
  key: 'page', kind: 'page', label: 'Bet', placeholder: '54',
  hint: 'Ixtiyoriy',
}

export const MODES: ModeDef[] = [
  {
    id: 'solve',
    title: 'Masalani yechish',
    subtitle: 'Bosqichma-bosqich yechim va yakuniy javob',
    Icon: Calculator,
    color: '#0A6CFF',
    command: '/toliq',
    fields: [
      { key: 'task', kind: 'textarea', label: 'Masala', rows: 4, required: true,
        placeholder: '3x − 5 = 16 tenglamani yeching' },
      { key: 'image', kind: 'image', label: 'Rasm', hint: 'Daftardagi masalani suratga oling' },
      SOURCE_FIELD,
    ],
    build: (v) => v.task || 'Rasmdagi masalani yech.',
    examples: [
      '2x + 7 = 19 tenglamani yeching',
      'Uchburchak yuzini toping: a=6, h=4',
      'Kasrlarni qo\u02bcshing: 3/4 + 2/5',
    ],
  },

  {
    id: 'photo',
    title: 'Rasmni tahlil qilish',
    subtitle: 'Daftar yoki kitob rasmidagi vazifani bajaradi',
    Icon: ScanText,
    color: '#1E9BFF',
    command: '',
    fields: [
      { key: 'image', kind: 'image', label: 'Rasm', required: true,
        hint: 'Galereya yoki kamera' },
      { key: 'task', kind: 'textarea', label: "Qo'shimcha ko'rsatma", rows: 2,
        placeholder: 'Faqat 3- va 4-mashqni yech' },
    ],
    build: (v) => v.task || 'Rasmdagi barcha vazifani bajar va yechimini tushuntir.',
    examples: ['Rasmdagi mashqlarni yech', 'Bu sahifadagi savollarga javob ber'],
  },

  {
    id: 'book',
    title: 'Kitobdan javob',
    subtitle: 'Faqat yuklangan manbadan, bet raqami bilan',
    Icon: BookOpenCheck,
    color: '#0E8F52',
    command: '/lock',
    fields: [
      { key: 'source', kind: 'source', label: 'Manba', required: true,
        hint: 'Javob faqat shu kitobdan olinadi' },
      PAGE_FIELD,
      { key: 'task', kind: 'textarea', label: 'Savol', rows: 3, required: true,
        placeholder: 'Fotosintez jarayoni qanday kechadi?' },
    ],
    build: (v) => v.task ?? '',
    examples: ['54-betdagi qoidani tushuntir', 'Bu bo\u02bclimning asosiy g\u02bcoyasi nima?'],
  },

  {
    id: 'check',
    title: 'Javobni tekshirish',
    subtitle: "To'g'rimi, xato qayerda, to'g'ri javob qanday",
    Icon: CheckCircle2,
    color: '#C87B00',
    command: '/tekshir',
    fields: [
      { key: 'question', kind: 'textarea', label: 'Savol', rows: 2, required: true,
        placeholder: '5x − 3 = 12 tenglamani yeching' },
      { key: 'answer', kind: 'textarea', label: 'Sizning javobingiz', rows: 3, required: true,
        placeholder: 'x = 4' },
      { key: 'image', kind: 'image', label: 'Yozgan javobingiz rasmi' },
      SOURCE_FIELD,
    ],
    build: (v) => `SAVOL: ${v.question ?? ""}\n\nMENING JAVOBIM: ${v.answer ?? ""}`,
    examples: [],
  },

  {
    id: 'explain',
    title: 'Sodda tushuntirish',
    subtitle: "Sinfingizga mos til, o'xshatish va misol",
    Icon: Lightbulb,
    color: '#8B5CF6',
    command: '/sodda',
    fields: [
      { key: 'topic', kind: 'text', label: 'Mavzu', required: true,
        placeholder: 'Nyutonning ikkinchi qonuni' },
      SOURCE_FIELD,
    ],
    build: (v) => `Mavzu: ${v.topic ?? ''}`,
    examples: ['Fotosintez', 'Kasrlarni qisqartirish', 'Present Perfect'],
  },

  {
    id: 'quiz',
    title: 'Test yaratish',
    subtitle: "Mavzu bo'yicha savollar va javoblar",
    Icon: ListChecks,
    color: '#D42E48',
    command: '/test',
    fields: [
      { key: 'topic', kind: 'text', label: 'Mavzu', required: true,
        placeholder: 'Kvadrat tenglamalar' },
      { key: 'count', kind: 'select', label: 'Savollar soni',
        options: [
          { value: '5', label: '5 ta' },
          { value: '10', label: '10 ta' },
          { value: '15', label: '15 ta' },
        ] },
      SOURCE_FIELD,
    ],
    build: (v) => `Mavzu: ${v.topic ?? ''}`,
    examples: [],
  },

  {
    id: 'analyze',
    title: 'Faylni tahlil qilish',
    subtitle: 'PDF, rasm yoki hujjatdan xulosa va javob',
    Icon: FileSearch,
    color: '#4ACEFF',
    command: '',
    fields: [
      { key: 'file', kind: 'file', label: 'Fayl', required: true,
        accept: 'application/pdf,image/*,text/plain',
        hint: 'PDF, rasm yoki matn fayli' },
      { key: 'task', kind: 'textarea', label: 'Nima qilish kerak', rows: 3,
        placeholder: 'Asosiy fikrlarni ajratib ber' },
    ],
    build: (v) => v.task || 'Ushbu faylni tahlil qil va asosiy mazmunini tushuntir.',
    examples: ['Qisqacha xulosa qil', 'Savollarga javob top', 'Jadval ma\u02bclumotini tushuntir'],
  },

  {
    id: 'translate',
    title: 'Tarjima',
    subtitle: 'Matn, rasm, audio va hujjat tarjimasi',
    Icon: Languages,
    color: '#2680F0',
    command: '/tarjima',
    fields: [],
    build: () => '',
    examples: [],
  },
]

export function modeById(id: string | undefined): ModeDef | undefined {
  return MODES.find((m) => m.id === id)
}

/** Assembles the final prompt: mode command + mode-specific body. */
export function buildPrompt(mode: ModeDef, values: Record<string, string>): string {
  const parts: string[] = []

  if (mode.id === 'quiz') parts.push(`/test ${values.count || '5'}`)
  else if (mode.command) parts.push(mode.command)

  if (values.page?.trim()) parts.push(`/bet ${values.page.trim()}`)

  const body = mode.build(values).trim()
  if (body) parts.push(body)

  return parts.join(' ')
}
