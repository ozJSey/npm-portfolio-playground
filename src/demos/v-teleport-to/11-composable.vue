<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useTeleportTo } from '@ozjsey/v-teleport-to'

// `open` drives TWO things in the same reactive tick: the `enabled` option, and
// a `v-if` on the popover's rows. That pairing is the README's own advice for
// unmounting expensive contents, it is the ordinary dropdown shape — and until
// 1.1.1 it was this composable's P0 (TT-22 finding 1). A recalculation that runs
// before Vue has patched the rows in measures an empty box, decides the cramped
// side "fits", and writes a `max-height` sliver that never self-corrects.
// Nothing on the host says so: `fit` reads `fits`, `truncated` reads `false`.
const open = ref(true)
// The composable's second argument. Pass it and the fit test has something to
// measure, so `flip` works here exactly as it does on the directive; leave it
// out and there is no honest fit answer, so the requested side stands and the
// host is clamped into whatever room it has. The toggle exists so the card can
// show both — the degradation is documented, and a card that only ever showed
// the good half would be hiding it.
const passHost = ref(true)
// The OTHER face of the same defect, and the reason this card needed a second
// control. Nothing here is an option: the spacer's height is read by the
// template and by nothing else, so the options getter below never touches it
// and the composable's effect has no dependency that changes. The reference
// simply MOVES. The directive sees that because Vue calls its `updated` hook on
// every re-render; the composable has to hook the same step or the popover
// stays where it was, indefinitely.
const push = ref(0)

const trigger = useTemplateRef<HTMLElement>('trigger')
const hostEl = useTemplateRef<HTMLElement>('hostEl')

const ROWS = [
  'Profile',
  'Notifications',
  'Appearance',
  'Keyboard shortcuts',
  'Integrations',
  'Billing',
  'Privacy',
  'Sign out',
]

const {
  styles,
  placement,
  state,
  availableSpace,
  oppositeSpace,
  fit,
  maxHeight,
  contentHeight,
  collapsed,
  truncated,
  update,
} = useTeleportTo(
  () => ({
    to: trigger.value!,
    enabled: open.value,
    placement: 'bottom' as const,
    // Wide enough that the eight rows below do not wrap, so the popover's
    // natural height is a clean multiple of its row height and a clamped
    // popover is unmistakably a clamped one.
    widthMultiplier: 2.5,
    maxHeight: 240,
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
// The side coordinate the composable last wrote. It is the only thing on the
// card that moves when the reference moves and no option changes, so it is what
// makes the second face visible without a devtools panel.
const anchor = computed(() => styles.value.top || styles.value.bottom || '—')
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="open" type="checkbox" /> open</label>
    <label class="pg-label">
      <input v-model="passHost" type="checkbox" /> pass the host to useTeleportTo
    </label>
    <label class="pg-label">
      push the reference down
      <input v-model.number="push" type="range" min="0" max="240" step="10" />
      {{ push }}px
    </label>
  </div>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <span class="pg-chip is-chosen">{{ verdict }}</span>
    <span class="pg-chip">content {{ contentHeight === null ? '—' : Math.round(contentHeight) }}px</span>
    <span class="pg-chip">{{ placement ?? '—' }} has {{ Math.round(availableSpace) }}px</span>
    <span class="pg-chip">other side has {{ Math.round(oppositeSpace) }}px</span>
    <span class="pg-chip">anchored at {{ anchor }}</span>
    <span v-if="truncated" class="pg-chip is-cut">truncated</span>
  </div>

  <div class="transformed">
    <span class="pg-muted">ancestor with transform: translateZ(0)</span>
    <!-- Not an option, not a dependency of the composable's effect — just a box
         that grows and shoves the reference down the page. -->
    <div class="pusher" :style="{ height: `${push}px` }" />
    <div class="pg-row">
      <button ref="trigger" class="pg-btn pg-btn--primary" @click="open = !open">
        {{ open ? 'Close' : 'Open' }} popover
      </button>
      <button class="pg-btn" @click="update()">force update()</button>
    </div>
  </div>

  <Teleport to="body">
    <div
      ref="hostEl"
      :style="styles"
      :data-teleport-state="state"
      :data-teleport-fit="fit"
      class="composable-pop"
    >
      <!-- `v-if`, not `v-show`: the rows are genuinely unmounted while closed,
           so the host's height changes in the SAME reactive tick as `enabled`.
           That is the trigger condition, and this card exists to hold it. -->
      <template v-if="open">
        <strong>rendered at &lt;body&gt;</strong>
        <span v-for="row in ROWS" :key="row">{{ row }}</span>
      </template>
    </div>
  </Teleport>

  <p class="pg-muted">
    Scroll the page (or drag <strong>push the reference down</strong>) until the button sits near
    the bottom of the window, then tick <strong>open</strong>. The eight rows are ~240px tall and
    there is less than that below the button, so the popover has to open <em>upwards</em>:
    <code>top</code> / <code>flipped</code> / <code>maxHeight 240</code>. Before 1.1.1 it reported
    <code>bottom</code> / <code>fits</code> / <code>maxHeight 110</code>-ish and rendered three
    rows of eight, because <code>enabled</code> and the <code>v-if</code> on those rows flip in one
    reactive tick and the measurement was taken before Vue had patched the rows in. Every chip
    above said it was fine. One press of <code>force update()</code> flipped it — which is what
    made it a measurement-timing bug rather than a geometry one.
  </p>
  <p class="pg-muted">
    Now drag <strong>push the reference down</strong> with the popover open. The slider changes no
    option — the options getter never reads it — so nothing the composable's effect depends on has
    changed; only the component re-rendered and the button's box moved. The
    <code>anchored at</code> chip has to follow it. It did not before 1.1.1: the popover stayed
    where it was until something else happened to recalculate. The directive never had this,
    because a component re-render <em>is</em> its <code>updated</code> hook, and that is now the
    composable's third trigger too.
  </p>
  <p class="pg-muted">
    Put the directive on a host inside that red box instead and the popover would be positioned
    relative to the box, not the viewport, and clipped by it — a CSS containing-block rule, not a
    library bug. The composable returns the same numbers; you decide where the element lives.
  </p>
  <p class="pg-muted">
    Untick <strong>pass the host</strong> and the composable has nothing to measure: it reports
    <code>unmeasured</code>, keeps <code>placement: 'bottom'</code>, and the popover is clamped
    into the sliver of room that is left. <code>strategy: 'absolute'</code> needs the host for the
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
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}
.pusher {
  align-self: stretch;
  border-left: 3px solid #fca5a5;
  /* No `transition` on purpose. An animated height moves the reference over
     the following 120ms — i.e. after the render that changed it — which no
     re-render reports and which is what `autoUpdate` exists for. That is a
     different demo (card 08); here the slider has to move the reference in the
     same patch it changes, or the card is measuring the transition instead of
     the composable. */
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
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
  overflow: hidden;
}
.composable-pop[data-teleport-state='open'] {
  opacity: 1;
  pointer-events: auto;
}
</style>
