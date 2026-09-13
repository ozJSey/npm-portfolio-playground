<script setup lang="ts">
import { ref } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const items = ref(['one', 'two', 'three'])
const width = ref(420)
const detail = ref<FitChildrenEventDetail | null>(null)
let n = 3

function add() {
  items.value.push(`item ${++n}`)
}

function onUpdate(e: Event) {
  detail.value = (e as CustomEvent<FitChildrenEventDetail>).detail
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <button class="pg-btn pg-btn--primary" @click="add">Add child</button>
    <button class="pg-btn" :disabled="!items.length" @click="items.pop()">Remove child</button>
    <button class="pg-btn" @click="items[0] = items[0] + ' (longer now)'">Grow the first child</button>
    <label class="pg-label">
      width
      <input v-model.number="width" type="range" min="160" max="700" />
    </label>
  </div>

  <div class="frame" :style="{ width: `${width}px` }">
    <div class="items" v-fit-children="{ data: items, offsetNeededInPx: 44 }" @fit-children-updated="onUpdate">
      <span v-for="item in items" :key="item" class="pg-chip">{{ item }}</span>
    </div>
  </div>

  <pre class="pg-log" style="margin-top: 0.6rem">{{
    detail
      ? [
          `isOverflowing:        ${detail.isOverflowing}`,
          `hiddenChildrenCount:  ${detail.hiddenChildrenCount}`,
          `hiddenIndices:        [${detail.hiddenIndices.join(', ')}]`,
          `hiddenData:           [${(detail.hiddenData ?? []).join(', ')}]`,
        ].join('\n')
      : '— waiting for the first event —'
  }}</pre>

  <p class="pg-muted">
    Additions and removals come from Vue itself — the directive's <code>updated</code> hook, which
    the renderer queues after the patch and before the browser paints. A <code>MutationObserver</code>
    stays on as the net for children injected outside Vue. <strong>Grow the first child</strong>
    changes a child's <em>content</em>, which is neither of those; a per-child
    <code>ResizeObserver</code> is what catches it. No <code>requestAnimationFrame</code> anywhere,
    so nothing is ever painted mid-recalculation.
  </p>
</template>

<style scoped>
.frame {
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
}
.items {
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
}
</style>
