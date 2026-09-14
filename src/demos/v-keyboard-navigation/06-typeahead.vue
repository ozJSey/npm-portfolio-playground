<script setup lang="ts">
import { computed, ref } from 'vue'

const fruits = [
  'Apple', 'Apricot', 'Avocado', 'Banana', 'Blueberry', 'Cherry',
  'Date', 'Elderberry', 'Fig', 'Grape', 'Kiwi', 'Lemon',
]
const timeout = ref(500)
const enabled = ref(true)
const options = computed(() => ({
  typeahead: enabled.value,
  typeaheadTimeout: timeout.value,
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input type="checkbox" v-model="enabled" /> typeahead
    </label>
    <label class="pg-label">
      timeout
      <select v-model.number="timeout" class="pg-select">
        <option :value="300">300ms</option>
        <option :value="500">500ms (default)</option>
        <option :value="2000">2000ms</option>
      </select>
    </label>
  </div>

  <ul class="grid" role="listbox" aria-label="Fruit" v-keyboard-navigation="options">
    <li v-for="fruit in fruits" :key="fruit" role="option" class="cell" :aria-selected="false">
      {{ fruit }}
    </li>
  </ul>

  <p class="pg-muted">
    Focus a cell and type. <kbd>a</kbd> repeatedly cycles Apple → Apricot → Avocado;
    <kbd>b</kbd><kbd>l</kbd> refines to Blueberry rather than skipping past it. The live buffer is
    published as <code>data-keyboard-navigation-typeahead</code> on the host — the floating badge
    over the grid is a <code>::after</code> rule reading that attribute, with no JavaScript
    involved at all.
  </p>

  <p class="pg-muted">
    <kbd>Escape</kbd> drops a half-typed word without being claimed, and a letter that matches
    nothing is never claimed either — it reaches your own shortcut handler. Typeahead is the first
    of the platform <code>focusgroup</code> attribute's permanent non-goals.
  </p>

  <p class="pg-muted">
    <strong>One column on purpose.</strong> This card used to lay the twelve options out in a
    four-wide grid with <code>aria-orientation="horizontal"</code>, which made
    <kbd>↑</kbd>/<kbd>↓</kbd> dead keys and sent <kbd>→</kbd> at the end of a visual row down-and-
    left to the start of the next one. 2D grids are <em>not implemented</em> — the README says a
    half-done grid is the worst outcome — so a card offered as something to copy must not be one.
  </p>
</template>

<style scoped>
.grid {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 240px;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
}
.cell {
  padding: 0.45rem 0.6rem;
  border-radius: 7px;
  font-size: 0.85rem;
  background: #f7f8fc;
  cursor: pointer;
}
.cell[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.cell:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
/* The live buffer, straight out of the attribute. No JS mirror. */
.grid[data-keyboard-navigation-typeahead]::after {
  content: 'typing: ' attr(data-keyboard-navigation-typeahead);
  position: absolute;
  top: -0.7rem;
  right: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #4f46e5;
  color: #fff;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}
</style>
