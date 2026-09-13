<script setup lang="ts">
import { ref } from 'vue'

const items = ['New file', 'New window', 'Open…', 'Save', 'Save as…', 'Close editor', 'Exit']
const chosen = ref('—')
</script>

<template>
  <p class="pg-muted">
    <code>role="menu"</code>: vertical arrows, wrapping at both ends,
    <kbd>Home</kbd>/<kbd>End</kbd>. The rows are plain <code>&lt;div role="menuitem"&gt;</code> with
    no <code>tabindex</code> of their own — the directive adopts anything carrying an item role and
    makes exactly one of them tabbable.
  </p>

  <div class="menu" role="menu" aria-label="File" v-keyboard-navigation>
    <div v-for="item in items" :key="item" role="menuitem" class="menuitem" @click="chosen = item"
      @keydown.enter="chosen = item">
      {{ item }}
    </div>
  </div>

  <p class="pg-kv">chosen: {{ chosen }}</p>

  <p class="pg-muted">
    Type <kbd>s</kbd> twice: typeahead walks <em>Save</em> → <em>Save as…</em>. <kbd>Enter</kbd> is
    never claimed by the directive, so it still reaches your own handler — and neither is
    <kbd>Escape</kbd>, which a real menu uses to close.
  </p>
</template>

<style scoped>
.menu {
  width: 230px;
  padding: 0.3rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 6px 20px rgb(15 23 42 / 8%);
}
.menuitem {
  padding: 0.4rem 0.65rem;
  border-radius: 7px;
  font-size: 0.85rem;
  cursor: pointer;
}
.menuitem:hover {
  background: #f4f6fb;
}
.menuitem[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  color: #3730a3;
}
.menuitem:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
</style>
