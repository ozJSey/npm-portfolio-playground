<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useTeleportTo } from 'v-teleport-to'

const open = ref(true)
// The composable's second argument. Pass it and the fit test has something to
// measure, so `flip` works here exactly as it does on the directive; leave it
// out and there is no honest fit answer, so the requested side stands and the
// host is clamped into whatever room it has. The toggle exists so the card can
// show both — the degradation is documented, and a card that only ever showed
// the good half would be hiding it.
const passHost = ref(true)
const trigger = useTemplateRef<HTMLElement>('trigger')
const hostEl = useTemplateRef<HTMLElement>('hostEl')

// The reference lives inside an ancestor with `transform`, which makes that
// ancestor the containing block for any position: fixed descendant. Rendering
// the host through <Teleport to="body"> and binding the composable's styles is
// the documented way out.
const { styles, placement, state, availableSpace, fit, maxHeight, collapsed, update } =
  useTeleportTo(
    () => ({
      to: trigger.value!,
      enabled: open.value,
      placement: 'bottom' as const,
      // Wide enough that the five lines below do not wrap, so the popover's
      // natural height (~120px) sits comfortably under `maxHeight` and a
      // clamped popover is unmistakably a clamped one.
      widthMultiplier: 2.5,
      maxHeight: 150,
    }),
    // `useTemplateRef` is a ref, and `toValue` unwraps it — but only when the
    // getter is re-run, which is why the composable collects it as a dependency
    // of its own effect rather than reading it once.
    () => (passHost.value ? hostEl.value : null),
  )

const verdict = computed(
  () =>
    `${placement.value ?? '—'} · fit ${fit.value} · maxHeight ${Math.round(maxHeight.value)}px` +
    `${collapsed.value ? ' · COLLAPSED' : ''}`,
)
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input v-model="passHost" type="checkbox" /> pass the host to useTeleportTo
    </label>
    <span class="pg-chip">{{ verdict }}</span>
  </div>

  <div class="transformed">
    <span class="pg-muted">ancestor with transform: translateZ(0)</span>
    <button ref="trigger" class="pg-btn pg-btn--primary" @click="open = !open">
      {{ open ? 'Close' : 'Open' }} popover
    </button>
    <button class="pg-btn" @click="update()">force update()</button>
  </div>

  <Teleport to="body">
    <div
      ref="hostEl"
      v-show="open"
      :style="styles"
      :data-teleport-state="state"
      :data-teleport-fit="fit"
      class="composable-pop"
    >
      <strong>rendered at &lt;body&gt;</strong>
      <span>placement: {{ placement }} · {{ Math.round(availableSpace) }}px free</span>
      <span>line three</span>
      <span>line four</span>
      <span>line five</span>
    </div>
  </Teleport>

  <p class="pg-muted">
    Put the directive on a host inside that red box instead and the popover would be positioned
    relative to the box, not the viewport, and clipped by it — a CSS containing-block rule, not a
    library bug. The composable returns the same numbers; you decide where the element lives.
  </p>
  <p class="pg-muted">
    Scroll the page until the button is near the bottom edge and watch the chip. With the host
    passed, the fit test runs and the popover moves above the trigger
    (<code>fit: flipped</code>). Untick the box and the composable has nothing to measure: it
    reports <code>unmeasured</code>, keeps <code>placement: 'bottom'</code>, and the popover is
    clamped into the sliver of room that is left — the same failure the directive had on
    <em>every</em> binding before 3.0.0. <code>strategy: 'absolute'</code> needs the host for the
    same reason (card 12).
  </p>
</template>

<style scoped>
.transformed {
  transform: translateZ(0);
  border: 2px dashed #dc2626;
  border-radius: 8px;
  padding: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
</style>

<style>
/* Unscoped: the host is teleported out of this component's subtree, so a
   scoped rule would not match it — which makes the class name load-bearing.
   It used to be a bare `.pop`, and `.pop` is what cards 01/03/05/06/09/12 call
   their hosts, so this block silently forced `flex-direction`, `opacity: 0`, a
   transition and an `overflow` onto all of them (PG-12). Prefixed instead. */
.composable-pop {
  background: #1f2437;
  color: #fff;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  opacity: 0;
  transition: opacity 140ms ease;
  overflow: hidden;
}
.composable-pop[data-teleport-state='open'] {
  opacity: 1;
}
</style>
