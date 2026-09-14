<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DedupeScope, RichCopyEntry } from '@ozjsey/v-copy'

/**
 * `dedupe` compares the copied TEXT, not the label. Two columns holding the
 * same address collapse to one row and the newest label wins — right for a
 * picker (one row per clipboard payload), wrong for a per-source log.
 * `scope: 'key'` is the opt-out.
 */
const scope = ref<DedupeScope>('text')
const log = ref<RichCopyEntry[]>([])

const rows = [
  { id: 'r1', primary: 'ada@lovelace.dev', backup: 'ada@lovelace.dev' },
  { id: 'r2', primary: 'grace@hopper.dev', backup: 'grace@backup.dev' },
]

/**
 * A `computed` config object: a new plain object each time `scope` changes, so
 * the re-render re-resolves the option. Plain objects are config — the
 * directive reads them and writes nothing back, so throwing one away per render
 * costs nothing.
 */
const cfg = computed(() => ({ sink: log.value, rich: true, dedupe: { scope: scope.value } }))
</script>

<template>
  <div class="pg-col">
    <div class="pg-row">
      <label class="pg-label">
        <input v-model="scope" type="radio" value="text" /> scope: 'text' (default)
      </label>
      <label class="pg-label">
        <input v-model="scope" type="radio" value="key" /> scope: 'key'
      </label>
      <button class="pg-btn" :disabled="!log.length" @click="log.splice(0)">Clear</button>
    </div>

    <table class="grid">
      <thead>
        <tr><th>primary</th><th>backup</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td v-copy:primary="cfg">{{ r.primary }}</td>
          <td v-copy:backup="cfg">{{ r.backup }}</td>
        </tr>
      </tbody>
    </table>

    <p class="pg-muted">
      Row 1 holds the same address in both columns. Copy <strong>primary</strong> then
      <strong>backup</strong>: under <code>'text'</code> you get one row labelled
      <code>backup</code> — the payload is identical, so it is one row, and the console says so once.
      Under <code>'key'</code> you get a row each. Row 2's addresses differ, so both scopes keep two.
    </p>

    <pre class="pg-log">{{
      log.length
        ? log.map((e) => `[${e.key}] ${e.ok ? 'ok ' : 'ERR'} ${e.text}`).join('\n')
        : '— copy a cell —'
    }}</pre>

    <p class="pg-muted">
      The <code>ok</code> column matters here: a <strong>failed</strong> copy never merges and never
      evicts, so if the clipboard write is refused (no user gesture, insecure context) you will see
      two rows under <code>'text'</code> as well — not a contradiction, the other documented rule.
    </p>
  </div>
</template>

<style scoped>
.grid {
  border-collapse: collapse;
  font-size: 0.85rem;
}
.grid th {
  text-align: left;
  font-weight: 600;
  color: #5b6478;
  font-size: 0.75rem;
  padding: 0 0.6rem 0.25rem;
}
.grid td {
  font-family: var(--mono);
  border: 1px solid var(--stage-border);
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
.grid td[data-copied] {
  background: #f0fdf4;
  border-color: #16a34a;
}
</style>
