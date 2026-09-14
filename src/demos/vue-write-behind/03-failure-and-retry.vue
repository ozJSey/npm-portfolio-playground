<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * A failed save rolls nothing back — not local state, not the queue.
 *
 * The key stays dirty, the backoff grows 1 → 2 → 4 → 8 → 16 → 30 s (capped),
 * and every attempt reads the value out of the outbox at send time. So the
 * attempt that finally lands carries what is on screen *now*, not the value
 * that failed three minutes ago.
 */
const draft = reactive<Record<string, string>>({ note: '' })

const serverUp = ref(false)
const log = ref<string[]>([])
const firstFailedValue = ref('')
const acceptedValue = ref('')

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const say = (line: string) => {
  log.value = [...log.value.slice(-11), `${stamp()}  ${line}`]
}

const outbox = useWriteBehind(draft, async (value, key) => {
  say(`PUT ${key}   ${JSON.stringify(value)}`)
  await sleep(250)
  if (!serverUp.value) {
    if (!firstFailedValue.value) firstFailedValue.value = String(value)
    say('503  Service Unavailable — kept, will go out again')
    throw new Error('503 Service Unavailable')
  }
  acceptedValue.value = String(value)
  say(`200  ${key} accepted`)
})

function onType(event: Event) {
  draft.note = (event.target as HTMLInputElement).value
}

// A clock, only so the countdown below moves. The library needs none of this.
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 100)
onBeforeUnmount(() => clearInterval(clock))

const failure = computed(() => outbox.failed[0])
const countdown = computed(() => {
  const at = failure.value?.retryAt
  if (at === undefined) return 'no automatic attempt scheduled'
  return `next attempt in ${Math.max(0, Math.round((at - now.value) / 100) / 10).toFixed(1)}s`
})

function reset() {
  outbox.discard('note')
  draft.note = ''
  log.value = []
  firstFailedValue.value = ''
  acceptedValue.value = ''
  serverUp.value = false
}
</script>

<template>
  <p class="pg-muted">
    The server starts <strong>down</strong>. Type a note and leave it — attempts climb, the backoff
    doubles, and nothing is lost. Then <em>keep editing</em> and bring the server back up: the
    request that succeeds carries your newest text, not the text that failed.
  </p>

  <p class="pg-row">
    <label class="pg-label" for="wb-retry-note">note</label>
    <input
      id="wb-retry-note"
      class="pg-input note"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="draft.note"
      @input="onType"
    />
    <button class="pg-btn" :class="serverUp ? '' : 'pg-btn--primary'" @click="serverUp = !serverUp">
      server: {{ serverUp ? 'up' : 'down' }}
    </button>
    <button class="pg-btn" @click="outbox.retry()">retry()</button>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <p class="pg-row">
    <span class="pg-chip">pending: {{ outbox.pending.join(', ') || 'none' }}</span>
    <span class="pg-chip" :class="outbox.failed.length ? 'is-bad' : ''">
      failed: {{ outbox.failed.length }}
    </span>
    <span class="pg-chip">attempts: {{ failure ? failure.attempts : 0 }}</span>
    <span class="pg-chip">{{ countdown }}</span>
  </p>

  <p class="pg-kv">error: {{ failure ? String(failure.error) : '—' }}</p>
  <p class="pg-kv">value that first failed: {{ firstFailedValue || '—' }}</p>
  <p class="pg-kv">value the accepted attempt carried: {{ acceptedValue || '—' }}</p>

  <pre class="pg-log">{{ log.length ? log.join('\n') : 'no attempts yet — type a note' }}</pre>

  <p class="pg-muted">
    Two properties fall out of reading the value at send time rather than capturing it at edit time.
    A retry is never stale — the two lines above diverge as soon as you type during an outage. And
    the input is never rolled back to a server-approved value, because there is no rollback path in
    the library at all: <code>discard(key)</code> is the only operation that loses a write.
  </p>
</template>

<style scoped>
.note {
  min-width: 20rem;
  flex: 1;
}
.pg-chip.is-bad {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fecaca;
}
</style>
