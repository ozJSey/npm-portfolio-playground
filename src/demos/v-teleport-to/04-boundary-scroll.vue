<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { TeleportToEventDetail } from '@ozjsey/v-teleport-to'

const useBoundary = ref(true)
// Defaults to 'window': the default listener is capture-phase on `window`, so
// it already catches the pane's scroll AND keeps the host anchored when the
// page scrolls. Switch to 'pane' to see what narrowing costs.
const scrollForm = ref<'pane' | 'window' | 'array'>('window')
const hideWhenGone = ref(true)
const info = ref('—')

const pane = useTemplateRef<HTMLElement>('pane')
const trigger = useTemplateRef<HTMLElement>('trigger')

// 'array' exercises the HTMLElement[] form — several independent scrolling
// ancestors, each getting its own listener. An empty array means no scroll
// listener at all (the consumer enumerated the targets; none connected).
const scrollContainer = computed(() => {
  if (scrollForm.value === 'window') return 'window' as const
  if (scrollForm.value === 'array') return pane.value ? [pane.value] : []
  return pane.value ?? ('window' as const)
})

const options = computed(() => ({
  to: trigger.value,
  boundary: useBoundary.value ? (pane.value ?? 'viewport') : ('viewport' as const),
  scrollContainer: scrollContainer.value,
  hideWhenReferenceHidden: hideWhenGone.value,
  maxHeight: 200,
  widthMultiplier: 1,
}))

function onPositioned(e: Event) {
  const d = (e as CustomEvent<TeleportToEventDetail>).detail
  const flags = [d.fit, d.collapsed ? 'collapsed' : null, d.hidden ? 'hidden' : null]
    .filter(Boolean)
    .join(' · ')
  info.value = `${d.placement} · ${Math.round(d.availableSpace)}px available · maxHeight ${Math.round(d.maxHeight)} · ${flags}`
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="useBoundary" type="checkbox" /> boundary = pane</label>
    <label class="pg-label">
      scrollContainer
      <select v-model="scrollForm" class="pg-select">
        <option value="pane">pane (HTMLElement)</option>
        <option value="array">[pane] (HTMLElement[])</option>
        <option value="window">'window' (default)</option>
      </select>
    </label>
    <label class="pg-label">
      <input v-model="hideWhenGone" type="checkbox" /> hideWhenReferenceHidden
      <span class="pg-muted">(library default: on)</span>
    </label>
  </div>

  <div ref="pane" class="pane">
    <p v-for="i in 5" :key="i" class="filler">pane line {{ i }}</p>
    <button ref="trigger" class="pg-btn pg-btn--primary">reference inside the pane</button>
    <p v-for="i in 10" :key="`b${i}`" class="filler">pane line {{ i + 5 }}</p>
  </div>

  <div v-teleport-to="options" class="pop" @teleport-positioned="onPositioned">
    <strong>bounded popover</strong>
    <span class="pg-muted">{{ info }}</span>
  </div>

  <p class="pg-muted">
    With <code>boundary</code> set, available-space math and the auto-placement decision are clamped
    to the pane instead of the viewport. Scroll the reference out of the pane and the host hides —
    <code>hideWhenReferenceHidden</code> is on unless you turn it off, and the region it tests is the
    <em>intersection</em> of the pane and the viewport, so scrolling the whole pane off screen hides
    the host too.
  </p>
  <p class="pg-muted">
    <strong>What <code>scrollContainer</code> actually trades.</strong> The default listener is
    capture-phase on <code>window</code>, and scroll events propagate down the capture path — so the
    default already sees the pane scrolling. Naming a container <em>replaces</em> that listener
    rather than adding to it: pick <code>pane</code> above, then scroll the whole page, and the host
    stays where the viewport last put it because no page-scroll listener is left. Narrow only when
    the reference cannot move with the document. <strong>One caveat, and it is why the checkbox
    above matters:</strong> while <code>hideWhenReferenceHidden</code> is on, <code>window</code> is
    unioned back in as a floor — hiding cannot work without it — so you have to turn the checkbox
    off before the narrowing trade-off is observable at all.
  </p>
</template>

<style scoped>
.pane {
  height: 200px;
  overflow: auto;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  padding: 0.5rem;
  background: #fbfcfe;
}
.filler {
  margin: 0;
  padding: 0.35rem 0.2rem;
  font-size: 0.82rem;
  color: #97a0b4;
}
.pop {
  background: #fff;
  border: 1px solid #dfe3ec;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 20, 35, 0.18);
  padding: 0.6rem 0.8rem;
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
</style>
