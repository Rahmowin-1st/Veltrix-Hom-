import { z } from 'zod'

export const PART3_BLOCK_REGISTRY_VERSION = 1 as const
export const PART3_BLOCK_MAX_COUNT = 100
export const PART3_BLOCK_MAX_SERIALIZED_BYTES = 1_000_000
export const PART3_BLOCK_MAX_TEXT = 200_000

const blockIdSchema = z.string().min(1).max(96).regex(/^[A-Za-z0-9._:-]+$/)
const shortTextSchema = z.string().min(1).max(2_000)
const longTextSchema = z.string().min(1).max(PART3_BLOCK_MAX_TEXT)
const optionalLongTextSchema = z.string().max(PART3_BLOCK_MAX_TEXT).optional()
const safeUrlSchema = z.string().max(2_048).url().refine(value => /^https?:\/\//i.test(value), 'Only http/https links are allowed.')
const safeKeySchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/)
const jsonScalarSchema = z.union([z.string().max(8_000), z.number().finite(), z.boolean(), z.null()])
const boundedMetadataSchema = z.record(jsonScalarSchema).superRefine((value, ctx) => {
  if (Object.keys(value).length > 50) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Metadata supports at most 50 keys.' })
})

const baseBlockShape = {
  id: blockIdSchema,
  version: z.literal(PART3_BLOCK_REGISTRY_VERSION),
}

export const answerBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('answer'),
  text: longTextSchema,
}).strict()

export const explanationBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('explanation'),
  text: longTextSchema,
}).strict()

export const quoteBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('quote'),
  text: longTextSchema,
  attribution: z.string().max(500).optional(),
}).strict()

const proposalFieldsSchema = z.record(jsonScalarSchema).superRefine((value, ctx) => {
  if (Object.keys(value).length > 40) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Proposal supports at most 40 fields.' })
})

function proposalBlockSchema<T extends 'note_proposal' | 'todo_proposal' | 'goal_proposal'>(type: T) {
  return z.object({
    ...baseBlockShape,
    type: z.literal(type),
    proposalState: z.literal('PROPOSED'),
    title: shortTextSchema,
    summary: z.string().max(8_000).optional(),
    fields: proposalFieldsSchema.default({}),
  }).strict()
}

export const noteProposalBlockSchema = proposalBlockSchema('note_proposal')
export const todoProposalBlockSchema = proposalBlockSchema('todo_proposal')
export const goalProposalBlockSchema = proposalBlockSchema('goal_proposal')

export const checklistBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('checklist'),
  items: z.array(z.object({
    id: blockIdSchema,
    text: z.string().min(1).max(4_000),
    checked: z.boolean().default(false),
  }).strict()).min(1).max(100),
}).strict()

export const codeBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('code'),
  language: safeKeySchema,
  code: z.string().max(PART3_BLOCK_MAX_TEXT),
  filename: z.string().min(1).max(255).optional(),
  lineNumbers: z.boolean().optional(),
  explanation: z.string().max(20_000).optional(),
}).strict()

const functionPortSchema = z.object({
  name: safeKeySchema,
  dataType: z.string().min(1).max(160),
  description: z.string().max(2_000).optional(),
  required: z.boolean().optional(),
}).strict()

export const functionBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('function'),
  name: z.string().min(1).max(160),
  purpose: z.string().min(1).max(8_000),
  inputs: z.array(functionPortSchema).max(100),
  outputs: z.array(functionPortSchema.omit({ required: true })).max(100),
  code: z.string().max(PART3_BLOCK_MAX_TEXT),
  exampleUsage: z.string().max(50_000).optional(),
  explanation: z.string().max(20_000).optional(),
}).strict()

export const formulaBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('formula'),
  expression: z.string().min(1).max(20_000),
  format: z.enum(['latex', 'plain']).default('latex'),
  explanation: z.string().max(20_000).optional(),
}).strict()

export const tableBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('table'),
  columns: z.array(z.string().min(1).max(500)).min(1).max(50),
  rows: z.array(z.array(z.string().max(8_000)).max(50)).max(500),
  caption: z.string().max(2_000).optional(),
}).strict().superRefine((value, ctx) => {
  for (const [index, row] of value.rows.entries()) {
    if (row.length !== value.columns.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index], message: 'Every table row must match the column count.' })
    }
  }
})

