<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

const strategy = ref<'fixed' | 'absolute'>('absolute')
const pane = useTemplateRef<HTMLElement>('pane')
const trigger = useTemplateRef<HTMLElement>('trigger')

const options = computed(() => ({
  to: trigger.value,
  strategy: strategy.value,
  scrollContainer: pane.value ?? ('window' as const),
  placement: 'bottom' as const,
  widthMultiplier: 1,
  maxHeight: 90,
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      strategy
      <select v-model="strategy" class="pg-select">
        <option>fixed</option>
        <option>absolute</option>
      </select>
    </label>
    <span class="pg-muted">scroll inside the pane and compare the two</span>
  </div>

  <div ref="pane" class="pane">
    <div class="inner">
      <p v-for="i in 4" :key="i" class="filler">line {{ i }}</p>
      <button ref="trigger" class="pg-btn pg-btn--primary">reference</button>
      <div v-teleport-to="options" class="pop">host</div>
      <p v-for="i in 10" :key="`b${i}`" class="filler">line {{ i + 4 }}</p>
    </div>
  </div>

  <p class="pg-muted">
    <code>'absolute'</code> positions against the host's <code>offsetParent</code> — here the
    pane itself — so the host lives <em>inside</em> the pane and scrolls with it, at the cost of
    being clipped by it. <code>'fixed'</code> (the default) keeps viewport coordinates and escapes
    the clip.
  </p>
  <p class="pg-muted">
    The coordinates resolve against the offsetParent's <strong>padding box, in its scrolled
    content coordinates</strong> — not against the border box <code>getBoundingClientRect()</code>
    returns. The pane's 2px border and its own <code>scrollTop</code> are both terms in that
    origin; scroll the pane and the popover stays welded to its trigger.
  </p>
  <p class="pg-muted">
    The origin is the host's own <code>offsetParent</code>, so with
    <code>useTeleportTo</code> you have to hand the composable the host —
    <code>useTeleportTo(options, hostRef)</code> — or there is no offsetParent to resolve against
    and it emits viewport coordinates that the browser then resolves against one anyway, landing
    the popover hundreds of pixels from its trigger. Card 11 has the toggle for both halves.
  </p>
</template>

<style scoped>
/* `position: relative` and `overflow: auto` on the SAME element, which is the
   shape the strategy is documented for ("the host lives inside a scrolling
   parent"). It also makes the card able to fail: the offsetParent now has a
   border AND a scroll offset of its own, and both are terms in the coordinate
   origin. With the wrapper positioned instead, the parent never scrolled
   relative to the reference and the card could not have shown a wrong
   origin at all. */
.pane {
  position: relative;
  height: 180px;
  overflow: auto;
  border: 2px solid #4f46e5;
  border-radius: 8px;
  background: #fbfcfe;
}
.inner {
  padding: 0.6rem;
}
.filler {
  margin: 0;
  padding: 0.3rem 0;
  font-size: 0.82rem;
  color: #97a0b4;
}
.pop {
  background: #1f2437;
  color: #fff;
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.3);
}
</style>
