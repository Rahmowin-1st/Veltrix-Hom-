import { describe, expect, it } from 'vitest'
import { noteDocumentSchema, validateNoteDocument } from './part4Productivity.js'

const allKinds = [
  { type: 'h1', runs: [{ text: 'Title', marks: [{ kind: 'bold' }] }] },
  { type: 'h2', runs: [{ text: 'Heading' }] },
  { type: 'h3', runs: [{ text: 'Subheading' }] },
  { type: 'paragraph', runs: [{ text: 'Text', marks: [{ kind: 'italic' }, { kind: 'underline' }, { kind: 'strikethrough' }, { kind: 'monospace' }, { kind: 'color', value: '#112233' }, { kind: 'highlight', value: '#ffee00' }, { kind: 'font', value: 'serif' }] }] },
  { type: 'quote', runs: [{ text: 'Quote' }] },
  { type: 'callout', runs: [{ text: 'Info' }], tone: 'info' },
  { type: 'bullet_list', items: [{ runs: [{ text: 'A' }] }] },
  { type: 'number_list', items: [{ runs: [{ text: '1' }] }] },
  { type: 'check_list', items: [{ runs: [{ text: 'Done' }], checked: true }] },
  { type: 'collapsible', title: [{ text: 'More' }], hidden: true, children: [{ type: 'paragraph', runs: [{ text: 'Hidden' }] }] },
  { type: 'divider' },
  { type: 'link', label: [{ text: 'OpenAI' }], href: 'https://example.com' },
  { type: 'table', rows: [['a','b'],['c','d']] },
  { type: 'code', language: 'ts', code: 'const x = 1' },
  { type: 'formula', latex: 'E=mc^2' },
  { type: 'image', assetId: '11111111-1111-4111-8111-111111111111' },
  { type: 'file', assetId: '11111111-1111-4111-8111-111111111111' },
  { type: 'library_embed', assetId: '11111111-1111-4111-8111-111111111111' },
  { type: 'entity_reference', entityType: 'goal', entityId: '11111111-1111-4111-8111-111111111111' },
  { type: 'citation', text: 'Source', locator: 'p. 2' },
  { type: 'info_card', title: 'Card', body: 'Body' },
  { type: 'timeline', events: [{ when: '2026', title: 'Event' }] },
  { type: 'map_embed', latitude: 41.3, longitude: 69.2, label: 'Place' },
  { type: 'concept_embed', conceptKey: 'gravity', title: 'Gravity' },
  { type: 'template', templateKey: 'cornell', fields: { topic: 'Physics' } },
  { type: 'section', children: [{ type: 'paragraph', runs: [{ text: 'Section' }] }] },
  { type: 'columns', columns: [{ children: [{ type: 'paragraph', runs: [{ text: 'L' }] }] }, { children: [{ type: 'paragraph', runs: [{ text: 'R' }] }] }] },
]

describe('Part4 rich Note schema', () => {
  it('supports the frozen rich block vocabulary', () => {
    const parsed = validateNoteDocument(allKinds)
    expect(parsed).toHaveLength(allKinds.length)
  })

  it('rejects arbitrary html/script block types', () => {
    expect(noteDocumentSchema.safeParse([{ type: 'html', html: '<script>alert(1)</script>' }]).success).toBe(false)
    expect(noteDocumentSchema.safeParse([{ type: 'script', code: 'alert(1)' }]).success).toBe(false)
  })

  it('rejects unapproved font metadata and unsafe link syntax', () => {
    expect(noteDocumentSchema.safeParse([{ type: 'paragraph', runs: [{ text: 'x', marks: [{ kind: 'font', value: 'remote-font' }] }] }]).success).toBe(false)
    expect(noteDocumentSchema.safeParse([{ type: 'link', label: [{ text: 'x' }], href: 'javascript:alert(1)' }]).success).toBe(false)
  })

  it('bounds nested structured content', () => {
    let node: any = { type: 'paragraph', runs: [{ text: 'leaf' }] }
    for (let i = 0; i < 13; i++) node = { type: 'section', children: [node] }
    expect(() => validateNoteDocument([node])).toThrow()
  })
})
