<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * Coalescing, counted. One keystroke counter, one request counter, and the
 * gap between them opening up live.
 *
 * The cadence is a fixed 1000 ms window (the default) — not a debounce — so a
 * fast typist cannot push the save out indefinitely: it fires every second
 * carrying whatever the value is at that moment, and every edit in between is
 * collapsed into it.
 */
const doc = reactive<Record<string, string>>({ title: '' })

const keystrokes = ref(0)
const requests = ref(0)
const sent = ref<string[]>([])

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const outbox = useWriteBehind(doc, async (value, key) => {
  requests.value += 1
  sent.value = [...sent.value, `${stamp()}  ${key} = ${JSON.stringify(value)}`]
  await sleep(250)
})

function onType(event: Event) {
  keystrokes.value += 1
  doc.title = (event.target as HTMLInputElement).value
}

/** Types for you, one character every 90 ms, so the counters diverge hands-free. */
const PHRASE = 'the quick brown fox jumps over the lazy dog'
let ticker: ReturnType<typeof setInterval> | undefined
const autoTyping = ref(false)

function autoType() {
  if (autoTyping.value) return
  autoTyping.value = true
  let index = 0
  doc.title = ''
  ticker = setInterval(() => {
    if (index >= PHRASE.length) {
      stopAutoType()
      return
    }
    keystrokes.value += 1
    doc.title += PHRASE[index]
    index += 1
  }, 90)
}

function stopAutoType() {
  clearInterval(ticker)
  ticker = undefined
  autoTyping.value = false
}

function reset() {
  stopAutoType()
  doc.title = ''
  keystrokes.value = 0
  requests.value = 0
  sent.value = []
}

// Demos remount on every edit; an uncancelled interval would leak per keystroke.
onBeforeUnmount(stopAutoType)
</script>

<template>
  <p class="pg-muted">
    Type fast, or press <strong>type for me</strong>. Every keystroke is an edit; only a fraction of
    them become requests, and each request carries the value at the moment it left — never a stale
    captured one.
  </p>

  <p class="pg-row">
    <label class="pg-label" for="wb-coalesce-title">title</label>
    <input
      id="wb-coalesce-title"
      class="pg-input title"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="doc.title"
      @input="onType"
    />
    <button class="pg-btn pg-btn--primary" :disabled="autoTyping" @click="autoType">
      type for me
    </button>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <div class="counters">
    <div class="counter">
      <span class="counter__n">{{ keystrokes }}</span>
      <span class="counter__l">keystrokes</span>
    </div>
    <div class="counter">
      <span class="counter__n">{{ requests }}</span>
      <span class="counter__l">requests</span>
    </div>
    <div class="counter">
      <span class="counter__n">{{ Math.max(keystrokes - requests, 0) }}</span>
      <span class="counter__l">edits the server never saw</span>
    </div>
  </div>

  <p class="pg-row">
    <span class="pg-chip">pending: {{ outbox.pending.join(', ') || 'none' }}</span>
    <span class="pg-chip">isSyncing: {{ outbox.isSyncing }}</span>
  </p>

  <pre class="pg-log">{{ sent.length ? sent.join('\n') : 'nothing sent yet' }}</pre>

  <p class="pg-muted">
    The queue is bounded by the number of <em>keys</em>, not the number of edits: last-write-wins
    replaces the queued value rather than appending to a log. Forty keystrokes in one cell is one
    pending entry, whatever happens to the network.
  </p>
</template>

<style scoped>
.title {
  min-width: 22rem;
  flex: 1;
}
.counters {
  display: flex;
  gap: 0.75rem;
  margin: 0.75rem 0;
  flex-wrap: wrap;
}
.counter {
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  background: #fbfcfe;
  min-width: 8rem;
}
.counter__n {
  display: block;
  font-family: var(--mono);
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
  color: #3730a3;
}
.counter__l {
  font-size: 0.72rem;
  color: #5b6478;
}
</style>
