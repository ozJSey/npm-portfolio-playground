<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef } from 'vue'

const rows = ref(['Alpha', 'Bravo', 'Charlie', 'Delta'])
const disabled = ref<string[]>([])
const host = useTemplateRef<HTMLElement>('host')
const seq = ref(0)

// Measured off the live DOM rather than derived from the data: the whole
// point is what the browser ends up with. The directive re-establishes the
// invariant in a MutationObserver microtask, which is after Vue's render, so
// a computed over `rows` would read the count one tick too early.
const tabbable = ref(0)
let watcher: MutationObserver | undefined

onMounted(() => {
  const el = host.value
  if (!el) return
  const measure = () => {
    tabbable.value = el.querySelectorAll('[tabindex="0"]').length
  }
  measure()
  watcher = new MutationObserver(measure)
  watcher.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex'] })
})

onUnmounted(() => watcher?.disconnect())

function add() {
  seq.value += 1
  rows.value = [...rows.value, `Item ${seq.value}`]
}
function removeFocused() {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  const text = (active.textContent || '').trim()
  rows.value = rows.value.filter((r) => r !== text)
}
function shuffle() {
  rows.value = [...rows.value].reverse()
}
function toggleDisabledFocused() {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  const row = (active.textContent || '').trim()
  if (!rows.value.includes(row)) return
  disabled.value = disabled.value.includes(row)
    ? disabled.value.filter((r) => r !== row)
    : [...disabled.value, row]
}
function clear() {
  rows.value = []
}
function refill() {
  rows.value = ['Alpha', 'Bravo', 'Charlie', 'Delta']
  disabled.value = []
}
</script>

<template>
  <p class="pg-muted">
    <strong>The bug this package is built around.</strong> Focus a row, then break the list while
    it is focused. The readout must never leave 1 while rows exist — a group with zero tab stops
    has silently left the keyboard, and a group with two has grown a second one.
  </p>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn" @click="add">Add</button>
    <button class="pg-btn" @click="removeFocused">Remove focused</button>
    <button class="pg-btn" @click="toggleDisabledFocused">Disable focused</button>
    <button class="pg-btn" @click="shuffle">Reverse</button>
    <button class="pg-btn" @click="clear">Remove all</button>
    <button class="pg-btn pg-btn--primary" @click="refill">Refill</button>
  </div>

  <div ref="host" class="list" role="listbox" aria-label="Dynamic rows" v-keyboard-navigation>
    <div v-for="row in rows" :key="row" role="option" class="row" :aria-selected="false"
      :aria-disabled="disabled.includes(row) ? 'true' : undefined">
      {{ row }}{{ disabled.includes(row) ? ' (disabled)' : '' }}
    </div>
    <p v-if="!rows.length" class="empty">no rows — press Refill</p>
  </div>

  <p class="pg-kv">tabbable items: {{ tabbable }}</p>

  <p class="pg-muted">
    Removing the focused row moves focus to the row that took its place, instead of dropping it on
    <code>&lt;body&gt;</code>. Disabling the tabbable row hands its <code>tabindex</code> back and
    promotes another — otherwise you would end up with two tab stops, one of them on a control the
    user was just told is unavailable. None of this is driven by Vue's <code>updated</code> hook:
    it is a <code>MutationObserver</code>, because the DOM changes that break the invariant are
    often not Vue's.
  </p>
</template>

<style scoped>
.list {
  min-height: 60px;
  padding: 0.3rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
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
.row[aria-disabled='true'] {
  opacity: 0.45;
}
.row:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
.empty {
  margin: 0;
  padding: 0.5rem;
  font-size: 0.8rem;
  color: #97a0b4;
}
/* The host state is a real signal, readable from CSS alone — including
   `empty`, which is the only thing that tells you the group has left the
   keyboard entirely. */
.list {
  position: relative;
}
.list::after {
  content: 'state: ' attr(data-keyboard-navigation-state);
  position: absolute;
  top: -0.7rem;
  right: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}
.list[data-keyboard-navigation-state='empty']::after {
  background: #fee2e2;
  color: #991b1b;
}
</style>
