<script setup lang="ts">
import { ref } from 'vue'
import type { CopyResult } from '@ozjsey/v-copy'

/**
 * The failure mode this card exists for: a copy that writes an EMPTY string
 * does not fail — it clears whatever the user had on their clipboard, while the
 * UI flashes "Copied!". So an empty resolution is refused instead.
 */
const token = ref<string | null>(null)
const maybeToken = ref<string | undefined>(undefined)
const emptied = ref('')

const log = ref<string[]>([])
function onResult(e: Event) {
  const r = (e as CustomEvent<CopyResult>).detail
  log.value.unshift(r.success ? `ok — wrote "${r.text}"` : `refused — error: "${r.error}"`)
  log.value.splice(6)
}
</script>

<template>
  <div class="pg-col" @copy-result="onResult">
    <div class="pg-row">
      <!-- `null` means "not here yet". Without the guard this would copy the
           button's own label, which is the async-token trap. -->
      <button class="pg-btn" v-copy="token">
        Copy token ({{ token === null ? 'null — not loaded' : token }})
      </button>
      <button class="pg-btn" @click="token = token === null ? 'sk-live-4417' : null">
        {{ token === null ? 'Load the token' : 'Unload it again' }}
      </button>
    </div>

    <div class="pg-row">
      <!-- `undefined` cannot be told apart from a bare `v-copy`, so the config
           form is the way to say "this value may be missing". -->
      <button class="pg-btn" v-copy="{ source: maybeToken }">
        Config form — source is {{ maybeToken === undefined ? 'undefined' : maybeToken }}
      </button>
      <button class="pg-btn" @click="maybeToken = maybeToken === undefined ? 'cfg-9f2c1ab' : undefined">
        {{ maybeToken === undefined ? 'Give it a value' : 'Take it away' }}
      </button>
    </div>

    <div class="pg-row">
      <button class="pg-btn" v-copy="emptied">Empty string — refused, clipboard untouched</button>
      <input v-model="emptied" class="pg-input" placeholder="type here to give it something" />
    </div>

    <p class="pg-muted">
      A bare <code>v-copy</code> and <code>v-copy="somethingUndefined"</code> compile to the same
      binding, so <code>undefined</code> keeps meaning “copy my textContent”. <code>null</code> and an
      explicit <code>{{ '{ source: … }' }}</code> are the two forms the directive can tell apart — both
      are refused with <code>error: 'pending'</code>. An empty resolution is refused with
      <code>error: 'empty'</code>. Neither sets <code>[data-copied]</code>, announces, or records
      history.
    </p>

    <pre class="pg-log">{{ log.length ? log.join('\n') : '— click any button above —' }}</pre>
  </div>
</template>

<style scoped>
.pg-input {
  font-family: var(--mono);
  font-size: 0.8rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  min-width: 14rem;
}
.pg-btn[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
</style>
