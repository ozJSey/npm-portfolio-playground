<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * The whole product, in one card: the cell does not jump.
 *
 * The server below is deliberately slow (1.8 s) and opinionated — it always
 * answers with the value UPPERCASED. Type in a cell, keep typing while the
 * request is still in the air, and watch the field: the reply never lands in
 * it. Every other card here is a detail of this one.
 */
const KEYS = ['A1', 'B1', 'A2', 'B2']

/** Local state. The record the outbox watches, and the only copy that matters. */
const cells = reactive<Record<string, string>>({ A1: '', B1: '', A2: '', B2: '' })

/**
 * What your keystrokes produced, mirrored key by key.
 *
 * This card writes `:value` + `@input` rather than `v-model` — the same two
 * halves `v-model` compiles to — for one reason: it needs to hold the two
 * apart. `typed` is what the keyboard did; `cells` is what the field shows. If
 * they ever disagree, something other than you wrote local state, and that is
 * exactly what this library exists to make impossible.
 */
const typed = reactive<Record<string, string>>({ A1: '', B1: '', A2: '', B2: '' })

/** The last answer the server gave per cell — received, shown here, discarded. */
const replies = reactive<Record<string, string>>({})

const log = ref<string[]>([])
const keystrokes = ref(0)
const requests = ref(0)
const changes = ref(0)
const jumps = ref<string[]>([])

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const say = (line: string) => {
  log.value = [...log.value.slice(-13), `${stamp()}  ${line}`]
}

// The bare form: a record and a writer. No options, no wrapper, no client.
const outbox = useWriteBehind(cells, async (value, key) => {
  requests.value += 1
  say(`PUT /cell/${key}   ${JSON.stringify(value)}`)
  await sleep(1800)
  const answer = String(value).toUpperCase()
  replies[key] = answer
  say(`200  ${key} -> ${JSON.stringify(answer)}   ← discarded, never applied`)
  // Returning the body changes nothing: the writer's result is ignored on
  // purpose. Delete `return` and the card behaves identically.
  return { [key]: answer }
})

function onType(key: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  keystrokes.value += 1
  typed[key] = value
  cells[key] = value
}

/**
 * The check, running live. Every change to local state is compared against the
 * last thing the keyboard produced for that key. `flush: 'sync'` so a write
 * from anywhere else is caught in the same tick it happens, before a later
 * keystroke can paper over it.
 */
watch(
  cells,
  () => {
    changes.value += 1
    for (const key of KEYS) {
      if (cells[key] === typed[key]) continue
      jumps.value = [
        ...jumps.value,
        `${key} became ${JSON.stringify(cells[key])} — you typed ${JSON.stringify(typed[key])}`,
      ]
      typed[key] = cells[key]
    }
  },
  { flush: 'sync' },
)

function cellState(key: string) {
  if (outbox.inFlight.includes(key)) return 'saving…'
  if (outbox.pending.includes(key)) return 'queued'
  if (replies[key] !== undefined) return 'saved'
  return '—'
}

function clearAll() {
  for (const key of KEYS) {
    typed[key] = ''
    cells[key] = ''
    delete replies[key]
  }
  log.value = []
  jumps.value = []
  keystrokes.value = 0
  requests.value = 0
  changes.value = 0
}
</script>

<template>
  <p class="pg-muted">
    A grid of cells against a slow server (1.8 s) that echoes every value back
    <strong>UPPERCASED</strong>. Type into a cell and <em>keep typing</em> while it says
    <code>saving…</code>. The reply arrives, the log records it, and the field never moves.
  </p>

  <table class="grid">
    <thead>
      <tr>
        <th>cell</th>
        <th>your value (local, authoritative)</th>
        <th>server's last reply (discarded)</th>
        <th>state</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="key in KEYS" :key="key">
        <th scope="row">{{ key }}</th>
        <td>
          <input
            class="pg-input cell"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :aria-label="`cell ${key}`"
            :value="cells[key]"
            @input="onType(key, $event)"
          />
        </td>
        <td class="reply">{{ replies[key] ?? '—' }}</td>
        <td class="state">{{ cellState(key) }}</td>
      </tr>
    </tbody>
  </table>

  <p class="verdict" :class="jumps.length ? 'is-bad' : 'is-ok'">
    <template v-if="jumps.length">
      JUMPED — {{ jumps.length }} write(s) to local state did not come from you:
      {{ jumps.join(' · ') }}
    </template>
    <template v-else>
      no jump — {{ changes }} change(s) to local state, every one of them yours
    </template>
  </p>

  <p class="pg-row">
    <span class="pg-chip">keystrokes: {{ keystrokes }}</span>
    <span class="pg-chip">requests: {{ requests }}</span>
    <span class="pg-chip">pending: {{ outbox.pending.join(', ') || 'none' }}</span>
    <span class="pg-chip">inFlight: {{ outbox.inFlight.join(', ') || 'none' }}</span>
    <span class="pg-chip">isSyncing: {{ outbox.isSyncing }}</span>
    <button class="pg-btn" @click="outbox.flush()">flush()</button>
    <button class="pg-btn" @click="clearAll">reset</button>
  </p>

  <pre class="pg-log">{{ log.length ? log.join('\n') : 'no requests yet — type in a cell' }}</pre>

  <p class="pg-muted">
    Two things to notice. The <strong>keystroke count runs far ahead of the request count</strong>:
    a burst of edits coalesces into one write carrying the newest value. And the
    <strong>reply column fills up while the input does not change</strong> — the server's answer is
    read, logged and thrown away, because applying it is precisely the bug where a cell someone is
    typing in gets overwritten from the network.
  </p>
</template>

<style scoped>
.grid {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  font-size: 0.85rem;
}
.grid th,
.grid td {
  border: 1px solid var(--stage-border);
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.grid thead th {
  font-weight: 600;
  font-size: 0.75rem;
  color: #5b6478;
  background: #f7f8fb;
}
.cell {
  width: 100%;
}
.reply,
.state {
  font-family: var(--mono);
  font-size: 0.78rem;
  white-space: nowrap;
}
.reply {
  color: #9aa3b8;
}
.verdict {
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  margin: 0.5rem 0;
}
.verdict.is-ok {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.verdict.is-bad {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
</style>
