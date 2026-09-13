<script setup lang="ts">
import { ref } from 'vue'
import type { MutateEvent, MutateEventType } from 'v-observe'

const subscription = ref<MutateEventType>('attr:class')
const theme = ref('light')
const flag = ref('off')
const log = ref<string[]>([])

function onMutate(e: MutateEvent) {
  log.value.unshift(`${e.type}${e.name ? ` (${e.name})` : ''}: ${e.from ?? 'null'} → ${e.to ?? 'null'}`)
  log.value.length = Math.min(log.value.length, 8)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      subscribe to
      <select v-model="subscription" class="pg-select">
        <option value="attr:class">attr:class</option>
        <option value="attr:style">attr:style</option>
        <option value="attr:data-flag">attr:data-flag (any named attribute)</option>
        <option value="attr:*">attr:* (no filter)</option>
      </select>
    </label>
    <button class="pg-btn" @click="theme = theme === 'light' ? 'dark' : 'light'">
      toggle class
    </button>
    <button class="pg-btn" @click="flag = flag === 'off' ? 'on' : 'off'">toggle data-flag</button>
    <button class="pg-btn" @click="log = []">clear</button>
  </div>

  <div
    class="target"
    :class="theme"
    :data-flag="flag"
    :style="{ borderStyle: flag === 'on' ? 'solid' : 'dashed' }"
    v-observe="{ mutate: { on: subscription, handler: onMutate } }"
  >
    class="{{ theme }}" data-flag="{{ flag }}"
  </div>

  <pre class="pg-log" style="margin-top: 0.5rem">{{ log.join('\n') || '— no mutations yet —' }}</pre>
  <p class="pg-muted">
    Switching the dropdown rebuilds the observer with the new init shape, live — no remount. Note
    that the class toggle also rewrites <code>style</code>, so <code>attr:*</code> reports both.
  </p>
</template>

<style scoped>
.target {
  padding: 0.9rem;
  border: 2px dashed #b9c1d4;
  border-radius: 8px;
  font-family: var(--mono);
  font-size: 0.82rem;
  max-width: 30rem;
}
.target.light {
  background: #fff;
  color: #1c2130;
}
.target.dark {
  background: #1c2130;
  color: #e6e9f0;
}
</style>
