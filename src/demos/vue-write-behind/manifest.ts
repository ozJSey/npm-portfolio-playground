import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'vue-write-behind',
  pkg: '@ozjsey/vue-write-behind',
  tagline:
    'Write-behind cache for Vue 3 — one composable over a reactive record. Local state stays authoritative, the server’s reply is discarded on purpose, and a failed save never rolls back or drops what the user typed.',
  status:
    '0.2.0 local, 0.1.1 on npm as @ozjsey/vue-write-behind — publish pending. 0.2.0 moves the engine into @ozjsey/write-behind (unpublished) and adds the flush on pagehide plus the final flag a writer hangs keepalive off.',
  notes: [
    'Not a directive — one composable. There is nothing for the app to register: the demos import useWriteBehind directly, which is exactly how an app uses it.',
    'Every "server" on this tab is a plain async function with an artificial delay — that is the library’s real integration point (`write: (value, key) => Promise`), not a stand-in for one. No HTTP is involved, so the cards behave identically on the deployed static site and on your machine.',
    'Card 1 is the product. The rest are details of it. Start there, and keep typing while it says "saving…".',
    'What this tab does NOT demonstrate: that a flush survives a real page teardown, `keepalive` delivery, or genuine offline. Card 11 shows exactly what the writer is told when the page is going away — `reason: unload`, `final: true` — and says plainly that setting `keepalive` on a real request, and it arriving, is the part no card here can prove.',
  ],
  demos: [
    {
      file: '01-no-jump.vue',
      title: 'The cell does not jump',
      blurb:
        'A grid of cells against a slow server that echoes every value UPPERCASED. Type while it is saving — the field keeps exactly what you typed, and the card checks that live.',
      tags: ['useWriteBehind', 'the response is discarded', 'pending', 'inFlight'],
    },
    {
      file: '02-coalescing.vue',
      title: 'Coalescing — keystrokes vs requests',
      blurb:
        'Two counters diverging live. Press "type for me" and watch forty edits become a handful of writes, each carrying the newest value.',
      tags: ['interval', 'last-write-wins', 'coalescing'],
    },
    {
      file: '03-failure-and-retry.vue',
      title: 'Failure never rolls back',
      blurb:
        'Type with the server down: attempts climb, the backoff doubles, the key stays dirty. Keep editing, bring the server up — the attempt that lands carries your newest text.',
      tags: ['retry', 'backoff', 'failed', 'WriteBehindFailure'],
    },
    {
      file: '04-retry-false.vue',
      title: 'retry: false parks a key, it never drops one',
      blurb:
        'One input, two outboxes over the same failing server. The opted-out key stops attempting but stays pending with retryAt: undefined until you edit it or call retry().',
      tags: ['retry: false', 'retry()', 'retryAt'],
    },
    {
      file: '05-live-state.vue',
      title: 'pending / inFlight / failed / isSyncing',
      blurb:
        'Three fields against a fast, a slow and a broken endpoint. The whole save-indicator recipe is three array lookups against the store — no local bookkeeping.',
      tags: ['WriteBehind', 'pending', 'inFlight', 'failed', 'isSyncing'],
    },
    {
      file: '06-batch.vue',
      title: 'Batch writer vs per-key allSettled',
      blurb:
        'The same three edits through both writer shapes side by side: three parallel requests, or one call carrying every due key with a partial { failed: [...] } outcome.',
      tags: ['flush', 'write', 'WriteBehindBatchOutcome', 'allSettled'],
    },
    {
      file: '07-discard.vue',
      title: 'discard() is the only way to lose a write',
      blurb:
        'Three near misses — a failing endpoint, a key deleted out of the record, a request already on the wire — and then the one call that actually drops it.',
      tags: ['discard', 'in flight', 'key removed from source'],
    },
    {
      file: '08-interval-and-debounce.vue',
      title: 'interval is a fixed window, debounce is a quiet period',
      blurb:
        'One input feeding two outboxes that differ only in debounce. Press "type without pausing": the left one keeps saving on its grid, the right one never gets quiet enough.',
      tags: ['interval', 'debounce'],
    },
    {
      file: '09-keys-filter.vue',
      title: 'keys — narrowing what the watcher follows',
      blurb:
        'A predicate excludes ui:* from syncing. set() ignores the filter, so an excluded key can still be sent on purpose without widening it.',
      tags: ['keys', 'set()'],
    },
    {
      file: '10-equals-and-set.vue',
      title: 'equals, and why in-place mutation is not an edit',
      blurb:
        'Replace an object with an equivalent one, with a different one, or mutate it in place — two outboxes, four outcomes, the case where set() is the only answer, and why the order you press them in matters for a custom comparator.',
      tags: ['equals', 'Object.is', 'set()'],
    },
    {
      file: '11-flush-and-tab-hide.vue',
      title: 'flush(), and the flush when the page goes away',
      blurb:
        'Both sides sit on a 30 s interval, so only flush() or a real tab switch moves them. Every request logs the attempt it was handed, so you can watch reason flip to unload and final to true — the flag keepalive hangs off. Reads out what the browser actually did, and states plainly what it cannot prove.',
      tags: [
        'flush()',
        "flush('unload')",
        'flushOnHidden',
        'visibilitychange',
        'pagehide',
        'WriteBehindAttempt',
        'keepalive',
      ],
    },
  ],
}

export default manifest
