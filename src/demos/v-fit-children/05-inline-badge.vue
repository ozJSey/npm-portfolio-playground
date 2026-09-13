<script setup lang="ts">
import { ref } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const width = ref(440)
const hidden = ref(0)

const labels = ['bug', 'help wanted', 'good first issue', 'documentation', 'enhancement', 'wontfix']

function onUpdate(e: Event) {
  hidden.value = (e as CustomEvent<FitChildrenEventDetail>).detail.hiddenChildrenCount
}
</script>

<template>
  <label class="pg-label" style="margin-bottom: 0.7rem">
    row width
    <input v-model.number="width" type="range" min="180" max="700" />
    {{ width }}px
  </label>

  <!-- The badge is a SIBLING of the directive element, so nothing needs to be
       reserved inside it: offsetNeededInPx goes to 0 and the flex row handles
       the layout.

       And NO widthRestrictingContainer. Naming the row looks right and is not:
       the row's content width includes the badge and the gap, which the host
       never receives, so every chip is measured against ~25px it does not have.
       The host is `flex: 1`, so its own width is decided by the row rather than
       by its children — measuring it is both correct and self-adjusting. -->
  <div class="row" :style="{ width: `${width}px` }">
    <div
      class="labels"
      v-fit-children="{ offsetNeededInPx: 0 }"
      @fit-children-updated="onUpdate"
    >
      <span v-for="l in labels" :key="l" class="pg-chip">{{ l }}</span>
    </div>
    <span v-if="hidden" class="count">+{{ hidden }}</span>
  </div>

  <p class="pg-muted">
    Compare with demo 1, where the badge sits below the row and <code>offsetNeededInPx</code>
    holds width back inside it anyway.
  </p>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
}
.labels {
  flex: 1;
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
}
.count {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: #b45309;
}
</style>
