/* Types mirror server/src/db/schema.sql exactly. No `any` anywhere. */

export type Theme = 'dark' | 'light' | 'system'
export type PerformanceMode = 'auto' | 'on' | 'off'
export type AnswerLength = 'short' | 'normal' | 'detailed'
export type AnswerStyle = 'plain' | 'structured' | 'detailed' | 'concise'
export type SolutionStyle = 'steps' | 'final' | 'hint_first' | 'both'
export type SourceStrictness = 'flexible' | 'strict' | 'allow_general'
export type ExplanationDepth = 'simple' | 'standard' | 'deep'
export type LearningStyle = 'visual' | 'example_first' | 'theory_first' | 'step_by_step' | 'guided' | 'balanced'
export type StickerLevel = 'off' | 'low' | 'normal' | 'high'
export type SourceMode = 'locked' | 'auto' | 'none' | 'not_found'
export type SourceStatus =
  | 'queued' | 'extracting' | 'ocr' | 'embedding' | 'ready' | 'failed'
export type OutputFormat =
  | 'answer_only' | 'short' | 'full' | 'notebook' | 'voice' | 'quiz'

export interface Profile {
  id: string
  full_name: string | null
  preferred_name: string | null
  avatar_url: string | null
  grade: number | null
  school_language: string
  learning_language: string
  onboarding_done: boolean
  xp: number
  streak_days: number
  last_active: string | null
  created_at: string
}

export interface UserSettings {
  user_id: string
  theme: Theme
  glass_intensity: number
  reduced_motion: boolean
  compact_mode: boolean
  performance_mode: PerformanceMode
  answer_length: AnswerLength
  age_adapted: boolean
  source_only: boolean
  citation_required: boolean
  show_formulas: boolean
  sticker_level: StickerLevel
  teacher_mode: boolean
  voice_gender: 'male' | 'female'
  voice_age: 'young' | 'adult'
  voice_rate: number
  voice_volume: number
  auto_read: boolean
  tr_source_lang: string
  tr_target_lang: string
  tr_show_original: boolean
  tr_remember_last: boolean
  auto_source: boolean
  font_scale: number
  tr_last_target: string | null
  tr_auto_read: boolean
  voice_name: string | null
  high_contrast: boolean
  haptics: boolean
  sound_on_done: boolean
  cache_enabled: boolean
  default_skill_id: string | null
  default_answer_mode: string
  sidebar_collapsed: boolean
  enabled_subjects: string[]
  accent_color: string
  accent_secondary: string
  chat_gradient_from: string
  chat_gradient_to: string
  chat_background_url: string | null
  chat_background_blur: number
  mirror_intensity: number
  greeting_rotation: boolean
  confetti_enabled: boolean
  wrong_answer_haptics: boolean
  /* --- V16 Settings (migration-013) --- */
  answer_style: AnswerStyle
  solution_style: SolutionStyle
  example_count: number
  source_strictness: SourceStrictness
  markdown_format: boolean
  include_examples: boolean
  explanation_depth: ExplanationDepth
  address_name: string | null
  custom_instructions: string | null
  learning_style: LearningStyle
  ai_language: string
  notifications_enabled: boolean
}

export interface Subject {
  min_grade?: number | null
  max_grade?: number | null
  id: string
  user_id: string
  name: string
  slug: string
  emoji: string | null
  color: string | null
  is_system: boolean
}

