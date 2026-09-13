<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from 'v-scroll-into-view'

type Mode = 'none' | 'focus' | 'prevent'

const mode = ref<Mode>('none')
const go = ref(false)
const readout = ref('—')
const paneRef = useTemplateRef<HTMLElement>('pane')
const targetRef = useTemplateRef<HTMLElement>('target')

function options(): VScrollIntoViewOptions {
  return {
    condition: go.value,
    container: paneRef.value ?? undefined,
    block: 'nearest',
    behavior: 'instant',
    offset: { top: 56 },
  }
}

function run(): void {
  const pane = paneRef.value
  const target = targetRef.value
  if (!pane || !target) return
  pane.scrollTop = 0
  go.value = false
  readout.value = 'scrolling…'
  requestAnimationFrame(() => {
    // The condition flip queues the directive's frame; the browser's own focus
    // scroll happens synchronously, before that frame runs.
    go.value = true
    if (mode.value === 'focus') target.focus()
    if (mode.value === 'prevent') target.focus({ preventScroll: true })
    window.setTimeout(() => {
      const top = Math.round(target.getBoundingClientRect().top - pane.getBoundingClientRect().top)
      readout.value = `target top in pane ${top} · focused ${document.activeElement === target}`
    }, 500)
  })
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      order
      <select v-model="mode" class="pg-select">
        <option value="none">directive only</option>
        <option value="focus">focus() then the directive</option>
        <option value="prevent">focus({ preventScroll: true }) then the directive</option>
      </select>
    </label>
    <button class="pg-btn pg-btn--primary" @click="run">Run</button>
    <span class="pg-kv readout">{{ readout }}</span>
  </div>

  <div ref="pane" class="pane pg-scroller">
    <header class="sticky">sticky header — offset.top: 56</header>
    <p v-for="i in 14" :key="i" class="filler">filler line {{ i }}</p>
    <button ref="target" class="target" type="button" v-scroll-into-view="options()">
      🎯 focusable target
    </button>
    <p v-for="i in 14" :key="`b${i}`" class="filler">filler line {{ i + 14 }}</p>
  </div>

  <p class="pg-muted">
    <code>focus()</code> makes the browser scroll the element into view <em>itself</em>, on its own
    rules, before the directive's frame runs. The directive then finds the target already inside the
    visible region and — correctly, for <code>block: 'nearest'</code> — does nothing, so the resting
    position is the browser's, not the one your <code>block</code> and <code>offset</code> asked
    for. The two disagree by tens of pixels here. <code>focus({ preventScroll: true })</code> takes
    the browser out of it and hands the decision back to the directive; the readout lands on the
    same pixel as “directive only”.
  </p>
</template>

<style scoped>
.pane {
  position: relative;
}
.sticky {
  position: sticky;
  top: 0;
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  background: #3730a3;
  color: #fff;
  font-size: 0.8rem;
  z-index: 2;
}
.filler {
  margin: 0;
  padding: 0.5rem 0.75rem;
  color: #97a0b4;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.target {
  display: block;
  width: calc(100% - 1.5rem);
  margin: 0 0.75rem;
  padding: 0.6rem;
  font: inherit;
  font-size: 0.85rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
  border: 1px solid #c7d0ff;
  border-radius: 6px;
}
</style>
