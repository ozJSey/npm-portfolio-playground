<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from '@ozjsey/v-scroll-into-view'

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

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

/**
 * Order is the whole point of this card, so it is spelled out rather than
 * implied.
 *
 * The first version flipped the condition and called `focus()` inside the same
 * `requestAnimationFrame` callback. That reads like "focus first", but it is
 * not: the directive's scroll had already been queued by the flip, and it ran
 * last and won. All three modes rested on the same pixel — 157 — so the card
 * showed a difference of zero while the prose underneath it claimed tens of
 * pixels. Measured on the published 1.3.3 artifact, on the live site.
 *
 * The browser's focus scroll has to land *before* the directive's frame, so
 * `focus()` now happens on its own frame and the condition flips on the next
 * one. Then the numbers separate, and they separate for the documented reason:
 * the directive finds the target already visible and `block: 'nearest'`
 * correctly leaves it alone, so the resting position is whatever the browser
 * chose.
 */
async function run(): Promise<void> {
  const pane = paneRef.value
  const target = targetRef.value
  if (!pane || !target) return

  const offsetInPane = (): number =>
    Math.round(target.getBoundingClientRect().top - pane.getBoundingClientRect().top)

  go.value = false
  pane.scrollTop = 0
  target.blur()
  readout.value = 'scrolling…'
  await frame()

  // Whatever the browser does on focus, it does here — a whole frame before
  // the directive is asked for an opinion.
  if (mode.value === 'focus') target.focus()
  if (mode.value === 'prevent') target.focus({ preventScroll: true })
  await frame()
  const afterFocus = offsetInPane()

  go.value = true
  await frame()
  await frame()
  const resting = offsetInPane()

  const moved = mode.value === 'none' ? 'no focus() call' : `focus() landed it at ${afterFocus}`
  readout.value = `${moved} · resting ${resting} · focused ${document.activeElement === target}`
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
