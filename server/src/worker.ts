/**
 * Optional standalone worker.
 *
 * Not required: the web service already drains the queue opportunistically
 * while it is awake, which is what makes this work on a free tier. Running
 * this as a separate Render service simply gives processing its own CPU and
 * keeps it going while the web service sleeps.
 *
 * Both paths claim through the same `claim_processing_job` RPC, whose
 * FOR UPDATE SKIP LOCKED guarantees a job is never handed out twice.
 *
 *   npm run worker
 */
import { runOneJob, workerHealth } from './services/jobWorker.js'

const IDLE_DELAY_MS = 5000
let stopping = false

async function main(): Promise<void> {
  console.log('[worker] started')
  while (!stopping) {
    let didWork = false
    try {
      didWork = await runOneJob()
    } catch (e) {
      console.error('[worker] unexpected error', e instanceof Error ? e.message : e)
    }
    // Poll immediately while there is work, back off when the queue is empty.
    if (!didWork) await new Promise((r) => setTimeout(r, IDLE_DELAY_MS))
  }
  console.log('[worker] stopped')
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    // Finish the slice in flight; its lease and checkpoint make an abrupt
    // exit safe anyway, but a clean stop avoids waiting out the lease.
    console.log(`[worker] ${signal} received, finishing current slice`)
    stopping = true
  })
}

// Periodic queue visibility in the logs — the only way to notice a backlog or
// a pile of stale leases on a platform without a metrics add-on.
setInterval(() => {
  void workerHealth()
    .then((h) => console.log('[worker] health', JSON.stringify(h)))
    .catch(() => undefined)
}, 60_000).unref()

void main()
