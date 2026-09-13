<script setup lang="ts">
import { ref } from 'vue'
import type { CopyResult } from '@ozjsey/v-copy'

const events = ref<string[]>([])
const items = ['alpha', 'beta', 'gamma']

function push(line: string) {
  events.value.unshift(`${new Date().toLocaleTimeString()}  ${line}`)
  events.value.length = Math.min(events.value.length, 8)
}

// The bubbling CustomEvent is the only channel the bare/string binding forms
// have — and it lets ONE parent listener collect a whole v-for subtree.
function onAnyCopy(e: Event) {
  const detail = (e as CustomEvent<CopyResult>).detail
  push(`event  ok=${detail.success} via=${detail.via} text="${detail.text}"`)
}
</script>

<template>
  <div class="pg-col">
    <button
      class="pg-btn"
      v-copy="{
        source: 'callback demo',
        onCopy: (r) => push(`onCopy   attempt via ${r.via}`),
        onSuccess: (r) => push(`onSuccess '${r.text}'`),
        onError: (r) => push(`onError  ${r.error}`),
      }"
    >
      Copy with onCopy / onSuccess / onError
    </button>

    <p class="pg-muted" style="margin: 0.4rem 0 0">
      One <code>@copy-result</code> listener on the &lt;ul&gt;, three copyable children:
    </p>
    <ul class="rows" @copy-result="onAnyCopy">
      <li v-for="item in items" :key="item" v-copy>{{ item }}</li>
    </ul>

    <pre class="pg-log">{{ events.join('\n') || '— no events yet —' }}</pre>
  </div>
</template>

<style scoped>
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0.35rem;
}
.rows li {
  font-family: var(--mono);
  font-size: 0.85rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.25rem 0.7rem;
  cursor: pointer;
}
.rows li[data-copied] {
  background: #f0fdf4;
  border-color: #16a34a;
}
</style>
