import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderSinglePage } from '../../services/pdfVision.js'

describe('scanned PDF renderer compatibility', () => {
  it('renders one generated PDF page and releases the document cleanly', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([200, 200])
    page.drawText('Veltrix PDF security smoke', { x: 20, y: 100, size: 12 })
    const bytes = Buffer.from(await pdf.save())

    const rendered = await renderSinglePage(bytes, 1, 1)

    expect(rendered).not.toBeNull()
    expect(rendered?.pdfPage).toBe(1)
    expect(rendered?.mimeType).toBe('image/png')
    expect(rendered?.data.length ?? 0).toBeGreaterThan(100)
  })
})
