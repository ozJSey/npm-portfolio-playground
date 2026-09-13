<script setup lang="ts">
import { computed, ref } from 'vue'
import type { KeyboardNavigationEventDetail } from 'v-keyboard-navigation'

const rows = ref(['Ada', 'Alan', 'Barbara', 'Grace'])
const log = ref<string[]>([])
const filter = ref('')

const shown = computed(() =>
  rows.value.filter((r) => r.toLowerCase().includes(filter.value.toLowerCase())),
)

function onNavigate(detail: KeyboardNavigationEventDetail) {
  const from = detail.previousItem ? (detail.previousItem.textContent || '').trim() : '(none)'
  log.value = [
    `${detail.reason}: ${from} → ${(detail.item.textContent || '').trim()} [${detail.previousIndex} → ${detail.index}]`,
    ...log.value,
  ].slice(0, 8)
}

const options = computed(() => ({ onNavigate }))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      filter
      <input class="pg-input" v-model="filter" placeholder="try 'z' for an empty group" />
    </label>
    <button class="pg-btn" @click="log = []">Clear log</button>
  </div>

  <div class="list" role="listbox" aria-label="People" v-keyboard-navigation="options">
    <div v-for="row in shown" :key="row" role="option" class="row" :aria-selected="false">
      {{ row }}
    </div>
  </div>

  <p class="pg-muted">
    The badge above the box is CSS reading <code>data-keyboard-navigation-state</code>: it says
    <code>idle</code>, <code>active</code> while focus is inside, and turns red on
    <code>empty</code>. Filter to <kbd>z</kbd> — a group with no focusable items has left the
    keyboard entirely, and this attribute is the only thing that says so.
  </p>

  <ul class="pg-log">
    <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    <li v-if="!log.length" class="pg-muted">arrow around, or click a row</li>
  </ul>

  <p class="pg-muted">
    Every move is reported once through both channels — the <code>onNavigate</code> option used
    here and the bubbling <code>keyboard-navigate</code> CustomEvent, with the same detail. The
    <code>reason</code> tells them apart: <code>key</code>, <code>typeahead</code>,
    <code>pointer</code>, <code>api</code>, <code>sync</code>.
  </p>
</template>

<style scoped>
.list {
  position: relative;
  min-height: 54px;
  padding: 0.3rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
}
.list::after {
  content: attr(data-keyboard-navigation-state);
  position: absolute;
  top: -0.7rem;
  right: 0.5rem;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}
.list[data-keyboard-navigation-state='active']::after {
  background: #dcfce7;
  color: #166534;
}
.list[data-keyboard-navigation-state='empty']::after {
  background: #fee2e2;
  color: #991b1b;
}
.row {
  padding: 0.35rem 0.55rem;
  border-radius: 7px;
  font-size: 0.85rem;
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
