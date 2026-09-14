<script setup lang="ts">
import { ref } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const width = ref(520)
const hiddenCount = ref(0)
const overflowing = ref(false)

const tags = ['Vue', 'TypeScript', 'Vite', 'Vitest', 'Nuxt', 'Pinia', 'ESLint', 'Prettier', 'Rollup']

function onUpdate(e: Event) {
  const detail = (e as CustomEvent<FitChildrenEventDetail>).detail
  hiddenCount.value = detail.hiddenChildrenCount
  overflowing.value = detail.isOverflowing
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

  <!-- The badge is a SIBLING of the directive element, so nothing is reserved
       inside it: offsetNeededInPx stays 0 and the flex row places the badge.
       The host is shrink-to-fit (no `flex: 1`), so it narrows to the run that
       survived and the badge sits directly after the last chip. -->
  <div class="frame" :style="{ width: `${width}px` }">
    <div class="chips" v-fit-children="{ offsetNeededInPx: 0 }" @fit-children-updated="onUpdate">
      <span v-for="tag in tags" :key="tag" class="pg-chip">{{ tag }}</span>
    </div>
    <span v-if="hiddenCount" class="more">+{{ hiddenCount }} more</span>
  </div>

  <p class="pg-muted">
    isOverflowing: <code>{{ overflowing }}</code> · hidden: <code>{{ hiddenCount }}</code
    >. A shrink-to-fit host feeds its own width back into the measurement — hide a chip and the host
    reports a smaller box a moment later. Every pass re-measures with every child shown first, so
    what it reads is the real budget rather than the previous decision echoing back; that is what
    stops the feedback becoming a collapse. Compare demo 5, where the host takes the whole row and
    the badge is pinned right instead.
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
  min-width: 140px;
}
/* No `flex: 1` — the host sizes to the chips that survived, so the badge
   follows them instead of sitting after an empty stretch. */
.chips {
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
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
