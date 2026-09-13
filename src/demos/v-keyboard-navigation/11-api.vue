<script setup lang="ts">
import { computed, ref } from 'vue'
import type { KeyboardNavigationApi } from 'v-keyboard-navigation'

const nav = ref<KeyboardNavigationApi>()
const enabled = ref(true)
const target = ref(4)

// Options carrying a ref must be built in <script setup>: Vue unwraps refs
// inside template expressions, so an inline object would hand the directive
// `nav.value` — undefined at mount — and the api would never bind.
const options = computed(() => ({ ref: nav, enabled: enabled.value }))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn" @click="nav?.first()">first()</button>
    <button class="pg-btn" @click="nav?.previous()">previous()</button>
    <button class="pg-btn" @click="nav?.next()">next()</button>
    <button class="pg-btn" @click="nav?.last()">last()</button>
    <label class="pg-label">
      focus(<input type="number" class="pg-input" style="width: 4rem" v-model.number="target" />)
      <button class="pg-btn pg-btn--primary" @click="nav?.focus(target)">go</button>
    </label>
    <label class="pg-label"><input type="checkbox" v-model="enabled" /> enabled</label>
  </div>

  <div class="strip" role="toolbar" aria-label="API driven" v-keyboard-navigation="options">
    <button v-for="n in 8" :key="n" class="cell">{{ n }}</button>
  </div>

  <p class="pg-kv">activeIndex: {{ nav?.activeIndex ?? '—' }}</p>
  <p class="pg-kv">activeItem: {{ nav?.activeItem?.textContent ?? '—' }}</p>
  <p class="pg-kv">items: {{ nav?.items.length ?? 0 }}</p>

  <p class="pg-muted">
    <code>items</code>, <code>activeIndex</code> and <code>activeItem</code> are shallow-reactive,
    so the readouts above update as you arrow around. Shallow on purpose: a deep
    <code>reactive</code> would hand back proxies of the elements, and
    <code>api.activeItem === myRef.value</code> would quietly be false.
  </p>
  <p class="pg-muted">
    An out-of-range <code>focus()</code> is a no-op, not a throw. Unticking <code>enabled</code>
    restores every original <code>tabindex</code>, stops handling keys, and sets
    <code>data-keyboard-navigation-state="disabled"</code> — the state is reported rather than
    silently assumed.
  </p>
</template>

<style scoped>
.strip {
  display: flex;
  gap: 0.3rem;
  width: max-content;
  padding: 0.35rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
}
.cell {
  width: 40px;
  height: 34px;
  border: 1px solid #e3e7f0;
  border-radius: 7px;
  background: #fbfcfe;
  font: inherit;
  cursor: pointer;
}
.cell[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
  font-weight: 700;
}
.cell:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 1px;
}
.strip[data-keyboard-navigation-state='disabled'] {
  opacity: 0.5;
}
</style>
