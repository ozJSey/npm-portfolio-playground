<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const width = ref(480)
const gap = ref(12)
const hidden = ref(0)
const outer = useTemplateRef<HTMLElement>('outer')

const tags = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']

function onUpdate(e: Event) {
  hidden.value = (e as CustomEvent<FitChildrenEventDetail>).detail.hiddenChildrenCount
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <label class="pg-label">
      outer width
      <input v-model.number="width" type="range" min="200" max="720" />
      {{ width }}px
    </label>
    <label class="pg-label">
      gap option
      <input v-model.number="gap" type="range" min="0" max="40" />
      {{ gap }}px
    </label>
  </div>

  <!-- The width-restricting container is an ANCESTOR, not the directive host.
       Available width is min(host, container), so .padded-host's border, padding
       and margin — and the "+N" badge beside the row — are all accounted for
       without anyone having to guess at them. -->
  <div ref="outer" class="outer" :style="{ width: `${width}px` }">
    <div class="padded-host">
      <div
        class="items"
        v-fit-children="{ widthRestrictingContainer: outer ?? undefined, gap, offsetNeededInPx: 56 }"
        @fit-children-updated="onUpdate"
      >
        <!-- Spacing here comes from margins, not CSS gap, so the computed gap
             is 0 and the `gap` option is what keeps the math honest. -->
        <span v-for="t in tags" :key="t" class="item">{{ t }}</span>
      </div>
      <span v-if="hidden" class="more">+{{ hidden }}</span>
    </div>
  </div>

  <p class="pg-muted">
    Spacing here comes from <code>margin-right</code>, not CSS <code>gap</code> — and it is
    measured from where the browser actually put each chip, so it is already counted. The
    <code>gap</code> option is a <em>floor</em> over that measurement, never a replacement: drop the
    slider to 0 and nothing breaks, because 0 cannot undercut the real 12px. Raise it above 12 and
    chips drop out earlier.
  </p>
</template>

<style scoped>
.outer {
  border: 2px solid #4f46e5;
  border-radius: 10px;
  padding: 0.3rem;
}
.padded-host {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px dashed #b9c1d4;
  border-radius: 6px;
  padding: 0.5rem 0.9rem;
  margin: 0.35rem;
}
/* Shrink-to-fit (no `flex: 1`), so the "+N" sits against the last chip rather
   than after an empty stretch. */
.items {
  display: block;
  white-space: nowrap;
  overflow: hidden;
}
.item {
  display: inline-block;
  margin-right: 12px;
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  border: 1px solid #c7d0ff;
  font-size: 0.8rem;
}
.more {
  font-size: 0.78rem;
  color: #b45309;
  flex-shrink: 0;
}
</style>