export interface Source {
  emoji: string
  color: string
  file_size: number | null
  mime_type: string | null
  file_hash: string | null
  id: string
  user_id: string
  subject_id: string | null
  title: string
  author: string | null
  grade: number | null
  storage_path: string | null
  external_url: string | null
  cover_url: string | null
  page_count: number
  status: SourceStatus
  progress: number
  error_message: string | null
  embedding_ready?: boolean
  processing_warning?: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

/* --- AI answer blocks: the UI renders exactly these 14 types ---------- */

export interface Citation {
  page: number
  quote: string
  ref?: string
  source_id?: string
}

export type AnswerBlock =
  | { type: 'answer'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'formula'; latex: string; caption?: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'timeline'; items: { date: string; event: string; cause?: string; result?: string }[] }
  | { type: 'given'; items: { symbol: string; value: string }[] }
  | { type: 'rule'; title?: string; text: string }
  | { type: 'compare'; correct: string[]; wrong: string[] }
  | { type: 'translation'; from: string; to: string; original: string; translated: string }
  | { type: 'warning'; text: string }
  | { type: 'source_not_found'; searched: string; nearby: { page: number; topic: string }[] }
  | { type: 'chips'; items: string[] }
  | { type: 'quiz'; question: string; options: string[]; answerIndex: number }
  | { type: 'note'; text: string }
  | { type: 'code'; language: string; code: string }

export interface AiAnswer {
  subject: string
  topic: string
  blocks: AnswerBlock[]
  citations: Citation[]
  stickers: string[]
  confidence: number
  followups: string[]
}

export interface Message {
  id: string
  chat_id: string
  role: 'user' | 'assistant' | 'system'
  content: string | null
  blocks: AnswerBlock[] | null
  detected_subject: string | null
  used_source_id: string | null
  source_mode: SourceMode | null
  model_used: string | null
  latency_ms: number | null
  created_at: string
}

/* --- Sidebar / history ---------------------------------------------- */

export interface ChatSummary {
  id: string
  title: string | null
  updated_at: string
  pinned: boolean
  archived?: boolean
  project_id: string | null
  draft?: string | null
  skill_id?: string | null
  locked_source_id?: string | null
}

export interface ChatSearchHit {
  id: string
  title: string | null
  updated_at: string
  pinned: boolean
  project_id: string | null
  snippet: string | null
}

/** Account-synced: lives in the projects table, visible on every device. */
export interface Project {
  id: string
  user_id: string
  name: string
  emoji: string
  color: string
  subject_id: string | null
  grade: number | null
  instructions: string | null
  answer_length: AnswerLength
  archived: boolean
  pinned: boolean
  skill_id: string | null
  created_at: string
  updated_at: string
  chat_count: number
  source_count: number
}

/** A reusable AI instruction profile. Account-synced. */
export interface Skill {
  id: string
  user_id: string
  name: string
  emoji: string
  color: string
  background_color?: string | null
  icon_url?: string | null
  subject_slug?: string | null
  description: string | null
  instructions: string | null
  scope: 'global' | 'project' | 'subject'
  project_id: string | null
  subject_id: string | null
  is_default: boolean
  use_count: number
  created_at: string
  updated_at: string
}


/* --- Activity + quizzes (migration 005) ---------------------------- */

export interface ActivityDay {
  day: string
  points: number
  actions: number
}

export interface ActivitySummary {
  weekPoints: number
  monthPoints: number
  bestDayPoints: number
  activeLast3: number
  activeLast30: number
  days: ActivityDay[]
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  user_id: string
  position: number
  question: string
  explanation: string | null
  media_url: string | null
  options: string[]
  correct_index: number
  points: number
  created_at: string
}

export interface Quiz {
  id: string
  user_id: string
  title: string
  description: string | null
  icon: string
  cover_url: string | null
  background_color: string
  background_logo: string | null
  source_id: string | null
  subject_id: string | null
  generation_mode: 'manual' | 'ai'
  prompt: string | null
  question_count: number
  per_question_seconds: number | null
  total_seconds: number | null
  shuffle_questions: boolean
  shuffle_options: boolean
  published: boolean
  created_at: string
  updated_at: string
  questions?: QuizQuestion[]
}

export interface QuizAttempt {
  id: string
  quiz_id: string
  user_id: string
  started_at: string
  completed_at: string | null
  score: number
  max_score: number
  correct_count: number
  wrong_count: number
  unanswered_count: number
  duration_seconds: number | null
  question_order: string[]
}
