import type { AnswerBlock } from '@/types'

/**
 * Flattens answer blocks to plain text.
 *
 * Shared by Copy and by find-in-chat, so both see exactly the same content:
 * a phrase the user can see in a rendered table or answer card is therefore
 * also findable and copyable. Formulas are kept as LaTeX source, which is the
 * only lossless plain-text form of them.
 */
export function blocksToPlainText(blocks: AnswerBlock[]): string {
  const output: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'answer': output.push(`Javob: ${block.text}`); break
      case 'steps': output.push(block.items.map((item, index) => `${index + 1}. ${item}`).join('\n')); break
      case 'formula': output.push(block.latex); break
      case 'rule': case 'note': case 'warning': output.push(block.text); break
      case 'code': output.push(block.code); break
      case 'translation': output.push(`${block.original}\n${block.translated}`); break
      case 'given': output.push(block.items.map((item) => `${item.symbol} = ${item.value}`).join(', ')); break
      case 'table': output.push([block.headers.join(' | '), ...block.rows.map((row) => row.join(' | '))].join('\n')); break
      case 'timeline': output.push(block.items.map((item) => `${item.date}: ${item.event}`).join('\n')); break
      case 'compare': output.push(`To‘g‘ri: ${block.correct.join(', ')}. Noto‘g‘ri: ${block.wrong.join(', ')}`); break
      case 'chips': output.push(block.items.join(', ')); break
      case 'quiz': output.push(`${block.question}\n${block.options.join('\n')}`); break
      case 'source_not_found': output.push(`Manba topilmadi: ${block.searched}`); break
    }
  }
  return output.join('\n\n')
}
