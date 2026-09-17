<script setup lang="ts">
import { ref } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

// The slider writes an inline width on the DIRECTIVE ELEMENT itself. The frame
// around it is a fixed 640px and the host has no siblings, so the host's own box
// is the only thing that moves — which is a sidebar opening, a splitter being
// dragged, or a class toggling `max-width`.
const hostWidth = ref(600)

const tags = ['Vue', 'TypeScript', 'Vite', 'Vitest', 'Nuxt', 'Pinia', 'ESLint', 'Prettier', 'Rollup']

const hiddenCount = ref(0)
const overflowing = ref(false)

function onUpdate(e: Event) {
  const detail = (e as CustomEvent<FitChildrenEventDetail>).detail
  hiddenCount.value = detail.hiddenChildrenCount
  overflowing.value = detail.isOverflowing
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <label class="pg-label">
      host width
      <input v-model.number="hostWidth" type="range" min="140" max="600" />
      {{ hostWidth }}px
    </label>
    <button class="pg-btn" @click="hostWidth = 200">Narrow the host</button>
    <button class="pg-btn pg-btn--primary" @click="hostWidth = 600">Put it back</button>
  </div>

  <div class="frame">
    <!-- A BARE binding: no options at all, which is the default path. -->
    <div
      class="chips"
      :style="{ width: `${hostWidth}px` }"
      v-fit-children
      @fit-children-updated="onUpdate"
    >
      <span v-for="tag in tags" :key="tag" class="pg-chip">{{ tag }}</span>
    </div>
  </div>

  <p class="pg-muted" style="margin-top: 0.6rem">
    <span v-if="hiddenCount" class="more">+{{ hiddenCount }} more</span>
    <span v-else>nothing hidden</span>
    · data-v-fit-state: <code>{{ overflowing ? 'overflowing' : 'fits' }}</code> · hidden:
    <code>{{ hiddenCount }}</code>
  </p>

  <p class="pg-muted">
    Narrow the host, then put it back. Every chip has to return — the host is exactly as wide as it
    was when they all fitted. Through <strong>2.3.0</strong> they did not: the run that was on
    screen when the host shrank was filed as "proven too big at 600px", and the host was the one
    trigger that never retracted such a record, so the collapsed run was re-applied at the original
    width forever — with <code>data-v-fit-state</code> reading <code>fits</code> over a row that was
    hiding seven of its nine chips. Repeated drags froze up to four widths at once. The record exists for a real feedback
    loop (a "+N" badge whose label changes its own width — card 1), so 2.3.1 narrows it rather than
    removing it: a host that reports MORE room than the last measurement gave it, with no other
    observed box moving in the same delivery, is the world, not our own output coming back.
  </p>
</template>

<style scoped>
/* Fixed, so the host's parent never resizes and no parent entry is ever
   delivered — the host's own box is the only trigger this card produces. */
.frame {
  width: 640px;
  max-width: 100%;
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
  overflow: hidden;
}
.chips {
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
  border: 2px solid #86efac;
  border-radius: 6px;
  padding: 0.3rem;
  max-width: 100%;
}
.chips[data-v-fit-state='overflowing'] {
  border-color: #f59e0b;
}
.more {
  font-size: 0.78rem;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}
</style>
