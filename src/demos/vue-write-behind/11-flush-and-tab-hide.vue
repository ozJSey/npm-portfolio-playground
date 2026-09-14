<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'
import type { WriteBehindAttempt } from '@ozjsey/vue-write-behind'

/**
 * `flush()` — and the two places the library calls it for you.
 *
 * Both outboxes below run on a 30-second interval, so nothing leaves on the
 * clock while you are looking at the card. The left one keeps the default
 * `flushOnHidden: true`; the right one opts out. Everything else is identical.
 *
 * Every request logs the third argument its writer was handed — that is the
 * `WriteBehindAttempt`, and `final` is the flag a real app hangs `keepalive`
 * off.
 */
const watched = reactive<Record<string, string>>({ draft: '' })
const opted = reactive<Record<string, string>>({ draft: '' })

const watchedLog = ref<string[]>([])
const optedLog = ref<string[]>([])
const flushResolved = ref('')
const lifecycleEvents = ref<string[]>([])
const visibilityState = ref(document.visibilityState)

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const push = (target: typeof watchedLog, line: string) => {
  target.value = [...target.value.slice(-7), `${stamp()}  ${line}`]
}
const describe = (attempt: WriteBehindAttempt) =>
  `reason=${attempt.reason} final=${attempt.final} attempt=${attempt.attempt}`

const watchedOutbox = useWriteBehind(watched, {
  interval: 30000,
  write: async (value, key, attempt) => {
    push(watchedLog, `PUT ${key}   ${JSON.stringify(value)}   ${describe(attempt)}`)
    await sleep(300)
    push(watchedLog, `200  ${key}`)
  },
})

const optedOutbox = useWriteBehind(opted, {
  interval: 30000,
  flushOnHidden: false,
  write: async (value, key, attempt) => {
    push(optedLog, `PUT ${key}   ${JSON.stringify(value)}   ${describe(attempt)}`)
    await sleep(300)
    push(optedLog, `200  ${key}`)
  },
})

function onType(event: Event) {
  const value = (event.target as HTMLInputElement).value
  watched.draft = value
  opted.draft = value
}

/**
 * `flush()` resolves once the requests it started have settled. Keys edited
 * *during* that flight are still pending afterwards — it is "send what is due
 * now", not "wait until everything is quiet".
 */
async function flushLeft() {
  flushResolved.value = ''
  const started = stamp()
  await watchedOutbox.flush()
  flushResolved.value = `flush() called at ${started}, resolved at ${stamp()}`
}

/**
 * The same send, labelled the way the automatic one on the way out is. This is
 * the escape hatch for an unload signal the library refuses to listen to for
 * you — a router leave guard, or a `beforeunload` handler you insist on.
 */
function flushLeftFinal() {
  void watchedOutbox.flush('unload')
}

/**
 * The card's own listeners, alongside the library's. They report what the
 * browser actually did; they do not simulate anything.
 */
function record(line: string) {
  lifecycleEvents.value = [...lifecycleEvents.value.slice(-5), `${stamp()}  ${line}`]
}
function onVisibility() {
  visibilityState.value = document.visibilityState
  record(`visibilitychange → ${document.visibilityState}`)
}
function onPageHide() {
  record('pagehide')
}
function onPageShow() {
  record('pageshow — restored from the back/forward cache')
}
document.addEventListener('visibilitychange', onVisibility)
window.addEventListener('pagehide', onPageHide)
window.addEventListener('pageshow', onPageShow)
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('pageshow', onPageShow)
})

function reset() {
  watchedOutbox.discard('draft')
  optedOutbox.discard('draft')
  watched.draft = ''
  opted.draft = ''
  watchedLog.value = []
  optedLog.value = []
  lifecycleEvents.value = []
  flushResolved.value = ''
}
</script>

