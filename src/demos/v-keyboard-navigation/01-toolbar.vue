<script setup lang="ts">
import { ref } from 'vue'

const applied = ref<string[]>([])

function toggle(name: string) {
  applied.value = applied.value.includes(name)
    ? applied.value.filter((n) => n !== name)
    : [...applied.value, name]
}
</script>

<template>
  <p class="pg-muted">
    Zero options. Click <strong>Bold</strong>, then press <kbd>Tab</kbd> — you leave the toolbar in
    one step instead of walking six buttons. <kbd>Tab</kbd> back and the arrows move inside it.
  </p>

  <div class="toolbar" role="toolbar" aria-label="Text formatting" v-keyboard-navigation>
    <button v-for="name in ['Bold', 'Italic', 'Underline', 'Strike', 'Code', 'Quote']" :key="name"
      class="tool" :aria-pressed="applied.includes(name)" @click="toggle(name)">
      {{ name }}
    </button>
  </div>

  <p class="pg-kv">applied: {{ applied.length ? applied.join(', ') : '—' }}</p>

  <p class="pg-muted">
    <code>role="toolbar"</code> is on your markup already, so the directive reads it: horizontal
    arrows, clamping at the ends, <kbd>Home</kbd>/<kbd>End</kbd>, and typeahead — press
    <kbd>c</kbd> to jump to Code. It never writes the role, and <code>aria-pressed</code> stays
    yours.
  </p>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 0.3rem;
  padding: 0.35rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
  background: #fbfcfe;
  width: max-content;
}
.tool {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 7px;
  padding: 0.35rem 0.7rem;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.tool:hover {
  background: #eef2ff;
}
.tool[aria-pressed='true'] {
  background: #4f46e5;
  color: #fff;
}
/* The directive's own CSS hook — no JS mirror needed. */
.tool[data-keyboard-navigation-item='active'] {
  border-color: #c7d2fe;
}
.tool:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 1px;
}
</style>
