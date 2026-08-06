import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, USER_A, USER_B } from './harness.js'
import { parseTocPage, looksLikeToc } from '../../services/tocRouter.js'

/**
 * TOC extraction and routing (spec §8 extract_toc, §10).
 *
 * In V10 this table existed and `routeQuery` read from it, but nothing ever
 * wrote to it — a database-only feature. These tests cover the parser that now
 * feeds it and the atomic replace that stores it.
 */
describe('table-of-contents extraction', () => {
  it('recognises a real contents page', () => {
    const page = [
      'MUNDARIJA',
      '',
      '1-bob. Algebra asoslari ................ 5',
      '2-bob. Tenglamalar ..................... 27',
      '3-bob. Geometriya ...................... 84',
    ].join('\n')
    expect(looksLikeToc(page)).toBe(true)
    const entries = parseTocPage(page)
    expect(entries.length).toBe(3)
    expect(entries[0]?.topic).toContain('Algebra')
    expect(entries[0]?.printedPage).toBe(5)
    expect(entries[2]?.printedPage).toBe(84)
  })

  it('does not mistake ordinary prose for a contents page', () => {
    const prose = [
      'Bugungi darsda biz tenglamalar bilan tanishamiz.',
      'Masalan, x + 2 = 5 tenglamasini yechamiz.',
      'Javob 3 ga teng.',
    ].join('\n')
    expect(looksLikeToc(prose)).toBe(false)
    expect(parseTocPage(prose).length).toBe(0)
  })

  it('ignores page-number bands and junk lines', () => {
    // A footer band like "12 .... 13" must not become a topic.
    const junk = ['12 ......... 13', '.... 7', 'A ... 4'].join('\n')
    expect(parseTocPage(junk).length).toBe(0)
  })

  it('handles dotted, dashed and spaced leaders', () => {
    const page = [
      'Kirish · · · · · · · · 3',
      'Bo\u2018lim 1 ———— 11',
      'Ilova          250',
    ].join('\n')
    const entries = parseTocPage(page)
    expect(entries.length).toBe(3)
    expect(entries.map((e) => e.printedPage)).toEqual([3, 11, 250])
  })
})

describe('toc persistence and routing data', () => {
  let db: PGlite
  const SRC = '00000000-0000-0000-0000-0000000000f1'
  beforeAll(async () => {
    db = await createTestDb()
    await db.exec(`insert into sources (id,user_id,title,status,page_count)
                   values ('${SRC}','${USER_A}','Book','ready',300)`)
  })
  afterAll(async () => { await db.close() })

  const save = (user: string, entries: unknown[]) =>
    db.query<{ n: number }>(`select replace_toc_entries($1,$2,$3::jsonb,$4) as n`,
      [user, SRC, JSON.stringify(entries), 2])

  it('stores entries and stamps the source TOC state', async () => {
    const r = await save(USER_A, [
      { topic: 'Algebra', printed_page: 5 },
      { topic: 'Geometriya', printed_page: 84 },
    ])
    expect(r.rows[0]?.n).toBe(2)
    const src = await db.query<{ toc_status: string; toc_entry_count: number }>(
      `select toc_status, toc_entry_count from sources where id=$1`, [SRC])
    expect(src.rows[0]?.toc_status).toBe('done')
    expect(src.rows[0]?.toc_entry_count).toBe(2)
  })

  it('re-parsing replaces the old TOC instead of accumulating duplicates', async () => {
    await save(USER_A, [{ topic: 'Faqat bitta', printed_page: 9 }])
    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from source_toc_entries where source_id=$1`, [SRC])
    expect(rows.rows[0]?.n).toBe(1)
  })

  it('rejects a non-owner', async () => {
    const r = await save(USER_B, [{ topic: 'Stolen', printed_page: 1 }])
    expect(r.rows[0]?.n).toBe(-1)
    const rows = await db.query<{ topic: string }>(
      `select topic from source_toc_entries where source_id=$1`, [SRC])
    expect(rows.rows[0]?.topic).toBe('Faqat bitta')
  })

  it('drops entries with an unusable topic', async () => {
    const r = await save(USER_A, [
      { topic: 'Yaxshi mavzu', printed_page: 3 },
      { topic: 'x', printed_page: 4 },   // too short to be a topic
      { topic: '', printed_page: 5 },
    ])
    expect(r.rows[0]?.n).toBe(1)
  })
})
