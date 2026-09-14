<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from '@ozjsey/v-scroll-into-view'

const withContainer = ref(true)
const shown = ref(false)
const go = ref(false)
const readout = ref('—')
const paneRef = useTemplateRef<HTMLElement>('pane')

const START = 300

/**
 * The whole binding, not just the container, because "no container" is spelled
 * by leaving the KEY OUT — not by setting it to `undefined`. Both reach the
 * native path; only the second is indistinguishable from
 * `container: paneRef.value ?? undefined`, which is a template ref that has not
 * been assigned yet and is the trap card 03 is about. Since 1.3.1 the
 * directive warns about that spelling, so the demo uses the honest one.
 *
 * The getter form is deliberate too: `paneRef.value` read here would be `null`
 * on the first render.
 */
function options(): VScrollIntoViewOptions {
  const base: VScrollIntoViewOptions = { condition: go.value, block: 'start' }
  return withContainer.value ? { ...base, container: () => paneRef.value } : base
}

function report(): void {
  const pane = paneRef.value
  if (!pane) return
  readout.value = `pane scrollTop ${START} → ${Math.round(pane.scrollTop)}`
}

function jump(): void {
  const pane = paneRef.value
  if (!pane) return
  pane.scrollTop = START
  go.value = false
  readout.value = 'scrolling…'
  requestAnimationFrame(() => {
    go.value = true
    window.setTimeout(report, 700)
  })
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input v-model="withContainer" type="checkbox" />
      container
    </label>
    <label class="pg-label">
      <input v-model="shown" type="checkbox" />
      target rendered (v-show)
    </label>
    <button class="pg-btn pg-btn--primary" @click="jump">Scroll to the target</button>
    <span class="pg-kv readout">{{ readout }}</span>
  </div>

  <div ref="pane" class="pg-scroller">
    <p v-for="i in 18" :key="i" class="filler">filler line {{ i }}</p>
    <p
      v-show="shown"
      class="target"
      v-scroll-into-view="options()"
    >
      🎯 the target
    </p>
    <p v-for="i in 18" :key="`b${i}`" class="filler">filler line {{ i + 18 }}</p>
  </div>

  <p class="pg-muted">
    With the target un-rendered, the scroll is a no-op on <em>both</em> paths — the pane stays at
    300. A <code>display: none</code> element has no layout box, so it has no position to scroll to;
    native <code>scrollIntoView</code> returns early for the same reason. Tick “target rendered” and
    the same button aligns it to the top of the pane.
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
}
</style>
