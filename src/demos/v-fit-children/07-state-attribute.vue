<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const width = ref(520)
const state = ref('—')
const host = useTemplateRef<HTMLElement>('host')

const tags = ['Vue', 'TypeScript', 'Vite', 'Vitest', 'Nuxt', 'Pinia', 'ESLint', 'Prettier', 'Rollup']

function onUpdate() {
  state.value = host.value?.getAttribute('data-v-fit-state') ?? '—'
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <label class="pg-label">
      container width
      <input v-model.number="width" type="range" min="140" max="720" />
      {{ width }}px
    </label>
  </div>

  <div class="frame" :style="{ width: `${width}px` }">
    <div ref="host" class="chips" v-fit-children @fit-children-updated="onUpdate">
      <span v-for="tag in tags" :key="tag" class="pg-chip">{{ tag }}</span>
    </div>
  </div>

  <p class="pg-muted">
    data-v-fit-state: <code>{{ state }}</code
    >. The border color flips through CSS alone —
    <code>[data-v-fit-state="overflowing"]</code> — no event handler needed; the one here
    only echoes the live attribute value.
  </p>
</template>

<style scoped>
.frame {
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
  overflow: hidden;
  min-width: 140px;
}
/* The demonstrated feature: state-driven styling with no JavaScript. */
.chips {
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
  border: 2px solid #86efac;
  border-radius: 6px;
  padding: 0.3rem;
  transition: border-color 0.15s ease;
}
.chips[data-v-fit-state='overflowing'] {
  border-color: #f59e0b;
}
</style>
