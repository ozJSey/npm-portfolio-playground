<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * The two clocks, which are not the same clock.
 *
 * `interval` is a **fixed window**: it does not restart when you type, so a
 * fast typist cannot push the save out indefinitely — something goes out every
 * second, carrying the newest value.
 *
 * `debounce` is a per-key quiet period on top of it: the key is not eligible
 * until you have stopped for that long. It is off by default because the
 * interval already coalesces a burst, and because a save that never happens
 * while someone keeps typing is the failure mode it introduces.
 */
const windowed = reactive<Record<string, string>>({ text: '' })
const quiet = reactive<Record<string, string>>({ text: '' })

const windowedSends = ref<string[]>([])
const quietSends = ref<string[]>([])

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const record = (target: typeof windowedSends, value: string) => {
  target.value = [...target.value.slice(-7), `${stamp()}  ${JSON.stringify(value)}`]
}

const windowedOutbox = useWriteBehind(windowed, (value) => {
  record(windowedSends, String(value))
})

const quietOutbox = useWriteBehind(quiet, {
  debounce: 800,
  write: (value) => {
    record(quietSends, String(value))
  },
})

function onType(event: Event) {
  const value = (event.target as HTMLInputElement).value
  windowed.text = value
  quiet.text = value
}

/** Types without pausing for eight seconds — long enough for the two to diverge. */
const PHRASE = 'typing without ever pausing long enough to be quiet '
let ticker: ReturnType<typeof setInterval> | undefined
const running = ref(false)

function typeForever() {
  if (running.value) return
  running.value = true
  let index = 0
  windowed.text = ''
  quiet.text = ''
  ticker = setInterval(() => {
    if (index >= PHRASE.length * 2) {
      stop()
      return
    }
    const next = PHRASE[index % PHRASE.length]
    windowed.text += next
    quiet.text += next
    index += 1
  }, 90)
}

function stop() {
  clearInterval(ticker)
  ticker = undefined
  running.value = false
}

function reset() {
  stop()
  windowed.text = ''
  quiet.text = ''
  windowedSends.value = []
  quietSends.value = []
}

onBeforeUnmount(stop)
</script>

<template>
  <p class="pg-muted">
    One input feeding two outboxes that differ only in <code>debounce</code>. Press
    <strong>type without pausing</strong>: the left one keeps saving on its fixed one-second grid,
    the right one saves nothing until the typing stops.
  </p>

  <p class="pg-row">
    <label class="pg-label" for="wb-clock-text">text</label>
    <input
      id="wb-clock-text"
      class="pg-input text"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="windowed.text"
      @input="onType"
    />
    <button class="pg-btn pg-btn--primary" :disabled="running" @click="typeForever">
      type without pausing
    </button>
    <button class="pg-btn" :disabled="!running" @click="stop">stop</button>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <div class="pair">
    <div class="pg-box">
      <p class="head">defaults — <code>interval: 1000</code>, <code>debounce: 0</code></p>
      <p class="pg-row">
        <span class="pg-chip">writes: {{ windowedSends.length }}</span>
        <span class="pg-chip">pending: {{ windowedOutbox.pending.join(', ') || 'none' }}</span>
      </p>
      <pre class="pg-log">{{ windowedSends.length ? windowedSends.join('\n') : 'nothing sent yet' }}</pre>
    </div>

    <div class="pg-box">
      <p class="head"><code>debounce: 800</code></p>
      <p class="pg-row">
        <span class="pg-chip">writes: {{ quietSends.length }}</span>
        <span class="pg-chip">pending: {{ quietOutbox.pending.join(', ') || 'none' }}</span>
      </p>
      <pre class="pg-log">{{ quietSends.length ? quietSends.join('\n') : 'nothing sent yet' }}</pre>
    </div>
  </div>

  <p class="pg-muted">
    A detail that only shows up under a failing endpoint: an edit can push a key's quiet period
    further out, but it can never shorten an active retry backoff, and a network outcome can never
    cancel your quiet period. They are two separate deadlines on the entry for exactly that reason.
  </p>
</template>

<style scoped>
.text {
  min-width: 20rem;
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
</style>
