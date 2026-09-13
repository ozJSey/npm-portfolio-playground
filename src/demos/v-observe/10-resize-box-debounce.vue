<script setup lang="ts">
import { ref } from 'vue'
import type { ResizeBox, ResizeEvent } from 'v-observe'

const box = ref<ResizeBox>('border')
const dpr = Math.round(window.devicePixelRatio * 100) / 100
const reading = ref('—')
const raw = ref(0)
const debounced = ref(0)

function onSized(e: ResizeEvent) {
  if (e.mode !== 'tick') return
  raw.value++
  reading.value = `${Math.round(e.to.width)} × ${Math.round(e.to.height)}`
}

function onDebounced(e: ResizeEvent) {
  if (e.mode === 'tick') debounced.value++
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      box
      <select v-model="box" class="pg-select">
        <option>border</option>
        <option>content</option>
        <option>device-pixel</option>
      </select>
    </label>
    <span class="pg-muted">
      the padded box below has a 12px padding and a 4px border, so the three modes disagree by
      design (device-pixel also multiplies by dpr {{ dpr }})
    </span>
  </div>

  <div class="padded" v-observe="{ resize: { box, handler: onSized } }">
    {{ box }}: {{ reading }}
  </div>

  <div class="padded debounce" v-observe="{ resize: { debounce: 200, handler: onDebounced } }">
    debounce: 200ms
  </div>

  <p class="pg-kv" style="margin-top: 0.5rem">
    ticks on the top box: {{ raw }} · debounced handler calls on the bottom box: {{ debounced }}
  </p>
  <p class="pg-muted">
    Drag the bottom box in one continuous motion: the handler fires once at the trailing edge with
    the final dimensions instead of on every frame.
  </p>
</template>

<style scoped>
.padded {
  width: 280px;
  height: 90px;
  resize: both;
  overflow: auto;
  padding: 12px;
  border: 4px solid #4f46e5;
  border-radius: 8px;
  background: #f5f6ff;
  font-family: var(--mono);
  font-size: 0.82rem;
  color: #3730a3;
  margin-bottom: 0.6rem;
}
.debounce {
  border-color: #b45309;
  background: #fffbeb;
  color: #b45309;
}
</style>
