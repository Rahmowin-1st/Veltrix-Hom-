import { describe, expect, it, vi } from 'vitest'
import {
  SourceExtractionError,
  extractDocx,
  extractEpub,
  extractMediaKnowledge,
  extractPptx,
  htmlToKnowledgeText,
} from './part2SourceExtract.js'

const DOCX = 'UEsDBBQAAAAIAIKBGV3HHBc8CgAAAAgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILda3AwBQSwMEFAAAAAgAgoEZXfXqRXdgAAAAmgAAABEAAAB3b3JkL2RvY3VtZW50LnhtbLMpt0rJTy7NTc0rUajIzckrtiq3VapQsrMpt0rKT6kE0QUgoghElNg55hRkJCq4+DtHKBQkFiWmFyUWZNjog2RAZBGYLEDX5JRakqiQnZdfnpOakp6KRbk+zDJ9hGvsAFBLAQIUAxQAAAAIAIKBGV3HHBc8CgAAAAgAAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAgoEZXfXqRXdgAAAAmgAAABEAAAAAAAAAAAAAAIABOwAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAACAAIAgAAAAMoAAAAAAA=='
const PPTX = 'UEsDBBQAAAAIAIKBGV3HHBc8CgAAAAgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILda3AwBQSwMEFAAAAAgAgoEZXWhX1V08AAAARgAAABUAAABwcHQvc2xpZGVzL3NsaWRlMi54bWyzKbAqzklRqMjNySu2KrBVqlCCshNtlSqV7GwSrUrsglOT8/NSFIpzMlNSFYDM5NSCEht9kIyNPli7HQBQSwMEFAAAAAgAgoEZXbSu24A8AAAARQAAABUAAABwcHQvc2xpZGVzL3NsaWRlMS54bWyzKbAqzklRqMjNySu2KrBVqlCCshNtlSqV7GwSrUrs3DKLiksUinMyU1IVSjJS84tSc230QRI2+mDddgBQSwECFAMUAAAACACCgRldxxwXPAoAAAAIAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAIKBGV1oV9VdPAAAAEYAAAAVAAAAAAAAAAAAAACAATsAAABwcHQvc2xpZGVzL3NsaWRlMi54bWxQSwECFAMUAAAACACCgRldtK7bgDwAAABFAAAAFQAAAAAAAAAAAAAAgAGqAAAAcHB0L3NsaWRlcy9zbGlkZTEueG1sUEsFBgAAAAADAAMAxwAAABkBAAAAAA=='
const EPUB = 'UEsDBBQAAAAIAIKBGV1vYassFgAAABQAAAAIAAAAbWltZXR5cGVLLCjIyUxOLMnMz9NPLShN0q7KLAAAUEsDBBQAAAAIAIKBGV3iFcbyUwAAAGwAAAAWAAAATUVUQS1JTkYvY29udGFpbmVyLnhtbLOxr8jNUShLLSrOzM+zVTLUM1Cyt7NJzs8rSczMSy2ysynKzy9Jy8xJLUYwFdJKc3J0CxJLMmyV/F2dAoL1QepT80r08gvSlPTtbPSRNOkjzAIAUEsDBBQAAAAIAIKBGV3Q4fvseAAAAPEAAAARAAAAT0VCUFMvY29udGVudC5vcGaVzzsOwyAMANCrINYqRTBD7mIRJ1gFaiUe0tsX5aNG3bJZ/jzbniG+YMLeF6g04iK9J8GiaAg6Wq3SjGOLErDgbJ9rkpK1KjgQdPJhDBqYM0UQelezlR9razFXx/057pZjfqctTBV3uXkN31V7rrsm3TZ7TJjzzy9QSwMEFAAAAAgAgoEZXUwaYyVEAAAASgAAABQAAABPRUJQUy9jaGFwdGVyMS54aHRtbLPJKMnNsbNJyk+ptLPJMLRzzkgsKEktUvDPS7XRB/JtCuxcA0KdFBJzCjISFbLz8stzUlPSU/Vs9AvsbPQh2vTBZgAAUEsDBBQAAAAIAIKBGV01zJrjQwAAAEkAAAAUAAAAT0VCUFMvY2hhcHRlcjIueGh0bWyzySjJzbGzScpPqbSzyTC0c85ILChJLVIIKc+30QfybQrsXANCnRSSUksSFbLz8stzUlPSU/Vs9AvsbPQhuvTBRgAAUEsBAhQDFAAAAAgAgoEZXW9hqywWAAAAFAAAAAgAAAAAAAAAAAAAAIABAAAAAG1pbWV0eXBlUEsBAhQDFAAAAAgAgoEZXeIVxvJTAAAAbAAAABYAAAAAAAAAAAAAAIABPAAAAE1FVEEtSU5GL2NvbnRhaW5lci54bWxQSwECFAMUAAAACACCgRld0OH77HgAAADxAAAAEQAAAAAAAAAAAAAAgAHDAAAAT0VCUFMvY29udGVudC5vcGZQSwECFAMUAAAACACCgRldTBpjJUQAAABKAAAAFAAAAAAAAAAAAAAAgAFqAQAAT0VCUFMvY2hhcHRlcjEueGh0bWxQSwECFAMUAAAACACCgRldNcya40MAAABJAAAAFAAAAAAAAAAAAAAAgAHgAQAAT0VCUFMvY2hhcHRlcjIueGh0bWxQSwUGAAAAAAUABQA9AQAAVQIAAAAA'

