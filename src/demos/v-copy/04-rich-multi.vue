<script setup lang="ts">
import { ref } from 'vue'
import type { RichCopyEntry } from '@ozjsey/v-copy'

const rows = [
  { id: 'u1', email: 'ada@lovelace.dev', phone: '+44 20 7946 0001' },
  { id: 'u2', email: 'grace@hopper.dev', phone: '+1 202 555 0102' },
]

// One shared log for every cell. `.rich` records objects instead of strings;
// the directive ARGUMENT stamps `key` so you can tell the sources apart.
const log = ref<RichCopyEntry[]>([])
</script>

<template>
  <table class="grid">
    <thead>
      <tr><th>email</th><th>phone</th></tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <td v-copy:[row.id].rich="log">{{ row.email }}</td>
        <td v-copy:[`${row.id}:phone`].rich="log">{{ row.phone }}</td>
      </tr>
    </tbody>
  </table>

  <pre class="pg-log">{{
    log.length
      ? log.map((e) => `[${e.key}] ${e.ok ? 'ok ' : 'ERR'} ${e.text}`).join('\n')
      : '— click a cell —'
  }}</pre>
</template>

<style scoped>
.grid {
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-bottom: 0.6rem;
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
