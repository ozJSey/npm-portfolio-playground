<script setup lang="ts">
import { ref } from 'vue'
import type { MutateEvent } from 'v-observe'

const debounce = ref(0)
const log = ref<string[]>([])
const valid = ref(true)

function onEdit(e: MutateEvent) {
  if (e.type !== 'text') return
  valid.value = (e.to ?? '').trim().length >= 5
  log.value.unshift(`text: "${e.from ?? ''}" → "${e.to ?? ''}"`)
  log.value.length = Math.min(log.value.length, 6)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      debounce
      <input v-model.number="debounce" type="range" min="0" max="600" step="50" />
      {{ debounce }}ms
    </label>
    <span class="pg-chip" :class="{ bad: !valid }">{{ valid ? 'valid' : 'too short' }}</span>
  </div>

  <p
    contenteditable
    class="editor"
    :class="{ invalid: !valid }"
    v-observe="{ mutate: { on: 'text', debounce, handler: onEdit } }"
  >
    Type in here — live validation with no input event.
  </p>

  <pre class="pg-log" style="margin-top: 0.5rem">{{ log.join('\n') || '— start typing —' }}</pre>
  <p class="pg-muted">
    Text mode subscribes with <code>subtree: true</code>, so edits in nested nodes fire too. Several
    character-data records in one observer batch collapse into a single event that keeps the
    original <code>from</code> and the latest <code>to</code>.
  </p>
</template>

<style scoped>
.editor {
  border: 2px solid #b9c1d4;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  margin: 0;
  max-width: 34rem;
  background: #fff;
}
.editor.invalid {
  border-color: #dc2626;
  background: #fef2f2;
}
.pg-chip.bad {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
</style>
