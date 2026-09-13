<script setup lang="ts">
import { ref } from 'vue'
import type { MutateEvent } from 'v-observe'

const debounce = ref(150)
const cls = ref('calm')
const rows = ref(['a'])
const log = ref<string[]>([])

// One burst: attribute + three children + a text edit, all inside one tick.
function burst() {
  cls.value = cls.value === 'calm' ? 'busy' : 'calm'
  rows.value.push('x', 'y', 'z')
}

function onMutate(e: MutateEvent) {
  const detail =
    e.type === 'children:added'
      ? `+${e.added?.length ?? 0}`
      : e.type === 'children:removed'
        ? `-${e.removed?.length ?? 0}`
        : `${e.from ?? 'null'} → ${e.to ?? 'null'}`
  log.value.unshift(`${e.type}  ${detail}`)
  log.value.length = Math.min(log.value.length, 8)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      debounce
      <input v-model.number="debounce" type="range" min="0" max="500" step="50" />
      {{ debounce }}ms
    </label>
    <button class="pg-btn pg-btn--primary" @click="burst">Mutate everything at once</button>
    <button class="pg-btn" :disabled="rows.length < 2" @click="rows.splice(1)">Reset rows</button>
  </div>

  <div
    class="panel"
    :class="cls"
    v-observe="{
      mutate: {
        on: ['attr:class', 'children:added', 'children:removed', 'text'],
        debounce,
        handler: onMutate,
      },
    }"
  >
    <span v-for="(r, i) in rows" :key="i" class="pg-chip">{{ r }}</span>
  </div>

  <pre class="pg-log" style="margin-top: 0.5rem">{{ log.join('\n') || '— press the button —' }}</pre>
  <p class="pg-muted">
    The array form unions the subscription. Debounced child-list events concatenate their
    <code>added</code> / <code>removed</code> arrays instead of firing three times. The orange
    outline is <code>mutate:active</code>, which flips back to <code>mutate:idle</code> 150ms after
    each flush.
  </p>
</template>

<style scoped>
.panel {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.8rem;
  border-radius: 8px;
  border: 2px solid transparent;
  background: #f4f6fb;
  min-height: 3rem;
}
.panel.busy {
  background: #fffbeb;
}
.panel[data-observe-state*='mutate:active'] {
  border-color: #f59e0b;
}
</style>
