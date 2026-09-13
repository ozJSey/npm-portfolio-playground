<script setup lang="ts">
import { ref } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const width = ref(420)
const hiddenCount = ref(0)
const hiddenNames = ref<string[]>([])

const names = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Donald']

function onUpdate(e: Event) {
  const detail = (e as CustomEvent<FitChildrenEventDetail<string>>).detail
  hiddenCount.value = detail.hiddenChildrenCount
  hiddenNames.value = detail.hiddenData ?? []
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <label class="pg-label">
      container width
      <input v-model.number="width" type="range" min="120" max="640" />
      {{ width }}px
    </label>
  </div>

  <div class="frame" :style="{ width: `${width}px` }">
    <div
      class="chips"
      v-fit-children="{ data: names, offsetNeededInPx: 0 }"
      @fit-children-updated="onUpdate"
    >
      <template v-for="(name, i) in names" :key="name">
        <span v-if="i > 0" class="sep" data-v-fit-decorative>·</span>
        <span class="pg-chip">{{ name }}</span>
      </template>
    </div>
    <span v-if="hiddenNames.length" class="more">+{{ hiddenNames.length }} more</span>
  </div>

  <p class="pg-muted">
    hiddenChildrenCount: <code>{{ hiddenCount }}</code> · hiddenData:
    <code>[{{ hiddenNames.join(', ') }}]</code>. The separators carry
    <code>data-v-fit-decorative</code>, so they consume no data index and the mapping stays 1:1
    with the names. The badge counts <code>hiddenData.length</code> —
    <code>hiddenChildrenCount</code> also includes hidden separators.
  </p>
</template>

<style scoped>
.frame {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
  overflow: hidden;
  min-width: 120px;
}
.chips {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  overflow: hidden;
}
.sep {
  color: #94a3b8;
  font-weight: 700;
}
.more {
  flex-shrink: 0;
  font-size: 0.78rem;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}
</style>
