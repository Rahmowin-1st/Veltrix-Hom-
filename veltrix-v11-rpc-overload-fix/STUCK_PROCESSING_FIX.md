# Stuck processing fix

Fixes sources frozen at 20% (`extracting`) after upload.

- worker checkpoints now synchronize source progress;
- orphaned processing sources with no active job are requeued automatically;
- explicit **Qayta ishlash** cancels stale leases and starts a fresh durable job;
- enqueue failures mark the source failed instead of leaving an endless spinner.

No new SQL migration is required. Existing migration-010/011 remain unchanged.
