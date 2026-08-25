import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
import { QUOTA_CONTRACTS } from './quota.js'
import {
  assertPublicResearchUrl,
  chunkText,
  decodeLibraryCursor,
  detectSource,
  encodeLibraryCursor,
  normalizeTagName,
} from './part2.js'
import {
  decodeLibraryQueryCursor,
  encodeLibraryQueryCursor,
} from './part2Library.js'

describe('Part 2 deterministic contracts', () => {
  it('keeps canonical Part 2 quota boundaries', () => {
    expect(QUOTA_CONTRACTS.library.warningBytes).toBe(900 * 1024 * 1024)
    expect(QUOTA_CONTRACTS.library.hardBytes).toBe(1024 * 1024 * 1024)
    expect(QUOTA_CONTRACTS.projectReference.maxItems).toBe(20)
    expect(QUOTA_CONTRACTS.projectReference.maxTotalBytes).toBe(50 * 1024 * 1024)
  })

  it('normalizes tag identity deterministically', () => {
    expect(normalizeTagName('  Physics   Notes  ')).toBe('physics notes')
    expect(normalizeTagName('ＦＯＯ')).toBe('foo')
  })

  it('detects supported and unsupported source classes from bytes', () => {
    expect(detectSource(Buffer.from('%PDF-1.7\n'), 'application/octet-stream')).toMatchObject({ kind: 'pdf', supported: true })
    expect(detectSource(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), 'application/octet-stream')).toMatchObject({ kind: 'image', assetClass: 'image', supported: true })
    expect(detectSource(Buffer.from('plain text'), 'audio/mpeg')).toMatchObject({ kind: 'audio', supported: false })
  })

  it('chunks large text with bounded overlap and stable ordering', () => {
    const text = Array.from({ length: 120 }, (_, i) => `sentence-${i} ${'x'.repeat(30)}.`).join(' ')
    const chunks = chunkText(text, 500, 80)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.every(chunk => chunk.content.length > 0 && chunk.start >= 0 && chunk.end > chunk.start)).toBe(true)
    expect(chunks.every(chunk => chunk.content.length <= 650)).toBe(true)
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]!.start).toBeLessThan(chunks[i - 1]!.end)
  })

  it('signs and rejects tampered base Library cursors', () => {
    const encoded = encodeLibraryCursor({ v: 1, fingerprint: 'f'.repeat(64), sort: 'created', dir: 'desc', ts: '2026-08-25T00:00:00.000Z', text: null, num: null, id: '11111111-1111-4111-8111-111111111111' })
    expect(decodeLibraryCursor(encoded, 'f'.repeat(64)).id).toBe('11111111-1111-4111-8111-111111111111')
    expect(() => decodeLibraryCursor(encoded, '0'.repeat(64))).toThrow(ApiError)
    const raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    raw.id = '22222222-2222-4222-8222-222222222222'
    const tampered = Buffer.from(JSON.stringify(raw)).toString('base64url')
    expect(() => decodeLibraryCursor(tampered, 'f'.repeat(64))).toThrow(ApiError)
  })

  it('binds specialized Library cursor to the exact filter fingerprint', () => {
    const encoded = encodeLibraryQueryCursor({ v: 1, fingerprint: 'a'.repeat(64), sort: 'size', dir: 'asc', ts: null, text: null, num: 42, id: '11111111-1111-4111-8111-111111111111' })
    expect(decodeLibraryQueryCursor(encoded, 'a'.repeat(64)).num).toBe(42)
    expect(() => decodeLibraryQueryCursor(encoded, 'b'.repeat(64))).toThrow(ApiError)
  })

  it('rejects local/private and non-HTTP research URLs before fetch', async () => {
    for (const url of ['file:///etc/passwd','http://localhost/x','http://127.0.0.1/x','http://10.0.0.1/x','http://169.254.169.254/latest','http://192.168.1.4/x','http://172.16.0.1/x','http://[::1]/x']) {
      await expect(assertPublicResearchUrl(url)).rejects.toBeInstanceOf(ApiError)
    }
  })
})
