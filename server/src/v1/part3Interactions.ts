import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { admin } from '../services/supabase.js'
import { canonicalAuth } from './auth.js'
import { ApiError } from './errors.js'

const router = Router()
router.use(canonicalAuth)
type CanonicalRequest = Request & { accountId?: string }

function accountId(req: Request) { return (req as CanonicalRequest).accountId! }

const interactionIdSchema = z.string().min(1).max(96).regex(/^[A-Za-z0-9._:-]+$/)
const jsonScalarSchema = z.union([z.string().max(8_000), z.number().finite(), z.boolean(), z.null()])
const editedFieldsSchema = z.record(jsonScalarSchema).superRefine((value, ctx) => {
  if (Object.keys(value).length > 40) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Proposal edits support at most 40 fields.' })
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 65_536) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Proposal edits exceed the confirmation payload limit.' })
})

export const interactiveAnswerInputSchema = z.object({
  selectedOptionId: interactionIdSchema,
}).strict()

export const proposalConfirmationInputSchema = z.object({
  editedFields: editedFieldsSchema.default({}),
}).strict()

export type ProposalPersistenceKind = 'note' | 'todo' | 'goal'
export type ConfirmedProposalBoundary = {
  confirmationId: string
  accountId: string
  sourceMessageId: string
  blockId: string
  proposalType: ProposalPersistenceKind
  editedFields: Record<string, string | number | boolean | null>
}

// Part 4 must supply this adapter before any USER_CONFIRMED proposal may become PERSISTED.
// Part 3 intentionally exposes no implementation and creates no Goal/Todo/Note global row.
export interface Part4GoalTodoNotePersistencePort {
  persist(input: ConfirmedProposalBoundary): Promise<{ entityId: string }>
}
export const PART3_PROPOSAL_PERSISTENCE_AVAILABLE = false as const

function domainError(error: unknown): never {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : String(error)
  if (message.includes('assistant_message_not_found')) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Conversation message was not found.')
  if (message.includes('interactive_test_block_not_found')) throw new ApiError(404, 'INTERACTIVE_TEST_NOT_FOUND', 'Interactive test block was not found.')
  if (message.includes('interactive_test_question_not_found')) throw new ApiError(404, 'INTERACTIVE_TEST_QUESTION_NOT_FOUND', 'Interactive test question was not found.')
  if (message.includes('interactive_test_option_not_found')) throw new ApiError(400, 'INTERACTIVE_TEST_OPTION_INVALID', 'Selected option is not part of this question.')
  if (message.includes('interactive_test_answer_key_invalid') || message.includes('interactive_test_block_invalid')) throw new ApiError(409, 'INTERACTIVE_TEST_INVALID', 'The stored interactive test is not valid for authoritative scoring.')
  if (message.includes('interactive_answer_already_submitted')) throw new ApiError(409, 'INTERACTIVE_ANSWER_ALREADY_SUBMITTED', 'This question already has a different submitted answer.')
  if (message.includes('proposal_block_not_found')) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Proposal block was not found.')
  if (message.includes('proposal_block_invalid')) throw new ApiError(409, 'PROPOSAL_INVALID', 'The stored block is not a confirmable Part 3 proposal.')
  if (message.includes('proposal_already_confirmed')) throw new ApiError(409, 'PROPOSAL_ALREADY_CONFIRMED', 'This proposal was already confirmed with different edits.')
  if (message.includes('proposal_edits_invalid') || message.includes('proposal_edits_too_large') || message.includes('proposal_identity_invalid') || message.includes('interactive_answer_identity_invalid')) {
    throw new ApiError(400, 'INTERACTION_INVALID', 'The interaction payload is invalid.')
  }
  throw error
}

async function requireOwnedCompletedAssistantMessage(id: string, conversationId: string, messageId: string) {
  const { data, error } = await admin.from('vh_conversation_messages')
    .select('id,status')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .eq('account_id', id)
    .eq('role', 'ASSISTANT')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Conversation message was not found.')
  if (data.status !== 'COMPLETED') throw new ApiError(409, 'MESSAGE_NOT_COMPLETED', 'Interactive actions require a completed assistant message.')
}

