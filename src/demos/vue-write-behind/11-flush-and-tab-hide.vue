<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * `flush()` — and the one place the library calls it for you.
 *
 * Both outboxes below run on a 30-second interval, so nothing leaves on the
 * clock while you are looking at the card. The left one keeps the default
 * `flushOnHidden: true`; the right one opts out. Everything else is identical.
 */
const watched = reactive<Record<string, string>>({ draft: '' })
const opted = reactive<Record<string, string>>({ draft: '' })

const watchedLog = ref<string[]>([])
const optedLog = ref<string[]>([])
const flushResolved = ref('')
const visibilityEvents = ref<string[]>([])
const visibilityState = ref(document.visibilityState)

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const push = (target: typeof watchedLog, line: string) => {
  target.value = [...target.value.slice(-7), `${stamp()}  ${line}`]
}

const watchedOutbox = useWriteBehind(watched, {
  interval: 30000,
  write: async (value, key) => {
    push(watchedLog, `PUT ${key}   ${JSON.stringify(value)}`)
    await sleep(300)
    push(watchedLog, `200  ${key}`)
  },
})

const optedOutbox = useWriteBehind(opted, {
  interval: 30000,
  flushOnHidden: false,
  write: async (value, key) => {
    push(optedLog, `PUT ${key}   ${JSON.stringify(value)}`)
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
 * The card's own listener, alongside the library's. It reports what the browser
 * actually did; it does not simulate anything.
 */
function onVisibility() {
  visibilityState.value = document.visibilityState
  visibilityEvents.value = [
    ...visibilityEvents.value.slice(-5),
    `${stamp()}  visibilitychange → ${document.visibilityState}`,
  ]
}
document.addEventListener('visibilitychange', onVisibility)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))

function reset() {
  watchedOutbox.discard('draft')
  optedOutbox.discard('draft')
  watched.draft = ''
  opted.draft = ''
  watchedLog.value = []
  optedLog.value = []
  visibilityEvents.value = []
  flushResolved.value = ''
}
</script>

<template>
  <p class="pg-muted">
    Type something. Neither side will send it on its own for thirty seconds — so there are exactly
    two ways to make it go: press <code>flush()</code>, or switch to another browser tab and come
    back.
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
    visibilityEvents.length ? visibilityEvents.join('\n') : 'no visibilitychange observed yet'
  }}</pre>

  <div class="caveat">
    <p>
      <strong>What this card shows, and what it does not.</strong> It shows that the library
      subscribes to <code>visibilitychange</code> by default and that <code>flushOnHidden: false</code>
      turns that off — when your browser fires the event, the left log gains a request and the right
      one does not.
    </p>
    <p>
      It does <em>not</em> show that the request survives the page actually going away. A hidden tab
      can be frozen or discarded before anything leaves the socket, this library ships no
      <code>keepalive</code> or <code>sendBeacon</code> transport (the writer is yours), and none of
      that is verified here or in the test suite. The flush on hide is
      <strong>best-effort, and unproven under a real page teardown</strong> — which is precisely why
      <code>pending</code> is exposed: an app that must not lose the write should warn on it rather
      than trust the hook.
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
