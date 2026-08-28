import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./quota.js', async () => {
  const actual = await vi.importActual<typeof import('./quota.js')>('./quota.js')
  return { ...actual, reconcileLibraryUsage: vi.fn(async () => ({ usedBytes: 0, reservedBytes: 0 })) }
})

import { admin } from '../services/supabase.js'
import { reconcileLibraryUsage } from './quota.js'
import { purgeExpiredPart2Trash } from './part2Trash.js'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const STORAGE = '33333333-3333-4333-8333-333333333333'

afterEach(() => vi.restoreAllMocks())

function queryFor(table: string) {
  let selectText = ''
  const query: any = {}
  query.select = vi.fn((value: string) => { selectText = value; return query })
  for (const method of ['eq', 'not', 'lt', 'order']) query[method] = vi.fn(() => query)
  query.limit = vi.fn(async () => {
    if (selectText === 'id,account_id') return { data: table === 'vh_library_assets' ? [{ id: ASSET, account_id: ACCOUNT }] : [], error: null }
    return { data: [], error: null }
  })
  query.maybeSingle = vi.fn(async () => {
    if (table === 'vh_library_assets') return { data: { id: ASSET, storage_object_id: STORAGE, trashed_at: '2026-07-01T00:00:00.000Z', purge_after: '2026-08-01T00:00:00.000Z' }, error: null }
    if (table === 'vh_storage_objects') return { data: { id: STORAGE, bucket: 'vh-library', object_path: `${ACCOUNT}/trash/original`, state: 'trashed' }, error: null }
    return { data: null, error: null }
  })
  return query
}

describe('Part 2 scheduled Trash purge', () => {
  it('physically removes an expired asset before atomic metadata cleanup and quota reconciliation', async () => {
    const storageRemove = vi.fn(async () => ({ data: [], error: null }))
    vi.spyOn(admin, 'from').mockImplementation(((table: string) => queryFor(table)) as any)
    vi.spyOn(admin, 'rpc').mockResolvedValue({ data: true, error: null } as any)
    vi.spyOn(admin.storage, 'from').mockReturnValue({ remove: storageRemove } as any)

    const result = await purgeExpiredPart2Trash(50)

    expect(result).toEqual({ scanned: 1, purged: 1, failed: 0 })
    expect(storageRemove).toHaveBeenCalledWith([`${ACCOUNT}/trash/original`])
    expect(admin.rpc).toHaveBeenCalledWith('vh_delete_part2_metadata', { p_account_id: ACCOUNT, p_kind: 'asset', p_object_id: ASSET })
    expect(reconcileLibraryUsage).toHaveBeenCalledWith(ACCOUNT)
  })
})
