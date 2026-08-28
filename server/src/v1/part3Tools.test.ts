import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
import {
  TOOL_REGISTRY,
  assertHelpModeNoFinalAnswer,
  calculatorInputSchema,
  evaluateCalculator,
  helpSolveOutputSchema,
  solveInputSchema,
  solveItOutputSchema,
  summarizeInputSchema,
  summarizeOutputSchema,
  toolIdempotencyKeySchema,
  translateInputSchema,
  translateOutputSchema,
} from './part3Tools.js'

const runId = '80000000-0000-4000-8000-000000000001'
const assetId = '80000000-0000-4000-8000-000000000002'
const inputHash = 'a'.repeat(64)

describe('Part 3 Stage 80 Explore tool contracts', () => {
  it('publishes the frozen server-side registry order', () => {
    expect(TOOL_REGISTRY.map(tool => tool.id)).toEqual(['calculator','translate','solve','summarize'])
    expect(TOOL_REGISTRY.map(tool => tool.order)).toEqual([1,2,3,4])
    expect(TOOL_REGISTRY[0]?.aiRoute).toBeNull()
  })

  it('evaluates only deterministic basic calculator grammar', () => {
    expect(evaluateCalculator('2 + 3 * 4').result).toBe(14)
    expect(evaluateCalculator('(2 + 3) * 4').result).toBe(20)
    expect(evaluateCalculator('50% * 200').result).toBe(100)
    expect(evaluateCalculator('10 ÷ 4').display).toBe('2.5')
    expect(evaluateCalculator('-2.5 + .5').result).toBe(-2)
  })

  it('rejects executable or out-of-scope calculator syntax', () => {
    expect(() => evaluateCalculator('process.exit()')).toThrow(ApiError)
    expect(() => evaluateCalculator('2 ** 8')).toThrow(ApiError)
    expect(() => evaluateCalculator('1 / 0')).toThrow(ApiError)
    expect(() => calculatorInputSchema.parse({ expression: '2+2', graph: true })).toThrow()
  })

  it('keeps ToolRun idempotency identity bounded', () => {
    expect(toolIdempotencyKeySchema.parse(' tool-1 ')).toBe('tool-1')
    expect(() => toolIdempotencyKeySchema.parse('')).toThrow()
    expect(() => toolIdempotencyKeySchema.parse('x'.repeat(129))).toThrow()
  })

  it('validates simple Translate input and output without app-localization semantics', () => {
    expect(translateInputSchema.parse({ sourceLanguage: 'auto',targetLanguage: 'Uzbek',text: 'Hello' })).toEqual({ sourceLanguage: 'auto',targetLanguage: 'Uzbek',text: 'Hello' })
    const output = translateOutputSchema.parse({ kind: 'translate',sourceLanguage: 'auto',targetLanguage: 'Uzbek',result: 'Salom' })
    expect(output.result).toBe('Salom')
    expect(() => translateOutputSchema.parse({ ...output, explanation: 'extra' })).toThrow()
  })

  it('requires Solve text or Library inputs and accepts both frozen modes', () => {
    expect(() => solveInputSchema.parse({ mode: 'SOLVE_IT',text: '',assetIds: [] })).toThrow()
    expect(solveInputSchema.parse({ mode: 'SOLVE_IT',text: '2+2?',assetIds: [] }).mode).toBe('SOLVE_IT')
    expect(solveInputSchema.parse({ mode: 'HELP_ME_SOLVE',assetIds: [assetId] }).mode).toBe('HELP_ME_SOLVE')
  })

  it('validates SOLVE_IT structured output with original input reference', () => {
    const output = solveItOutputSchema.parse({
      kind: 'solve',mode: 'SOLVE_IT',problemType: 'math',finalAnswer: '4',steps: ['Add the two values.'],
      explanation: 'Basic addition.',formulasChecks: ['2 + 2 = 4'],suggestedActions: ['EXPLAIN_SIMPLER','ANOTHER_METHOD','SIMILAR_PROBLEM'],
      inputReference: { toolRunId: runId,assetIds: [assetId],inputTextHash: inputHash },
    })
    expect(output.inputReference.assetIds).toEqual([assetId])
  })

  it('makes HELP_ME_SOLVE schema incapable of carrying a finalAnswer field', () => {
    const base = {
      kind: 'solve' as const,mode: 'HELP_ME_SOLVE' as const,problemType: 'math' as const,
      simplifiedTask: 'Find the unknown using the given relationship.',whatIsAsked: 'Determine the unknown.',
      givens: ['A relationship and known values are provided.'],difficultPoint: 'Choose the correct operation.',
      principle: 'Undo operations in reverse order.',startGuidance: 'Write the relationship and isolate the unknown one step at a time.',
      nextStepGuidance: 'Perform the inverse operation, then check your work before finishing.',hints: ['Keep both sides balanced.'],
      inputReference: { toolRunId: runId,assetIds: [],inputTextHash: inputHash },
    }
    expect(helpSolveOutputSchema.parse(base).mode).toBe('HELP_ME_SOLVE')
    expect(() => helpSolveOutputSchema.parse({ ...base,finalAnswer: '4' })).toThrow()
  })

  it('fails closed when Help Me Solve guidance leaks an explicit final answer', () => {
    const safe = helpSolveOutputSchema.parse({
      kind: 'solve',mode: 'HELP_ME_SOLVE',problemType: 'math',simplifiedTask: 'Isolate the unknown.',whatIsAsked: 'Find x.',givens: ['2x = 8'],
      difficultPoint: 'Undo multiplication.',principle: 'Use the inverse operation.',startGuidance: 'Divide both sides by the coefficient.',
      nextStepGuidance: 'Do that operation yourself, then substitute your result to check.',hints: ['Keep both sides equal.'],
      inputReference: { toolRunId: runId,assetIds: [],inputTextHash: inputHash },
    })
    expect(assertHelpModeNoFinalAnswer(safe)).toEqual(safe)
    const leaking = { ...safe,nextStepGuidance: 'The answer is 4.' }
    expect(() => assertHelpModeNoFinalAnswer(leaking)).toThrow(ApiError)
    for (const directAnswer of ['x equals 4.', 'The unknown is 4.', '4 is the solution.']) {
      expect(() => assertHelpModeNoFinalAnswer({ ...safe, nextStepGuidance: directAnswer })).toThrow(ApiError)
    }
    for (const tutoring of ['Ask whether x equals the value you calculated.', 'The unknown is what you should isolate.', 'Check your candidate value by substitution.']) {
      expect(assertHelpModeNoFinalAnswer({ ...safe, nextStepGuidance: tutoring })).toBeTruthy()
    }
  })

  it('keeps quick Summarize standalone with bounded source provenance', () => {
    expect(summarizeInputSchema.parse({ text: 'A short passage.',assetIds: [],includeKeyPoints: false }).includeKeyPoints).toBe(false)
    const output = summarizeOutputSchema.parse({
      kind: 'summarize',summary: 'Short summary.',keyPoints: ['Point'],
      sourceReferences: [{ assetId,title: 'Lesson',locator: { page: 2 },contentHash: 'b'.repeat(64) }],
    })
    expect(output.sourceReferences[0]?.assetId).toBe(assetId)
    expect('studioArtifactId' in output).toBe(false)
  })
})
