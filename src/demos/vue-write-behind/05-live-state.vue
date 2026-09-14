<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * The four fields the store publishes, rendered raw and then rendered the way
 * an app actually would.
 *
 * `pending` is the "you have unsaved work" number and **includes** the keys
 * currently on the wire; `inFlight` is that subset; `failed` carries the latest
 * error per failing key; `isSyncing` is the spinner. Nothing here is computed
 * by this card — the store is reactive and already assembled.
 */
const ROWS = [
  { key: 'fast', label: 'fast endpoint', delay: 300, fails: false },
  { key: 'slow', label: 'slow endpoint (3 s)', delay: 3000, fails: false },
  { key: 'broken', label: 'endpoint that always 500s', delay: 400, fails: true },
]

const fields = reactive<Record<string, string>>({ fast: '', slow: '', broken: '' })
const behaviour = new Map(ROWS.map((row) => [row.key, row]))

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const outbox = useWriteBehind(fields, async (_value, key) => {
  const row = behaviour.get(key)
  await sleep(row ? row.delay : 300)
  if (row && row.fails) throw new Error(`500 Internal Server Error (${key})`)
})

function onType(key: string, event: Event) {
  fields[key] = (event.target as HTMLInputElement).value
}

/** The whole save-indicator recipe: three array lookups, no local bookkeeping. */
function status(key: string) {
  if (outbox.inFlight.includes(key)) return 'saving…'
  if (outbox.failed.some((failure) => failure.key === key)) return 'retrying'
  if (outbox.pending.includes(key)) return 'unsaved'
  return 'saved'
}

/** '' when the key is not failing — vue-tsc cannot narrow a lookup across two calls. */
function attemptLabel(key: string): string {
  const failure = outbox.failed.find((entry) => entry.key === key)
  return failure ? `attempt ${failure.attempts}` : ''
}
const unsaved = computed(() => outbox.pending.length)
</script>

<template>
  <p class="banner" :class="unsaved ? 'is-warn' : 'is-ok'">
    <template v-if="unsaved">
      {{ unsaved }} unsaved change(s){{ outbox.isSyncing ? ' — syncing…' : '' }}
    </template>
    <template v-else>all changes saved</template>
  </p>

  <p class="pg-muted">
    Three fields, three endpoints. Type in each and watch the four store fields below move
    independently — one slow key never holds up another, because per-key writes go out in parallel
    under <code>Promise.allSettled</code>.
  </p>

  <div v-for="row in ROWS" :key="row.key" class="pg-row field">
    <label class="pg-label label" :for="`wb-state-${row.key}`">{{ row.label }}</label>
    <input
      :id="`wb-state-${row.key}`"
      class="pg-input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="fields[row.key]"
      @input="onType(row.key, $event)"
    />
    <span class="pg-chip" :class="`is-${status(row.key).replace('…', '')}`">
      {{ status(row.key) }}
    </span>
    <span v-if="attemptLabel(row.key)" class="pg-muted">{{ attemptLabel(row.key) }}</span>
  </div>

  <table class="store">
    <tbody>
      <tr>
        <th scope="row"><code>pending</code></th>
        <td>{{ outbox.pending.length ? outbox.pending.join(', ') : '[]' }}</td>
      </tr>
      <tr>
        <th scope="row"><code>inFlight</code></th>
        <td>{{ outbox.inFlight.length ? outbox.inFlight.join(', ') : '[]' }}</td>
      </tr>
      <tr>
        <th scope="row"><code>failed</code></th>
        <td>
          {{
            outbox.failed.length
              ? outbox.failed.map((f) => `${f.key} × ${f.attempts}`).join(', ')
              : '[]'
          }}
        </td>
      </tr>
      <tr>
        <th scope="row"><code>isSyncing</code></th>
        <td>{{ outbox.isSyncing }}</td>
      </tr>
    </tbody>
  </table>

  <p class="pg-muted">
    <code>pending</code> deliberately includes the in-flight keys: the question a "leaving the page"
    guard has to answer is "is anything unconfirmed", and a request that has left but not landed is
    still unconfirmed. Subtract <code>inFlight</code> if you want the queue behind it.
  </p>
</template>

<style scoped>
.banner {
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 0.6rem;
}
.banner.is-ok {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.banner.is-warn {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}
.field {
  margin: 0.4rem 0;
}
.label {
  width: 13rem;
}
.pg-chip.is-saving {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}
.pg-chip.is-retrying {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fecaca;
}
.pg-chip.is-saved {
  background: #ecfdf5;
  color: #065f46;
  border-color: #a7f3d0;
}
.store {
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 0.82rem;
}
.store th,
.store td {
  border: 1px solid var(--stage-border);
  padding: 0.25rem 0.6rem;
  text-align: left;
  font-family: var(--mono);
}
.store th {
  background: #f7f8fb;
}
</style>