<template>
  <p class="pg-muted">
    Type something. Neither side will send it on its own for thirty seconds — so there are exactly
    three ways to make it go: press <code>flush()</code>, press <code>flush('unload')</code>, or
    switch to another browser tab and come back.
  </p>

  <p class="pg-row">
    <label class="pg-label" for="wb-flush-draft">draft</label>
    <input
      id="wb-flush-draft"
      class="pg-input draft"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="watched.draft"
      @input="onType"
    />
    <button class="pg-btn pg-btn--primary" @click="flushLeft">flush() the left one</button>
    <button class="pg-btn" @click="flushLeftFinal">flush('unload') the left one</button>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <p v-if="flushResolved" class="pg-kv">{{ flushResolved }}</p>

  <div class="pair">
    <div class="pg-box">
      <p class="head">default — <code>flushOnHidden: true</code></p>
      <p class="pg-row">
        <span class="pg-chip">pending: {{ watchedOutbox.pending.join(', ') || 'none' }}</span>
        <span class="pg-chip">isSyncing: {{ watchedOutbox.isSyncing }}</span>
      </p>
      <pre class="pg-log">{{ watchedLog.length ? watchedLog.join('\n') : 'nothing sent yet' }}</pre>
    </div>

    <div class="pg-box">
      <p class="head"><code>flushOnHidden: false</code></p>
      <p class="pg-row">
        <span class="pg-chip">pending: {{ optedOutbox.pending.join(', ') || 'none' }}</span>
        <span class="pg-chip">isSyncing: {{ optedOutbox.isSyncing }}</span>
      </p>
      <pre class="pg-log">{{ optedLog.length ? optedLog.join('\n') : 'nothing sent yet' }}</pre>
    </div>
  </div>

  <p class="pg-kv">document.visibilityState: {{ visibilityState }}</p>
  <pre class="pg-log">{{
    lifecycleEvents.length ? lifecycleEvents.join('\n') : 'no lifecycle event observed yet'
  }}</pre>

  <div class="recipe">
    <p>
      <strong>Why <code>final</code> is in the log.</strong> The library owns no transport — the
      writer is your function — so it cannot set <code>keepalive</code> for you. What it can do is
      say when the request has to outlive the page, which is the whole recipe:
    </p>
    <pre class="pg-log">useWriteBehind(cells, (value, key, { final }) =>
  fetch(`/cell/${key}`, {
    method: 'PUT',
    body: JSON.stringify(value),
    keepalive: final,
  }),
)</pre>
    <p>
      Press <code>flush('unload')</code> above to see exactly what that writer receives. The
      automatic flush on <code>visibilitychange → hidden</code> and on <code>pagehide</code> passes
      the same thing — switch tabs and come back to watch the left log gain a request the right one
      does not.
    </p>
  </div>

  <div class="caveat">
    <p>
      <strong>What this card shows, and what it does not.</strong> It shows that the library
      subscribes to <code>visibilitychange</code> and <code>pagehide</code> by default, that
      <code>flushOnHidden: false</code> turns that off, and exactly what the writer is told about
      each send.
    </p>
    <p>
      It does <em>not</em> show that the request survives the page actually going away. Nothing here
      sets <code>keepalive</code> on a real request, no request leaves this page at all (the
      "server" is a local <code>setTimeout</code>), and a hidden tab can still be frozen before
      anything reaches the socket. The flush on the way out is
      <strong>best-effort, and unproven under a real page teardown</strong> — which is precisely why
      <code>pending</code> is exposed: an app that must not lose the write should warn on it rather
      than trust the hook. Note too that <code>keepalive</code> is capped at 64 KiB across every
      in-flight keepalive request in the page, which is why a batch writer is the better unload path.
    </p>
    <p>Real offline behaviour is not demonstrated here either. Offline is a failing write, so card 3 is the honest picture of it.</p>
  </div>
</template>

<style scoped>
.draft {
  min-width: 18rem;
  flex: 1;
}
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.head {
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
}
.recipe {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  font-size: 0.82rem;
  margin-top: 0.75rem;
}
.recipe p {
  margin: 0 0 0.45rem;
}
.recipe p:last-child {
  margin-bottom: 0;
}
.caveat {
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #78350f;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  font-size: 0.82rem;
  margin-top: 0.75rem;
}
.caveat p {
  margin: 0 0 0.45rem;
}
.caveat p:last-child {
  margin-bottom: 0;
}
</style>
