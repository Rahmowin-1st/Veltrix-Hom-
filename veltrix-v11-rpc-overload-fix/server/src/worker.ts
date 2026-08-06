/**
 * Optional standalone worker.
 *
 * Both the web service and this worker claim through the same fenced RPC.
 */
import { runOneJob, workerHealth } from './services/jobWorker.js'
import { checkSupabaseAdminConnection } from './services/supabase.js'

const IDLE_DELAY_MS = 5000
let stopping = false

async function main(): Promise<void> {
  console.log('[worker] started')

  const dependency = await checkSupabaseAdminConnection()
  if (dependency.ok) {
    console.log(
      `[worker] Supabase ready project=${dependency.project_ref} key=${dependency.key_kind} fp=${dependency.key_fingerprint}`
    )
  } else {
    console.error(
      `[worker] Supabase configuration failed: ${dependency.error}. ${dependency.action}`
    )
  }

  while (!stopping) {
    let didWork = false
    try {
      didWork = await runOneJob()
    } catch (error) {
      console.error(
        '[worker] unexpected error',
        error instanceof Error ? error.message : error
      )
    }
    if (!didWork) await new Promise((resolve) => setTimeout(resolve, IDLE_DELAY_MS))
  }
  console.log('[worker] stopped')
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} received, finishing current slice`)
    stopping = true
  })
}

setInterval(() => {
  void workerHealth()
    .then((health) => console.log('[worker] health', JSON.stringify(health)))
    .catch(() => undefined)
}, 60_000).unref()

void main()