const mapNodeSchema = z.object({
  id: blockIdSchema,
  label: z.string().min(1).max(500),
  groupId: blockIdSchema.optional(),
  description: z.string().max(4_000).optional(),
  metadata: boundedMetadataSchema.optional(),
}).strict()

const mapEdgeSchema = z.object({
  id: blockIdSchema,
  from: blockIdSchema,
  to: blockIdSchema,
  label: z.string().max(500).optional(),
  directed: z.boolean().default(true),
  metadata: boundedMetadataSchema.optional(),
}).strict()

const mapGroupSchema = z.object({
  id: blockIdSchema,
  label: z.string().min(1).max(500),
  nodeIds: z.array(blockIdSchema).max(300),
}).strict()

const mapHierarchyLinkSchema = z.object({
  parentId: blockIdSchema,
  childId: blockIdSchema,
}).strict()

const boundedLabelsSchema = z.record(z.string().max(500)).superRefine((value, ctx) => {
  if (Object.keys(value).length > 300) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Map labels support at most 300 keys.' })
})

export const mapBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('map'),
  mapType: z.enum(['concept', 'flow', 'dependency', 'learning', 'generic']),
  nodes: z.array(mapNodeSchema).max(300),
  edges: z.array(mapEdgeSchema).max(600),
  groups: z.array(mapGroupSchema).max(100).default([]),
  hierarchy: z.array(mapHierarchyLinkSchema).max(600).default([]),
  labels: boundedLabelsSchema.default({}),
  metadata: boundedMetadataSchema.default({}),
}).strict().superRefine((value, ctx) => {
  const nodeIds = new Set<string>()
  for (const [index, node] of value.nodes.entries()) {
    if (nodeIds.has(node.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'id'], message: 'Map node IDs must be unique.' })
    nodeIds.add(node.id)
  }
  const groupIds = new Set<string>()
  for (const [index, group] of value.groups.entries()) {
    if (groupIds.has(group.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['groups', index, 'id'], message: 'Map group IDs must be unique.' })
    groupIds.add(group.id)
    for (const nodeId of group.nodeIds) {
      if (!nodeIds.has(nodeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['groups', index, 'nodeIds'], message: `Unknown map node: ${nodeId}` })
    }
  }
  const edgeIds = new Set<string>()
  for (const [index, edge] of value.edges.entries()) {
    if (edgeIds.has(edge.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index, 'id'], message: 'Map edge IDs must be unique.' })
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.from)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index, 'from'], message: `Unknown map node: ${edge.from}` })
    if (!nodeIds.has(edge.to)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index, 'to'], message: `Unknown map node: ${edge.to}` })
  }
  for (const [index, relation] of value.hierarchy.entries()) {
    if (!nodeIds.has(relation.parentId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hierarchy', index, 'parentId'], message: `Unknown map node: ${relation.parentId}` })
    if (!nodeIds.has(relation.childId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hierarchy', index, 'childId'], message: `Unknown map node: ${relation.childId}` })
  }
  for (const [index, node] of value.nodes.entries()) {
    if (node.groupId && !groupIds.has(node.groupId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'groupId'], message: `Unknown map group: ${node.groupId}` })
  }
})

export const timelineBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('timeline'),
  events: z.array(z.object({
    id: blockIdSchema,
    label: z.string().min(1).max(1_000),
    timeLabel: z.string().min(1).max(500),
    description: z.string().max(4_000).optional(),
  }).strict()).min(1).max(200),
}).strict()

