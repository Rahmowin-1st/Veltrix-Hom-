/**
 * Deterministic fake AI adapter.
 *
 * Concurrency tests must prove that a duplicate submission causes exactly ONE
 * provider call. A real Gemini call is non-deterministic, costs money, and
 * cannot be counted reliably — so tests drive this instead. `invocations` is
 * the assertion surface: if a "duplicate request" test ever sees 2, the
 * idempotency guarantee is broken.
 */

export interface FakeCall { model: string; prompt: string }

export class FakeGemini {
  readonly calls: FakeCall[] = []
  /** Artificial latency, so two callers really do overlap in time. */
  latencyMs = 20
  /** Set to make the next call throw, for failure-path tests. */
  failNext: Error | null = null

  get invocations(): number { return this.calls.length }

  reset(): void { this.calls.length = 0; this.failNext = null }

  async generate(opts: { model: string; prompt: string }): Promise<string> {
    if (this.failNext) { const e = this.failNext; this.failNext = null; throw e }
    this.calls.push({ model: opts.model, prompt: opts.prompt })
    await new Promise((r) => setTimeout(r, this.latencyMs))
    return JSON.stringify({
      subject: 'matematika',
      topic: 'test',
      blocks: [{ type: 'note', text: `answer-${this.calls.length}` }],
      citations: [],
      evidenceIds: [],
      confidence: 0.9,
      followups: [],
    })
  }
}
