<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

// No options at all — `v-scroll-into-view` with no value is `condition: true`,
// `block: 'nearest'`, and NO container, so the browser picks the scroller: the
// path every other card on this tab opts out of.
const seed = ref(0)
const readout = ref('idle')
const paneRef = useTemplateRef<HTMLElement>('pane')
const targetRef = useTemplateRef<HTMLElement>('target')

function report(): void {
  const pane = paneRef.value
  const target = targetRef.value
  if (!pane || !target) return
  const top = Math.round(target.getBoundingClientRect().top - pane.getBoundingClientRect().top)
  readout.value = `pane scrollTop ${Math.round(pane.scrollTop)} · target top in pane ${top}`
}

function toBottom(): void {
  const pane = paneRef.value
  if (!pane) return
  pane.scrollTop = pane.scrollHeight
  report()
}

/** Changing the key remounts the target, and the bare binding fires on mount. */
function remount(): void {
  readout.value = 'scrolling…'
  seed.value++
  window.setTimeout(report, 800)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn" @click="toBottom">1. Scroll the pane away</button>
    <button class="pg-btn pg-btn--primary" @click="remount">2. Remount the target</button>
    <span class="pg-kv readout">{{ readout }}</span>
  </div>

  <div ref="pane" class="pg-scroller">
    <p :key="seed" ref="target" class="target" v-scroll-into-view>🎯 &lt;p v-scroll-into-view&gt;</p>
    <p v-for="i in 20" :key="i" class="filler">filler line {{ i }}</p>
  </div>

  <p class="pg-muted">
    The target sits at the top of the pane, so on first mount it is already in view and
    <code>nearest</code> does nothing — a no-op, not a scroll to the top. Scroll the pane away and
    remount to watch the bare binding bring it back. Because there is no <code>container</code>,
    the browser walks the ancestor chain: it scrolls this pane, and it will scroll the page too if
    the pane is not fully visible. That is native behaviour, and it is exactly what
    <code>container</code> exists to opt out of.
  </p>
</template>

<style scoped>
.filler {
  margin: 0;
  padding: 0.5rem 0.75rem;
  color: #97a0b4;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.target {
  margin: 0;
  padding: 0.75rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
  font-family: var(--mono);
  font-size: 0.8rem;
}
</style>
