<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * The two writer shapes, driven by the same three fields.
 *
 * `write` is per key: one request per due key, in parallel, each settling on
 * its own — safe only because key independence is a stated precondition.
 * `flush` is batched: one call per tick carrying every due key, and it can fail
 * part of the batch by resolving `{ failed: [...] }`.
 *
 * `C3` is rejected by both servers, so the difference in blast radius is
 * visible: under `write` a rejection touches one key; under `flush` a *throw*
 * would keep the whole batch pending, which is why the batch server reports the
 * failure instead of throwing.
 */
const KEYS = ['C1', 'C2', 'C3']

const perKey = reactive<Record<string, string>>({ C1: '', C2: '', C3: '' })
const batched = reactive<Record<string, string>>({ C1: '', C2: '', C3: '' })

const perKeyCalls = ref(0)
const batchCalls = ref(0)
const perKeyLog = ref<string[]>([])
const batchLog = ref<string[]>([])

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const push = (target: typeof perKeyLog, line: string) => {
  target.value = [...target.value.slice(-9), `${stamp()}  ${line}`]
}

const perKeyOutbox = useWriteBehind(perKey, async (value, key) => {
  perKeyCalls.value += 1
  push(perKeyLog, `PUT /cell/${key}   ${JSON.stringify(value)}`)
  await sleep(400)
  if (key === 'C3') {
    push(perKeyLog, '422  C3 rejected — C1 and C2 are unaffected')
    throw new Error('422 Unprocessable Entity')
  }
  push(perKeyLog, `200  ${key}`)
})

const batchOutbox = useWriteBehind(batched, {
  flush: async (entries) => {
    batchCalls.value += 1
    push(batchLog, `PATCH /cells   ${JSON.stringify(Object.fromEntries(entries))}`)
    await sleep(400)
    const failed = entries.map(([key]) => key).filter((key) => key === 'C3')
    push(batchLog, failed.length ? `207  failed: ${failed.join(', ')}` : '200  all accepted')
    return { failed }
  },
})

/** One field per key, writing into both records so only the writer shape differs. */
function onType(key: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  perKey[key] = value
  batched[key] = value
}

function fillAll() {
  for (const key of KEYS) {
    const value = `${key.toLowerCase()}-${Math.floor(Math.random() * 900 + 100)}`
    perKey[key] = value
    batched[key] = value
  }
}

function reset() {
  for (const key of KEYS) {
    perKeyOutbox.discard(key)
    batchOutbox.discard(key)
    perKey[key] = ''
    batched[key] = ''
  }
  perKeyCalls.value = 0
  batchCalls.value = 0
  perKeyLog.value = []
  batchLog.value = []
}
</script>

<template>
  <p class="pg-muted">
    Edit all three fields inside one second — or press <strong>fill all three</strong> — and compare
    the call counts: three requests on the left, one on the right, for exactly the same edits.
  </p>

  <div v-for="key in KEYS" :key="key" class="pg-row field">
    <label class="pg-label label" :for="`wb-batch-${key}`">
      {{ key }}<template v-if="key === 'C3'"> (both servers reject this one)</template>
    </label>
    <input
      :id="`wb-batch-${key}`"
      class="pg-input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="perKey[key]"
      @input="onType(key, $event)"
    />
  </div>

  <p class="pg-row">
    <button class="pg-btn pg-btn--primary" @click="fillAll">fill all three</button>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <div class="pair">
    <div class="pg-box">
      <p class="head"><code>write</code> — one request per key</p>
      <p class="pg-row">
        <span class="pg-chip">calls: {{ perKeyCalls }}</span>
        <span class="pg-chip">pending: {{ perKeyOutbox.pending.join(', ') || 'none' }}</span>
        <span class="pg-chip">failed: {{ perKeyOutbox.failed.map((f) => f.key).join(', ') || 'none' }}</span>
      </p>
      <pre class="pg-log">{{ perKeyLog.length ? perKeyLog.join('\n') : 'nothing sent yet' }}</pre>
    </div>

    <div class="pg-box">
      <p class="head"><code>flush</code> — one call per tick</p>
      <p class="pg-row">
        <span class="pg-chip">calls: {{ batchCalls }}</span>
        <span class="pg-chip">pending: {{ batchOutbox.pending.join(', ') || 'none' }}</span>
        <span class="pg-chip">failed: {{ batchOutbox.failed.map((f) => f.key).join(', ') || 'none' }}</span>
      </p>
      <pre class="pg-log">{{ batchLog.length ? batchLog.join('\n') : 'nothing sent yet' }}</pre>
    </div>
  </div>

  <p class="pg-muted">
    Both sides end in the same place: <code>C1</code> and <code>C2</code> clear, <code>C3</code>
    stays pending and keeps retrying. The version guard runs per key inside a batch exactly as it
    does per request — edit <code>C1</code> while its batch is in the air and the batch's success
    will not clear it.
  </p>
</template>

<style scoped>
.field {
  margin: 0.35rem 0;
}
.label {
  width: 16rem;
}
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.head {
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
}
</style>
