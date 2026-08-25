import type { NextFunction, Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admin } from '../services/supabase.js'
import { decodeLibraryCursor, detectSource, encodeLibraryCursor, v1Part2Router } from './part2.js'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const NOTEBOOK = '22222222-2222-4222-8222-222222222222'
const CANDIDATE = '33333333-3333-4333-8333-333333333333'

afterEach(() => vi.restoreAllMocks())

function routeHandler(path: string, method: string) {
  const layer = (v1Part2Router as any).stack.find((entry: any) => entry.route?.path === path && entry.route?.methods?.[method])
  if (!layer) throw new Error(`route_not_found:${method}:${path}`)
  return layer.route.stack[0].handle as (req: Request, res: Response, next: NextFunction) => Promise<unknown>
}

function terminalQuery(data: unknown) {
  const query: any = {}
  for (const method of ['select', 'eq', 'is', 'not', 'in', 'order', 'limit']) query[method] = vi.fn(() => query)
  query.single = vi.fn(async () => ({ data, error: null }))
  query.maybeSingle = vi.fn(async () => ({ data, error: null }))
  return query
}

describe('Part 2 safety edges', () => {
  it('rejects a Research candidate pointing at loopback before any network fetch or Library ingest', async () => {
    const candidate = {
      id: CANDIDATE,
      account_id: ACCOUNT,
      research_session_id: '44444444-4444-4444-8444-444444444444',
      source_url: 'http://127.0.0.1/internal',
      title: 'Unsafe candidate',
      accepted_asset_id: null,
      provenance: {},
      vh_research_sessions: { notebook_id: NOTEBOOK },
    }
    const fromSpy = vi.spyOn(admin, 'from').mockImplementation(((table: string) => {
      if (table !== 'vh_research_candidates') throw new Error(`unexpected_table:${table}`)
      return terminalQuery(candidate)
    }) as any)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const next = vi.fn()
    const req = { accountId: ACCOUNT, params: { notebookId: NOTEBOOK, candidateId: CANDIDATE }, body: {} } as unknown as Request
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response

    await routeHandler('/notebooks/:notebookId/research/candidates/:candidateId/add', 'post')(req, res, next)

    expect(fromSpy).toHaveBeenCalledWith('vh_research_candidates')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 400, code: 'RESEARCH_URL_UNSAFE' })
    expect((res.status as any)).not.toHaveBeenCalled()
  })

  it('detects supported content from bytes instead of trusting a spoofed declared type', () => {
    const pdf = detectSource(Buffer.from('%PDF-1.7\n% Veltrix'), 'application/octet-stream')
    expect(pdf).toEqual({ mime: 'application/pdf', kind: 'pdf', assetClass: 'file', supported: true })
    const png = detectSource(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'application/octet-stream')
    expect(png).toEqual({ mime: 'image/png', kind: 'image', assetClass: 'image', supported: true })
    const unknown = detectSource(Buffer.from([1, 2, 3, 4]), 'application/x-veltrix-unknown')
    expect(unknown.supported).toBe(false)
  })

  it('cryptographically binds Library cursors to the exact query fingerprint', () => {
    const cursor = encodeLibraryCursor({ v: 1, fingerprint: 'filter-A', sort: 'created', dir: 'desc', value: '2026-08-25T00:00:00.000Z', id: ACCOUNT })
    expect(decodeLibraryCursor(cursor, 'filter-A')).toMatchObject({ fingerprint: 'filter-A', sort: 'created', dir: 'desc', id: ACCOUNT })
    expect(() => decodeLibraryCursor(cursor, 'filter-B')).toThrow(/does not match this query/i)
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    decoded.id = NOTEBOOK
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    expect(() => decodeLibraryCursor(tampered, 'filter-A')).toThrow(/does not match this query/i)
  })
})
