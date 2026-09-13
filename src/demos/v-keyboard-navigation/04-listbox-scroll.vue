<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

// 200 rows of exactly 40px in a 200px window: five visible at a time, which
// is the geometry the measured trace in the README was taken from.
const rows = Array.from({ length: 200 }, (_, i) => `Row ${i + 1}`)

const controlled = ref(true)
const trace = ref<number[]>([])
const pane = useTemplateRef<HTMLElement>('pane')

// Built here, not inline in the template: options that carry a ref must be,
// and keeping every card consistent avoids teaching the wrong habit.
const options = computed(() => ({ scroll: controlled.value }))

function onMove() {
  // `keyboard-navigate` fires after the directive has focused and scrolled,
  // so this reads the settled scrollTop for the keystroke that caused it.
  const el = pane.value
  if (!el) return
  trace.value = [...trace.value, Math.round(el.scrollTop)].slice(-12)
}

function reset() {
  trace.value = []
  if (pane.value) pane.value.scrollTop = 0
  const first = pane.value?.querySelector('li')
  if (first instanceof HTMLElement) first.focus()
}
</script>

<template>
  <p class="pg-muted">
    <strong>The reason this package exists.</strong> Click <em>Row 1</em>, then hold
    <kbd>↓</kbd>. Watch the <code>scrollTop</code> trace under the list.
  </p>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input type="checkbox" v-model="controlled" />
      controlled scroll (<code>preventScroll</code> + <code>block: 'nearest'</code>)
    </label>
    <button class="pg-btn" @click="reset">Reset trace</button>
  </div>

  <div ref="pane" class="list-pane">
    <ul class="list" role="listbox" aria-label="Rows" v-keyboard-navigation="options"
      @keyboard-navigate="onMove">
      <li v-for="row in rows" :key="row" role="option" class="row" :aria-selected="false">
        {{ row }}
      </li>
    </ul>
  </div>

  <p class="pg-kv">
    scrollTop per key: <code class="trace">{{ trace.length ? trace.join(', ') : '—' }}</code>
  </p>

  <p class="pg-muted">
    Controlled, the trace steps <code>40, 80, 120…</code> — the list follows the focus ring one row
    at a time. Untick the box to get the browser's own focus scroll:
    <code>120, 120, 120, 240…</code>, because the user agent <em>centres</em> the focused row, so a
    five-row window lurches three rows at a time. Every roving-tabindex library ships the second
    column, deliberately — the APG says the user agent will scroll for you. It does; it just
    scrolls badly.
  </p>
</template>

<style scoped>
.list-pane {
  height: 200px;
  overflow-y: auto;
  /* An inset shadow rather than a border, so the scroll viewport is exactly
     200px and the trace steps in clean 40s — this card is a measurement. */
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
  height: 40px;
  padding: 0 0.75rem;
  line-height: 40px;
  font-size: 0.85rem;
  border-bottom: 1px solid #f1f3f9;
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
.trace {
  font-size: 0.78rem;
  color: #3730a3;
}
</style>