const interactiveAnswerResultSchema = z.object({
  answerId: z.string().uuid(),
  messageId: z.string().uuid(),
  blockId: interactionIdSchema,
  questionId: interactionIdSchema,
  selectedOptionId: interactionIdSchema,
  correctness: z.boolean(),
  feedback: z.record(z.unknown()),
  submittedAt: z.string().optional(),
}).passthrough()

const proposalConfirmationResultSchema = z.object({
  confirmationId: z.string().uuid(),
  messageId: z.string().uuid(),
  blockId: interactionIdSchema,
  proposalType: z.enum(['note','todo','goal']),
  state: z.enum(['USER_CONFIRMED','PERSISTED']),
  editedFields: editedFieldsSchema,
  confirmedAt: z.string().optional(),
}).passthrough()

router.post('/conversations/:conversationId/messages/:messageId/tests/:blockId/questions/:questionId/answers', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = z.string().uuid().parse(req.params.conversationId)
    const messageId = z.string().uuid().parse(req.params.messageId)
    const blockId = interactionIdSchema.parse(req.params.blockId)
    const questionId = interactionIdSchema.parse(req.params.questionId)
    const input = interactiveAnswerInputSchema.parse(req.body)
    await requireOwnedCompletedAssistantMessage(id, conversationId, messageId)

    const { data, error } = await admin.rpc('vh_submit_interactive_test_answer', {
      p_account_id: id,
      p_message_id: messageId,
      p_block_id: blockId,
      p_question_id: questionId,
      p_selected_option_id: input.selectedOptionId,
    })
    if (error) domainError(error)
    res.status(200).json({ answer: interactiveAnswerResultSchema.parse(data) })
  } catch (error) { next(error) }
})

router.post('/conversations/:conversationId/messages/:messageId/proposals/:blockId/confirm', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = z.string().uuid().parse(req.params.conversationId)
    const messageId = z.string().uuid().parse(req.params.messageId)
    const blockId = interactionIdSchema.parse(req.params.blockId)
    const input = proposalConfirmationInputSchema.parse(req.body)
    await requireOwnedCompletedAssistantMessage(id, conversationId, messageId)

    const { data, error } = await admin.rpc('vh_confirm_conversation_proposal', {
      p_account_id: id,
      p_message_id: messageId,
      p_block_id: blockId,
      p_edited_fields: input.editedFields,
    })
    if (error) domainError(error)
    const confirmation = proposalConfirmationResultSchema.parse(data)
    if (confirmation.state !== 'USER_CONFIRMED') throw new ApiError(409, 'PROPOSAL_PERSISTENCE_DEFERRED', 'Goal/Todo/Note persistence is not available until the Part 4 domain adapter is installed.')
    res.status(200).json({ confirmation, persistenceAvailable: PART3_PROPOSAL_PERSISTENCE_AVAILABLE })
  } catch (error) { next(error) }
})

router.get('/conversations/:conversationId/messages/:messageId/interactions', async (req, res, next) => {
  try {
    const id = accountId(req)
    const conversationId = z.string().uuid().parse(req.params.conversationId)
    const messageId = z.string().uuid().parse(req.params.messageId)
    await requireOwnedCompletedAssistantMessage(id, conversationId, messageId)

    const [answersResult, confirmationsResult] = await Promise.all([
      admin.from('vh_interactive_test_answers')
        .select('id,message_id,block_id,question_id,selected_option_id,correctness,feedback,submitted_at')
        .eq('account_id', id).eq('message_id', messageId).order('submitted_at', { ascending: true }),
      admin.from('vh_conversation_proposal_confirmations')
        .select('id,message_id,block_id,proposal_type,state,edited_fields,confirmed_at,persisted_entity_id,persisted_at')
        .eq('account_id', id).eq('message_id', messageId).order('confirmed_at', { ascending: true }),
    ])
    if (answersResult.error) throw answersResult.error
    if (confirmationsResult.error) throw confirmationsResult.error

    res.json({
      messageId,
      interactiveAnswers: answersResult.data ?? [],
      proposalConfirmations: confirmationsResult.data ?? [],
      proposalPersistenceAvailable: PART3_PROPOSAL_PERSISTENCE_AVAILABLE,
    })
  } catch (error) { next(error) }
})

export { router as v1Part3InteractionsRouter }
