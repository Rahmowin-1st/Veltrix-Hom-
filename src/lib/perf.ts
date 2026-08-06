const enabled = import.meta.env.DEV

export function measureInteraction(name: string, startedAt: number): void {
  if (!enabled || typeof performance === 'undefined') return
  const duration = performance.now() - startedAt
  if (duration > 80) console.debug(`[perf] ${name}: ${duration.toFixed(1)}ms`)
}

export function installLongTaskObserver(): () => void {
  if (!enabled || typeof PerformanceObserver === 'undefined') return () => undefined
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 120) console.debug(`[perf] long task: ${entry.duration.toFixed(1)}ms`)
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
    return () => observer.disconnect()
  } catch {
    return () => undefined
  }
}
