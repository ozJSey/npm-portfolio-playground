<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

const rows = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`)
const mode = ref<'auto' | 'fixed' | 'off'>('auto')
const landed = ref('—')
const pane = useTemplateRef<HTMLElement>('pane')

const options = computed(() => {
  if (mode.value === 'off') return { page: false }
  if (mode.value === 'fixed') return { page: 3 }
  return {}
})

function onMove(event: Event) {
  if (!(event instanceof CustomEvent)) return
  landed.value = `${(event.detail.item.textContent || '').trim()} (${event.detail.reason})`
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      page
      <select v-model="mode" class="pg-select">
        <option value="auto">true — a real visible page</option>
        <option value="fixed">3 — a fixed step</option>
        <option value="off">false — leave the keys to the browser</option>
      </select>
    </label>
    <span class="pg-muted">focus a line, then <kbd>PageDown</kbd> / <kbd>PageUp</kbd></span>
  </div>

  <div ref="pane" class="pane">
    <ul class="list" role="listbox" aria-label="Lines" v-keyboard-navigation="options"
      @keyboard-navigate="onMove">
      <li v-for="row in rows" :key="row" role="option" class="row" :aria-selected="false">
        {{ row }}
      </li>
    </ul>
  </div>

  <p class="pg-kv">landed on: {{ landed }}</p>

  <p class="pg-muted">
    The window is 180px and the lines are 30px, so a page is six lines and
    <kbd>PageDown</kbd> moves exactly six — measured from the scroll viewport, not guessed. Radix
    and Reka both map these keys to first / last, which is not what the APG describes. Where
    nothing scrolls, one page <em>is</em> the whole list and this degrades to first / last on its
    own — which is where the others start.
  </p>
  <p class="pg-muted">
    A page always stops at the end even when the arrows wrap: wrapping a whole page past the last
    item is disorienting in a way a single arrow step is not.
  </p>
</template>

<style scoped>
.pane {
  height: 180px;
  overflow-y: auto;
  /* An inset shadow rather than a border, so the scroll viewport is exactly
     180px and a page is exactly six 30px lines — the card is making a claim
     about a measurement, so the measurement has to be clean. */
  box-shadow: inset 0 0 0 1px #dfe3ec;
  border-radius: 10px;
  background: #fff;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  box-sizing: border-box;
  height: 30px;
  padding: 0 0.75rem;
  line-height: 30px;
  font-size: 0.82rem;
  border-bottom: 1px solid #f4f6fb;
  cursor: pointer;
}
.row[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.row:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
</style>