const templateDefaultSchema = z.union([jsonScalarSchema, z.array(jsonScalarSchema).max(50)])
const templateFieldSchema = z.object({
  id: blockIdSchema,
  label: z.string().min(1).max(500),
  fieldType: z.enum(['text', 'long_text', 'number', 'checkbox', 'date', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(500)).max(100).optional(),
  defaultValue: templateDefaultSchema.optional(),
  instructions: z.string().max(4_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.fieldType === 'select' && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Select fields require bounded options.' })
  }
  if (value.fieldType !== 'select' && value.options !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Only select fields may define options.' })
  }
})

const templateSectionSchema = z.object({
  id: blockIdSchema,
  title: z.string().min(1).max(1_000),
  instructions: z.string().max(8_000).optional(),
  fields: z.array(templateFieldSchema).max(50),
}).strict()

export const templateBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('template'),
  title: z.string().min(1).max(1_000),
  templateType: safeKeySchema,
  sections: z.array(templateSectionSchema).min(1).max(50),
  instructions: z.string().max(20_000).optional(),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>()
  let fieldCount = 0
  for (const [sectionIndex, section] of value.sections.entries()) {
    if (ids.has(section.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'id'], message: 'Template IDs must be unique.' })
    ids.add(section.id)
    for (const [fieldIndex, field] of section.fields.entries()) {
      fieldCount += 1
      if (ids.has(field.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'fields', fieldIndex, 'id'], message: 'Template IDs must be unique.' })
      ids.add(field.id)
    }
  }
  if (fieldCount > 200) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections'], message: 'Template supports at most 200 fields.' })
})

const writingColorSchema = z.union([
  z.object({ token: z.enum(['default', 'muted', 'accent', 'danger', 'success', 'warning']) }).strict(),
  z.object({ hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }).strict(),
])

const writingMarkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('underline') }).strict(),
  z.object({ type: z.literal('strike') }).strict(),
  z.object({ type: z.literal('monospace') }).strict(),
  z.object({ type: z.literal('inline_code') }).strict(),
  z.object({ type: z.literal('highlight'), color: writingColorSchema }).strict(),
  z.object({ type: z.literal('link'), href: safeUrlSchema }).strict(),
  z.object({ type: z.literal('text_color'), color: writingColorSchema }).strict(),
])

const writingCommonSchema = {
  align: z.enum(['start', 'center', 'end', 'justify']).optional(),
  size: z.enum(['small', 'body', 'large', 'display']).optional(),
  fontKey: z.enum(['system', 'serif', 'monospace', 'editorial']).optional(),
  textColor: writingColorSchema.optional(),
  highlightColor: writingColorSchema.optional(),
  treatment: z.enum(['plain', 'subtle', 'callout', 'emphasis']).optional(),
}

const writingTextNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('paragraph'),
  text: z.string().max(20_000),
  marks: z.array(writingMarkSchema).max(24).default([]),
  ...writingCommonSchema,
}).strict()

const writingHeadingNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().min(1).max(4_000),
  marks: z.array(writingMarkSchema).max(24).default([]),
  ...writingCommonSchema,
}).strict()

const writingQuoteNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('quote'),
  text: z.string().min(1).max(20_000),
  marks: z.array(writingMarkSchema).max(24).default([]),
  attribution: z.string().max(500).optional(),
  ...writingCommonSchema,
}).strict()

const writingListItemSchema = z.object({
  id: blockIdSchema,
  text: z.string().min(1).max(8_000),
  marks: z.array(writingMarkSchema).max(24).default([]),
}).strict()

const writingBulletListNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('bullet_list'),
  items: z.array(writingListItemSchema).min(1).max(100),
  ...writingCommonSchema,
}).strict()

const writingNumberedListNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('numbered_list'),
  items: z.array(writingListItemSchema).min(1).max(100),
  startAt: z.number().int().min(1).max(10_000).default(1),
  ...writingCommonSchema,
}).strict()

const writingChecklistNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('checklist'),
  items: z.array(writingListItemSchema.extend({ checked: z.boolean().default(false) }).strict()).min(1).max(100),
  ...writingCommonSchema,
}).strict()

const writingCodeNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('code_block'),
  code: z.string().max(PART3_BLOCK_MAX_TEXT),
  language: safeKeySchema.optional(),
  ...writingCommonSchema,
}).strict()

const writingDividerNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('divider'),
  treatment: z.enum(['plain', 'subtle', 'emphasis']).optional(),
}).strict()

const writingLeafNodeSchema = z.discriminatedUnion('type', [
  writingTextNodeSchema,
  writingHeadingNodeSchema,
  writingQuoteNodeSchema,
  writingBulletListNodeSchema,
  writingNumberedListNodeSchema,
  writingChecklistNodeSchema,
  writingCodeNodeSchema,
  writingDividerNodeSchema,
])

const writingCollapsibleNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('collapse'),
  title: z.string().min(1).max(2_000),
  children: z.array(writingLeafNodeSchema).max(50),
  collapsedByDefault: z.boolean().default(true),
  ...writingCommonSchema,
}).strict()

const writingHiddenNodeSchema = z.object({
  id: blockIdSchema,
  type: z.literal('hidden'),
  label: z.string().max(2_000).optional(),
  children: z.array(writingLeafNodeSchema).max(50),
  ...writingCommonSchema,
}).strict()

export const writingNodeSchema = z.union([writingLeafNodeSchema, writingCollapsibleNodeSchema, writingHiddenNodeSchema])

export const writingBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('writing'),
  title: z.string().max(1_000).optional(),
  nodes: z.array(writingNodeSchema).min(1).max(250),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>()
  let nestedCount = 0
  const register = (id: string, path: Array<string | number>) => {
    if (ids.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Writing node IDs must be unique.' })
    ids.add(id)
  }
  for (const [index, node] of value.nodes.entries()) {
    register(node.id, ['nodes', index, 'id'])
    if (node.type === 'collapse' || node.type === 'hidden') {
      for (const [childIndex, child] of node.children.entries()) {
        nestedCount += 1
        register(child.id, ['nodes', index, 'children', childIndex, 'id'])
      }
    }
  }
  if (value.nodes.length + nestedCount > 500) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: 'Writing document supports at most 500 total nodes.' })
})

export const stepsBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('steps'),
  steps: z.array(z.object({ id: blockIdSchema, title: z.string().max(1_000).optional(), text: z.string().min(1).max(8_000) }).strict()).min(1).max(100),
}).strict()

export const warningBlockSchema = z.object({ ...baseBlockShape, type: z.literal('warning'), title: z.string().max(1_000).optional(), text: longTextSchema }).strict()
export const definitionBlockSchema = z.object({ ...baseBlockShape, type: z.literal('definition'), term: z.string().min(1).max(1_000), definition: longTextSchema }).strict()
export const exampleBlockSchema = z.object({ ...baseBlockShape, type: z.literal('example'), title: z.string().max(1_000).optional(), text: longTextSchema }).strict()

export const citationBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('citation'),
  sourceId: blockIdSchema,
  label: z.string().max(1_000).optional(),
  locator: boundedMetadataSchema.default({}),
  quote: z.string().max(8_000).optional(),
  url: safeUrlSchema.optional(),
}).strict()

export const filePreviewBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('file_preview'),
  assetId: blockIdSchema,
  title: z.string().min(1).max(1_000),
  mimeType: z.string().min(1).max(255).optional(),
  previewKind: z.enum(['file', 'image', 'generated_artifact']).default('file'),
}).strict()

export const studioArtifactPreviewBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('studio_artifact_preview'),
  placeholder: z.literal(true),
  title: z.string().max(1_000).optional(),
}).strict()

const interactiveOptionSchema = z.object({
  id: blockIdSchema,
  text: z.string().min(1).max(4_000),
  isCorrect: z.boolean(),
}).strict()

export const interactiveTestBlockSchema = z.object({
  ...baseBlockShape,
  type: z.literal('interactive_test'),
  questions: z.array(z.object({
    id: blockIdSchema,
    prompt: z.string().min(1).max(8_000),
    options: z.array(interactiveOptionSchema).min(2).max(12),
    explanation: z.string().max(8_000).optional(),
    hint: z.string().max(4_000).optional(),
    status: z.literal('UNANSWERED').default('UNANSWERED'),
  }).strict()).min(1).max(50),
}).strict().superRefine((value, ctx) => {
  for (const [index, question] of value.questions.entries()) {
    const correct = question.options.filter(option => option.isCorrect).length
    if (correct !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'options'], message: 'Single-answer questions require exactly one correct option.' })
  }
})

