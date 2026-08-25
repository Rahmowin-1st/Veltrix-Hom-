import { describe, expect, it } from 'vitest'
import {
  PART3_BLOCK_TYPES,
  answerBlockSchema,
  codeBlockSchema,
  contentBlockSchema,
  functionBlockSchema,
  mapBlockSchema,
  parseContentBlock,
  parseContentBlocks,
  templateBlockSchema,
  writingBlockSchema,
} from './part3Blocks.js'

describe('Part 3 typed content block registry', () => {
  it('registers the frozen initial semantic block types', () => {
    expect(PART3_BLOCK_TYPES).toEqual([
      'answer', 'explanation', 'quote', 'note_proposal', 'todo_proposal', 'goal_proposal', 'checklist', 'code', 'function',
      'formula', 'table', 'map', 'timeline', 'template', 'steps', 'warning', 'definition', 'example', 'citation', 'writing',
      'file_preview', 'studio_artifact_preview', 'interactive_test',
    ])
  })

  it('keeps the Stage 30 Answer envelope backward-compatible', () => {
    expect(answerBlockSchema.parse({ id: 'answer-1', type: 'answer', version: 1, text: 'Hello' })).toEqual({
      id: 'answer-1', type: 'answer', version: 1, text: 'Hello',
    })
  })

  it('validates structured Writing without raw executable presentation fields', () => {
    const value = writingBlockSchema.parse({
      id: 'writing-1',
      type: 'writing',
      version: 1,
      title: 'Study note',
      nodes: [
        { id: 'h1', type: 'heading', level: 1, text: 'Physics', marks: [{ type: 'bold' }], align: 'center', fontKey: 'serif' },
        { id: 'p1', type: 'paragraph', text: 'Read the source.', marks: [{ type: 'link', href: 'https://example.com/source' }, { type: 'inline_code' }], textColor: { token: 'accent' } },
        { id: 'list1', type: 'bullet_list', items: [{ id: 'li1', text: 'First fact', marks: [] }] },
        { id: 'code1', type: 'code_block', language: 'ts', code: 'const x = 1\n' },
        { id: 'fold1', type: 'collapse', title: 'More', children: [{ id: 'inner1', type: 'paragraph', text: 'Hidden detail', marks: [] }] },
        { id: 'hidden1', type: 'hidden', children: [{ id: 'inner2', type: 'quote', text: 'Private detail', marks: [] }] },
        { id: 'd1', type: 'divider' },
      ],
    })
    expect(value.nodes).toHaveLength(7)

    expect(() => writingBlockSchema.parse({
      id: 'writing-bad', type: 'writing', version: 1,
      nodes: [{ id: 'p1', type: 'paragraph', text: 'x', marks: [], html: '<script>alert(1)</script>' }],
    })).toThrow()

    expect(() => writingBlockSchema.parse({
      id: 'writing-bad-link', type: 'writing', version: 1,
      nodes: [{ id: 'p1', type: 'paragraph', text: 'x', marks: [{ type: 'link', href: 'javascript:alert(1)' }] }],
    })).toThrow()
  })

  it('preserves exact code text while validating bounded metadata', () => {
    const code = 'function f() {\n  return "  exact  ";\n}\n'
    const block = codeBlockSchema.parse({
      id: 'code-1', type: 'code', version: 1, language: 'typescript', code, filename: 'index.ts', lineNumbers: true,
    })
    expect(block.code).toBe(code)
  })

  it('validates Function inputs and outputs as typed lists', () => {
    const block = functionBlockSchema.parse({
      id: 'function-1', type: 'function', version: 1, name: 'sum', purpose: 'Adds values',
      inputs: [{ name: 'a', dataType: 'number', required: true }, { name: 'b', dataType: 'number', required: true }],
      outputs: [{ name: 'result', dataType: 'number' }], code: 'const sum = (a, b) => a + b', exampleUsage: 'sum(1, 2)',
    })
    expect(block.inputs).toHaveLength(2)
    expect(block.outputs[0]?.name).toBe('result')
  })

  it('accepts a bounded Map whose groups, edges and hierarchy resolve real nodes', () => {
    const block = mapBlockSchema.parse({
      id: 'map-1', type: 'map', version: 1, mapType: 'concept',
      nodes: [
        { id: 'n1', label: 'Energy', groupId: 'g1' },
        { id: 'n2', label: 'Motion', groupId: 'g1' },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'relates to' }],
      groups: [{ id: 'g1', label: 'Physics', nodeIds: ['n1', 'n2'] }],
      hierarchy: [{ parentId: 'n1', childId: 'n2' }],
      labels: { n1: 'Root' }, metadata: { subject: 'physics' },
    })
    expect(block.edges).toHaveLength(1)
  })

  it('rejects duplicate or dangling Map graph identities and enforces size caps', () => {
    expect(() => mapBlockSchema.parse({
      id: 'map-duplicate', type: 'map', version: 1, mapType: 'concept',
      nodes: [{ id: 'n1', label: 'A' }, { id: 'n1', label: 'B' }], edges: [], groups: [], hierarchy: [], labels: {}, metadata: {},
    })).toThrow()

    expect(() => mapBlockSchema.parse({
      id: 'map-dangling', type: 'map', version: 1, mapType: 'concept',
      nodes: [{ id: 'n1', label: 'A' }], edges: [{ id: 'e1', from: 'n1', to: 'missing' }], groups: [], hierarchy: [], labels: {}, metadata: {},
    })).toThrow()

    expect(() => mapBlockSchema.parse({
      id: 'map-large', type: 'map', version: 1, mapType: 'generic',
      nodes: Array.from({ length: 301 }, (_, index) => ({ id: `n${index}`, label: `Node ${index}` })),
      edges: [], groups: [], hierarchy: [], labels: {}, metadata: {},
    })).toThrow()
  })

  it('validates reusable Template fields and rejects presentation ambiguity', () => {
    const block = templateBlockSchema.parse({
      id: 'template-1', type: 'template', version: 1, title: 'Research plan', templateType: 'research_plan',
      sections: [{
        id: 'section-1', title: 'Question', fields: [
          { id: 'topic', label: 'Topic', fieldType: 'text', required: true, defaultValue: 'Physics' },
          { id: 'method', label: 'Method', fieldType: 'select', options: ['Experiment', 'Review'] },
        ],
      }],
      instructions: 'Fill in each section.',
    })
    expect(block.sections[0]?.fields).toHaveLength(2)

    expect(() => templateBlockSchema.parse({
      id: 'template-bad', type: 'template', version: 1, title: 'Bad', templateType: 'bad',
      sections: [{ id: 's1', title: 'S', fields: [{ id: 'f1', label: 'Field', fieldType: 'text', options: ['not allowed'] }] }],
    })).toThrow()
  })

  it('preserves unknown future type/version only as inert bounded JSON', () => {
    expect(parseContentBlock({ id: 'future-1', type: 'diagram_future', version: 2, payload: { nodes: ['a', 'b'] } })).toMatchObject({
      kind: 'unknown', executable: false, id: 'future-1', type: 'diagram_future', version: 2,
    })
    expect(parseContentBlock({ id: 'answer-v2', type: 'answer', version: 2, text: 'future shape' })).toMatchObject({
      kind: 'unknown', executable: false, type: 'answer', version: 2,
    })
  })

  it('fails closed for malformed known current-version blocks instead of treating them as unknown', () => {
    expect(() => parseContentBlock({ id: 'answer-1', type: 'answer', version: 1, text: '' })).toThrow()
    expect(() => contentBlockSchema.parse({ id: 'code-1', type: 'code', version: 1, language: 'ts', code: '', executable: true })).toThrow()
  })

  it('caps the final stored current-version block array', () => {
    const blocks = Array.from({ length: 101 }, (_, index) => ({ id: `answer-${index}`, type: 'answer', version: 1, text: 'x' }))
    expect(() => parseContentBlocks(blocks)).toThrow()
  })
})
