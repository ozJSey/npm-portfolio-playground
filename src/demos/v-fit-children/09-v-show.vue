<script setup lang="ts">
import { ref } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const width = ref(360)
const showDrafts = ref(true)
const hiddenCount = ref(0)

const labels = ['Inbox', 'Drafts', 'Sent', 'Spam', 'Trash', 'Archive']

function onUpdate(e: Event) {
  hiddenCount.value = (e as CustomEvent<FitChildrenEventDetail>).detail.hiddenChildrenCount
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <label class="pg-label">
      container width
      <input v-model.number="width" type="range" min="120" max="620" />
      {{ width }}px
    </label>
    <label class="pg-label">
      <input v-model="showDrafts" type="checkbox" />
      show the Drafts chip (v-show)
    </label>
  </div>

  <div class="frame" :style="{ width: `${width}px` }">
    <div class="chips" v-fit-children="{ offsetNeededInPx: 0 }" @fit-children-updated="onUpdate">
      <span
        v-for="label in labels"
        :key="label"
        v-show="label !== 'Drafts' || showDrafts"
        class="pg-chip"
      >
        {{ label }}
      </span>
    </div>
    <span v-if="hiddenCount" class="more">+{{ hiddenCount }}</span>
  </div>

  <p class="pg-muted">
    hidden by the directive: <code>{{ hiddenCount }}</code>. Untick the box and the Drafts chip
    leaves via <code>v-show</code> — the directive does not fight it. It hides with the
    <code>data-v-fit-hidden</code> attribute and one injected rule, never with
    <code>style.display</code>, which <code>v-show</code>, Vue's style patcher and
    <code>&lt;Transition&gt;</code> all own between them. So "the consumer hid this" is an exact
    test rather than a guess: excluded from measurement, never counted, never force-shown.
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