export const contentBlockSchema = z.discriminatedUnion('type', [
  answerBlockSchema,
  explanationBlockSchema,
  quoteBlockSchema,
  noteProposalBlockSchema,
  todoProposalBlockSchema,
  goalProposalBlockSchema,
  checklistBlockSchema,
  codeBlockSchema,
  functionBlockSchema,
  formulaBlockSchema,
  tableBlockSchema,
  mapBlockSchema,
  timelineBlockSchema,
  templateBlockSchema,
  stepsBlockSchema,
  warningBlockSchema,
  definitionBlockSchema,
  exampleBlockSchema,
  citationBlockSchema,
  writingBlockSchema,
  filePreviewBlockSchema,
  studioArtifactPreviewBlockSchema,
  interactiveTestBlockSchema,
])

export const PART3_BLOCK_TYPES = [
  'answer', 'explanation', 'quote', 'note_proposal', 'todo_proposal', 'goal_proposal', 'checklist', 'code', 'function',
  'formula', 'table', 'map', 'timeline', 'template', 'steps', 'warning', 'definition', 'example', 'citation', 'writing',
  'file_preview', 'studio_artifact_preview', 'interactive_test',
] as const

const knownTypeSet = new Set<string>(PART3_BLOCK_TYPES)
const blockEnvelopeSchema = z.object({
  id: blockIdSchema,
  type: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
  version: z.number().int().positive().max(10_000),
}).passthrough()

type InertJsonStats = { nodes: number; chars: number }

function inspectInertJson(value: unknown, depth: number, seen: WeakSet<object>): InertJsonStats {
  if (depth > 16) throw new Error('Unknown block exceeds safe JSON depth.')
  if (value === null || typeof value === 'boolean') return { nodes: 1, chars: 0 }
  if (typeof value === 'string') return { nodes: 1, chars: value.length }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Unknown block contains a non-finite number.')
    return { nodes: 1, chars: 0 }
  }
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error('Unknown block array is too large.')
    let nodes = 1
    let chars = 0
    for (const item of value) {
      const stats = inspectInertJson(item, depth + 1, seen)
      nodes += stats.nodes
      chars += stats.chars
    }
    return { nodes, chars }
  }
  if (typeof value === 'object') {
    const objectValue = value as object
    if (seen.has(objectValue)) throw new Error('Unknown block contains a cycle.')
    const prototype = Object.getPrototypeOf(objectValue)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('Unknown block contains a non-JSON object.')
    seen.add(objectValue)
    const entries = Object.entries(objectValue)
    if (entries.length > 500) throw new Error('Unknown block object has too many keys.')
    let nodes = 1
    let chars = 0
    for (const [key, item] of entries) {
      chars += key.length
      const stats = inspectInertJson(item, depth + 1, seen)
      nodes += stats.nodes
      chars += stats.chars
    }
    seen.delete(objectValue)
    return { nodes, chars }
  }
  throw new Error('Unknown block contains a non-JSON value.')
}

function assertSafeInertJson(value: unknown) {
  const stats = inspectInertJson(value, 0, new WeakSet<object>())
  if (stats.nodes > 5_000) throw new Error('Unknown block contains too many JSON nodes.')
  if (stats.chars > 250_000) throw new Error('Unknown block is too large to preserve safely.')
}

export type AnswerBlock = z.infer<typeof answerBlockSchema>
export type ContentBlock = z.infer<typeof contentBlockSchema>
export type ParsedContentBlock =
  | { kind: 'known'; executable: true; block: ContentBlock }
  | { kind: 'unknown'; executable: false; id: string; type: string; version: number; raw: unknown }

export function parseContentBlock(input: unknown): ParsedContentBlock {
  const envelope = blockEnvelopeSchema.parse(input)
  if (knownTypeSet.has(envelope.type) && envelope.version === PART3_BLOCK_REGISTRY_VERSION) {
    return { kind: 'known', executable: true, block: contentBlockSchema.parse(input) }
  }
  assertSafeInertJson(input)
  return { kind: 'unknown', executable: false, id: envelope.id, type: envelope.type, version: envelope.version, raw: input }
}

export function parseContentBlocks(input: unknown): ContentBlock[] {
  const blocks = z.array(contentBlockSchema).max(PART3_BLOCK_MAX_COUNT).parse(input)
  const bytes = Buffer.byteLength(JSON.stringify(blocks), 'utf8')
  if (bytes > PART3_BLOCK_MAX_SERIALIZED_BYTES) throw new Error('Content block payload exceeds the persisted message limit.')
  return blocks
}
