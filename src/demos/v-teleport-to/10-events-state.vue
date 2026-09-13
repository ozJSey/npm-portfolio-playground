<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { TeleportToEventDetail } from '@ozjsey/v-teleport-to'

const open = ref(true)
const log = ref<string[]>([])
const latest = ref('—')
// Two booleans, so this converges the same way `latest` does — see the
// footgun note below before rendering anything else from `onPositioned`.
const visibility = ref('—')
const trigger = useTemplateRef<HTMLElement>('trigger')

// Deliberately a plain variable, not a ref. `onPositioned` fires on every
// recalculation — including the one this component's own re-render triggers
// through the directive's `updated` hook. Rendering a value that changes on
// every call therefore feeds itself: render → recalc → callback → render.
// Only ever render values that CONVERGE (see `latest` below, which settles on
// a stable string and then stops triggering renders).
let ticks = 0

function push(line: string) {
  log.value.unshift(line)
  log.value.length = Math.min(log.value.length, 7)
}

const options = computed(() => ({
  to: trigger.value,
  enabled: open.value,
  placement: 'auto' as const,
  widthMultiplier: 1,
  maxHeight: 120,
  // Same payload as the DOM event — handy when subscribing is awkward.
  onPositioned: () => ticks++,
  // Only fires when the chosen side actually changes — so it converges, and
  // is safe to render.
  onPlacementChange: (prev: string | null, next: string) =>
    push(`placement ${prev ?? '(none)'} → ${next}  ·  after ${ticks} tick(s)`),
}))

function onPositioned(e: Event) {
  const d = (e as CustomEvent<TeleportToEventDetail>).detail
  // Settled geometry writes an identical string, and a ref assigned its own
  // value triggers nothing — so the render/recalc cycle closes by itself.
  latest.value = `${d.placement} · ${Math.round(d.availableSpace)}px free · maxHeight ${Math.round(d.maxHeight)}`
  // `referenceHidden` is the measurement (reported whether or not the library
  // is allowed to act on it); `hidden` is what actually happened to the host.
  visibility.value = `referenceHidden ${d.referenceHidden} · hidden ${d.hidden}`
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="open" type="checkbox" /> enabled</label>
    <span class="pg-chip">last positioned: {{ latest }}</span>
    <span class="pg-chip">{{ visibility }}</span>
    <span class="pg-muted">scroll the page so the placement flips</span>
  </div>

  <div class="rail">
    <button ref="trigger" class="pg-btn pg-btn--primary">reference</button>
  </div>

  <div v-teleport-to="options" class="pop" @teleport-positioned="onPositioned">
    <strong>animated host</strong>
    <span class="pg-muted">data-teleport-state = open / closed</span>
  </div>

  <pre class="pg-log" style="margin-top: 0.6rem">{{ log.join('\n') || '— no placement changes yet —' }}</pre>
  <p class="pg-muted">
    Untick <code>enabled</code>: the state attribute flips to <code>closed</code>, the CSS
    transition runs, <code>data-teleport-placement</code> is cleared, and the placement cache resets
    so the next open reports <code>prev: null</code> again. A throwing callback is caught and logged
    rather than breaking the RAF loop.
  </p>
  <p class="pg-muted">
    Scroll the reference right off the top of the window: both flags go
    <code>true</code>, the host takes <code>visibility: hidden</code> and picks up
    <code>data-teleport-hidden</code>. That is <code>hideWhenReferenceHidden</code>, and it is on
    unless you turn it off. The pair is reported separately on purpose —
    <code>referenceHidden</code> is the measurement and is emitted even when you have opted out, so
    a consumer who would rather <em>unmount</em> the host than merely blank it can bind a
    <code>v-if</code> to it; <code>hidden</code> is what the library actually did, and is also
    <code>true</code> when <code>overflow: 'hide'</code> fired instead.
  </p>
  <p class="pg-muted">
    <strong>Footgun worth knowing:</strong> <code>onPositioned</code> fires on every recalculation,
    and a component re-render is itself a recalculation (Vue calls the directive's
    <code>updated</code> hook). So writing an ever-changing value from it into your template —
    a counter, a timestamp — re-renders, which recalculates, which fires it again: Vue bails out
    with “Maximum recursive updates exceeded”. Render only values that settle, like the placement
    and available space above; keep counters in a plain variable.
  </p>
</template>

<style scoped>
.rail {
  display: grid;
  place-items: center;
  padding: 2rem 0;
}
.pop {
  background: #1f2437;
  color: #fff;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  opacity: 0;
  transform: scale(0.94);
  transition: opacity 140ms ease, transform 140ms ease;
}
.pop[data-teleport-state='open'] {
  opacity: 1;
  transform: scale(1);
}
.pop .pg-muted {
  color: #98a1b8;
}
</style>
