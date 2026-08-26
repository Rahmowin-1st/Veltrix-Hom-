import { describe, expect, it } from 'vitest'
import {
  interactiveTestBlockSchema,
  goalProposalBlockSchema,
  noteProposalBlockSchema,
  todoProposalBlockSchema,
} from './part3Blocks.js'
import {
  interactiveAnswerInputSchema,
  proposalConfirmationInputSchema,
  PART3_PROPOSAL_PERSISTENCE_AVAILABLE,
} from './part3Interactions.js'

describe('Part 3 Stage 50 inline interaction contracts', () => {
  it('validates one or many inline questions and exactly one authoritative correct option per question', () => {
    const block = interactiveTestBlockSchema.parse({
      id: 'test-1',
      type: 'interactive_test',
      version: 1,
      questions: [
        {
          id: 'q1', prompt: '2 + 2?', status: 'UNANSWERED', explanation: 'Two pairs make four.',
          options: [
            { id: 'q1-a', text: '3', isCorrect: false },
            { id: 'q1-b', text: '4', isCorrect: true },
          ],
        },
        {
          id: 'q2', prompt: 'Capital of France?', status: 'UNANSWERED',
          options: [
            { id: 'q2-a', text: 'Paris', isCorrect: true },
            { id: 'q2-b', text: 'Rome', isCorrect: false },
          ],
        },
      ],
    })
    expect(block.questions).toHaveLength(2)

    expect(() => interactiveTestBlockSchema.parse({
      id: 'test-invalid', type: 'interactive_test', version: 1,
      questions: [{
        id: 'q1', prompt: 'Invalid key',
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: true },
        ],
      }],
    })).toThrow()
  })

  it('accepts only a selected option from the client, never client-authored correctness or feedback', () => {
    expect(interactiveAnswerInputSchema.parse({ selectedOptionId: 'q1-b' })).toEqual({ selectedOptionId: 'q1-b' })
    expect(() => interactiveAnswerInputSchema.parse({ selectedOptionId: 'q1-b', correctness: true })).toThrow()
    expect(() => interactiveAnswerInputSchema.parse({ selectedOptionId: 'q1-b', feedback: { state: 'REVEALED' } })).toThrow()
  })

  it('keeps AI Goal/Todo/Note blocks PROPOSED until an explicit confirmation overlay exists', () => {
    const common = { version: 1, proposalState: 'PROPOSED', title: 'Candidate', fields: {} }
    expect(noteProposalBlockSchema.parse({ id: 'note-1', type: 'note_proposal', ...common }).proposalState).toBe('PROPOSED')
    expect(todoProposalBlockSchema.parse({ id: 'todo-1', type: 'todo_proposal', ...common }).proposalState).toBe('PROPOSED')
    expect(goalProposalBlockSchema.parse({ id: 'goal-1', type: 'goal_proposal', ...common }).proposalState).toBe('PROPOSED')
    expect(() => noteProposalBlockSchema.parse({ id: 'note-2', type: 'note_proposal', version: 1, proposalState: 'USER_CONFIRMED', title: 'Nope', fields: {} })).toThrow()
  })

  it('allows bounded user edits at confirmation but rejects attempts to force persistence state', () => {
    expect(proposalConfirmationInputSchema.parse({ editedFields: { title: 'Edited', priority: 2, pinned: true, due: null } })).toEqual({
      editedFields: { title: 'Edited', priority: 2, pinned: true, due: null },
    })
    expect(() => proposalConfirmationInputSchema.parse({ editedFields: {}, state: 'PERSISTED' })).toThrow()
    expect(() => proposalConfirmationInputSchema.parse({ editedFields: {}, persistedEntityId: '00000000-0000-4000-8000-000000000000' })).toThrow()
  })

  it('has no Part 3 global persistence adapter installed', () => {
    expect(PART3_PROPOSAL_PERSISTENCE_AVAILABLE).toBe(false)
  })
})