const bytes = (value: string) => Buffer.from(value, 'base64')

describe('Part 2 canonical source extraction', () => {
  it('extracts DOCX paragraphs with paragraph provenance', async () => {
    const pieces = await extractDocx(bytes(DOCX))
    expect(pieces.map(piece => piece.content)).toEqual(['Alpha DOCX paragraph', 'Beta knowledge'])
    expect(pieces.map(piece => piece.locator)).toEqual([{ paragraph: 1 }, { paragraph: 2 }])
  })

  it('extracts PPTX in numeric slide order with slide provenance', async () => {
    const pieces = await extractPptx(bytes(PPTX))
    expect(pieces.map(piece => piece.content)).toEqual(['First slide theorem', 'Second slide concept'])
    expect(pieces.map(piece => piece.locator)).toEqual([{ slide: 1 }, { slide: 2 }])
  })

  it('extracts EPUB spine order with chapter/path provenance', async () => {
    const pieces = await extractEpub(bytes(EPUB))
    expect(pieces).toHaveLength(2)
    expect(pieces[0]?.content).toContain('Chapter One')
    expect(pieces[0]?.content).toContain('EPUB alpha knowledge')
    expect(pieces[0]?.locator).toMatchObject({ chapter: 1, path: 'OEBPS/chapter1.xhtml', spineId: 'c1' })
    expect(pieces[1]?.locator).toMatchObject({ chapter: 2, path: 'OEBPS/chapter2.xhtml', spineId: 'c2' })
  })

  it('turns an image provider response into grounded vision knowledge', async () => {
    const provider = vi.fn(async () => JSON.stringify({ text: 'Visible formula: E = mc^2. Diagram shows mass-energy equivalence.' }))
    const pieces = await extractMediaKnowledge({ accountId: '11111111-1111-4111-8111-111111111111', kind: 'image', mime: 'image/png', buffer: Buffer.from('image'), title: 'Physics' }, provider as any)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(pieces[0]?.content).toContain('E = mc^2')
    expect(pieces[0]?.locator).toEqual({ image: 1, modality: 'vision' })
  })

  it('turns audio/video provider responses into timestamped transcript knowledge', async () => {
    const provider = vi.fn(async () => JSON.stringify({ segments: [
      { startSeconds: 0, endSeconds: 4.5, text: 'First spoken concept' },
      { startSeconds: 4.5, endSeconds: 8, text: 'Second spoken concept' },
    ] }))
    for (const kind of ['audio', 'video'] as const) {
      const pieces = await extractMediaKnowledge({ accountId: '11111111-1111-4111-8111-111111111111', kind, mime: kind === 'audio' ? 'audio/mpeg' : 'video/mp4', buffer: Buffer.from(kind) }, provider as any)
      expect(pieces).toHaveLength(2)
      expect(pieces[0]?.locator).toEqual({ modality: 'transcript', startSeconds: 0, endSeconds: 4.5 })
      expect(pieces[1]?.content).toBe('Second spoken concept')
    }
  })

  it('sanitizes web HTML into study text without executable/script content', () => {
    const text = htmlToKnowledgeText('<html><style>.x{display:none}</style><script>steal()</script><body><h1>Public theorem</h1><p>Useful web knowledge.</p></body></html>')
    expect(text).toContain('Public theorem')
    expect(text).toContain('Useful web knowledge')
    expect(text).not.toContain('steal')
    expect(text).not.toContain('display:none')
  })

  it('fails a malformed Office archive safely', async () => {
    await expect(extractDocx(Buffer.from('PK\u0003\u0004malformed'))).rejects.toBeInstanceOf(SourceExtractionError)
  })
})
