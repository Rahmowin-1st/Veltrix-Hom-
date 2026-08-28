import { describe, expect, it } from 'vitest'
import { registeredJobKinds } from './jobs.js'
import { parseSearchTypes, SEARCH_ENTITY_TYPES, searchEntityTypeSchema } from './part4Search.js'

describe('Part4 global search runtime contracts', () => {
  it('registers both durable search worker kinds', () => {
    expect(registeredJobKinds()).toContain('search.reindex')
    expect(registeredJobKinds()).toContain('search.reindex.batch')
  })

  it('keeps the search entity registry exact and bounded', () => {
    expect(SEARCH_ENTITY_TYPES).toEqual([
      'project','notebook','conversation','conversation_message','library_asset','library_content',
      'note','todo','goal','studio_artifact','tag','collection',
    ])
    for (const type of SEARCH_ENTITY_TYPES) expect(searchEntityTypeSchema.parse(type)).toBe(type)
    expect(searchEntityTypeSchema.safeParse('memory').success).toBe(false)
    expect(searchEntityTypeSchema.safeParse('notification').success).toBe(false)
  })

  it('normalizes comma-separated type filters without duplicates', () => {
    expect(parseSearchTypes('project,note,project')).toEqual(['project','note'])
    expect(parseSearchTypes(undefined)).toBeUndefined()
  })

  it('rejects unknown global-search type filters', () => {
    expect(() => parseSearchTypes('project,secret_table')).toThrow()
  })
})
