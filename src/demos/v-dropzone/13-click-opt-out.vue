<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { DropzoneApi, DropzoneApiRef } from 'v-dropzone'

const defaultDrop = ref<string[]>([])
const optOutDrop = ref<string[]>([])
const clicks = ref({ def: 0, opt: 0 })

// Built in the script, never inline in the template: a `ref` written inside a
// template expression is unwrapped to `undefined` before the directive sees it.
const api = ref<DropzoneApi>()
const apiRef: DropzoneApiRef = api

const defaultOptions = computed(() => ({
  // Nothing passed. Click-to-pick is on by default — this is the control.
  on: (files: File[]) => (defaultDrop.value = files.map((f) => f.name)),
}))

const optOutOptions = computed(() => ({
  clickToPick: false,
  // The api is what a `clickToPick: false` zone uses to open a picker on its
  // own terms — from a button you rendered, at a moment you chose.
  ref: apiRef,
  on: (files: File[]) => (optOutDrop.value = files.map((f) => f.name)),
}))

// ---- the readouts -------------------------------------------------------
// Everything below is read back out of the live DOM rather than asserted in
// prose, because the whole subject of this card is what is *absent*.
const defaultZone = shallowRef<HTMLElement | null>(null)
const optOutZone = shallowRef<HTMLElement | null>(null)

type Probe = { inputs: number; tabindex: string; ariaHidden: string; cursor: string }
const probes = ref<{ def: Probe; opt: Probe }>({
  def: { inputs: 0, tabindex: '—', ariaHidden: '—', cursor: '—' },
  opt: { inputs: 0, tabindex: '—', ariaHidden: '—', cursor: '—' },
})

function probe(el: HTMLElement | null): Probe {
  if (!el) return { inputs: 0, tabindex: '—', ariaHidden: '—', cursor: '—' }
  const input = el.querySelector('input[type=file]')
  return {
    inputs: el.querySelectorAll('input[type=file]').length,
    tabindex: input ? (input.getAttribute('tabindex') ?? 'none (a tab stop)') : '—',
    ariaHidden: input ? (input.getAttribute('aria-hidden') ?? 'no (announced)') : '—',
    cursor: getComputedStyle(el).cursor,
  }
}

/**
 * Re-read both zones, and write only if something actually changed.
 *
 * The guard is the whole reason this card loads. A `MutationObserver` on the
 * zone fires for every attribute the directive writes into it; writing a new
 * `probes` object from the callback re-renders this component, which runs the
 * directive's `updated` hook, which writes to the input again — a microtask
 * loop with no fixed point, which hung the tab on load and took every
 * interaction check on the whole v-dropzone tab with it. v-dropzone 0.1.0 was
 * fixed to make those writes idempotent; this end of the loop is cut too, so
 * that any *other* mutation inside the zone (a `data-dropzone` flip during a
 * drag, say) settles instead of spinning.
 */
function refresh() {
  const next = { def: probe(defaultZone.value), opt: probe(optOutZone.value) }
  if (JSON.stringify(next) === JSON.stringify(probes.value)) return
  probes.value = next
}

let observer: MutationObserver | null = null
onMounted(() => {
  refresh()
  observer = new MutationObserver(refresh)
  for (const el of [defaultZone.value, optOutZone.value]) {
    if (el) observer.observe(el, { childList: true, subtree: true, attributes: true })
  }
})
onBeforeUnmount(() => observer?.disconnect())

function openViaApi() {
  api.value?.open()
  // The input is created on demand by `open()`, so re-probe after it lands.
  refresh()
}
</script>

<template>
  <div class="pair">
    <div class="col">
      <p class="cap">default — <code>v-dropzone="onFiles"</code></p>
      <div ref="defaultZone" class="dz dz--click" v-dropzone="defaultOptions" @click="clicks.def++">
        <strong>Click me: a file dialog opens</strong>
        <span class="pg-muted">drop works · pointer cursor · focus ring · <kbd>Tab</kbd> lands here</span>
      </div>
      <ul class="probe">
        <li>picker inputs in the DOM: <b>{{ probes.def.inputs }}</b></li>
        <li>its <code>tabindex</code>: <b>{{ probes.def.tabindex }}</b></li>
        <li>its <code>aria-hidden</code>: <b>{{ probes.def.ariaHidden }}</b></li>
        <li>host <code>cursor</code>: <b>{{ probes.def.cursor }}</b></li>
        <li>host clicks seen: <b>{{ clicks.def }}</b></li>
        <li>last drop: <b>{{ defaultDrop.length ? defaultDrop.join(', ') : '—' }}</b></li>
      </ul>
    </div>

    <div class="col">
      <p class="cap">opted out — <code>{ clickToPick: false }</code></p>
      <div ref="optOutZone" class="dz" v-dropzone="optOutOptions" @click="clicks.opt++">
        <strong>Click me: nothing happens</strong>
        <span class="pg-muted">drop still works · no pointer · no ring · <kbd>Tab</kbd> skips it</span>
      </div>
      <ul class="probe">
        <li>picker inputs in the DOM: <b>{{ probes.opt.inputs }}</b></li>
        <li>its <code>tabindex</code>: <b>{{ probes.opt.tabindex }}</b></li>
        <li>its <code>aria-hidden</code>: <b>{{ probes.opt.ariaHidden }}</b></li>
        <li>host <code>cursor</code>: <b>{{ probes.opt.cursor }}</b></li>
        <li>host clicks seen: <b>{{ clicks.opt }}</b></li>
        <li>last drop: <b>{{ optOutDrop.length ? optOutDrop.join(', ') : '—' }}</b></li>
      </ul>
      <button class="pg-btn" @click="openViaApi">Browse… (api.open())</button>
    </div>
  </div>

  <p class="pg-muted">
    <strong>Both zones receive the same drop.</strong> Drag a file onto either one — the pipeline,
    the validation and the <code>data-dropzone</code> lifecycle are identical.
    <code>clickToPick</code> governs one thing only: whether a <em>click</em> on the host opens the
    native file dialog. It is on by default, so the left zone is a click target with nothing passed;
    the right zone passes the single option that withdraws it.
  </p>

  <p class="pg-muted">
    <strong>The opt-out is legible, not merely inert.</strong> The counters above are read out of
    the live DOM: the right zone has <em>no picker input at all</em> until something asks for one,
    so there is no tab stop hiding inside it, nothing for a screen reader to announce, and no
    <code>cursor: pointer</code> or focus ring in its stylesheet. That is the rule the whole tab
    follows — the pointer, the ring and the tab stop appear together or not at all. A zone that
    silently ignored clicks while still looking clickable would be worse than one that opens a
    dialog you did not want.
  </p>

  <p class="pg-muted">
    <strong>Why you would want it.</strong> The zone is also a layout container and its children
    own their own clicks. The zone is read-only output — a gallery, a preview list, an editor
    canvas — that should still accept a drop. The zone is drop-only by capability: demo 12 walks
    dropped <em>folders</em>, and a plain <code>&lt;input type="file"&gt;</code> cannot browse for
    one, so the default would answer &ldquo;drag a folder in&rdquo; with a file dialog. Or you want
    the browse affordance to be an explicit control instead of the whole surface —
    <button class="pg-btn pg-btn--inline" @click="openViaApi">this button</button>
    calls <code>api.open()</code> on the right-hand zone.
  </p>

  <p class="pg-muted">
    <strong>Pressing it changes one of the readouts.</strong> <code>api.open()</code> needs an
    input, so the directive creates one on demand — and it arrives
    <code>tabindex="-1"</code> and <code>aria-hidden="true"</code>. It is a mechanism, not an
    affordance: your button is the affordance, and a second tab stop for a feature the consumer
    just opted out of would be a phantom one. Note also that the directive leaves the host's
    <code>position</code> alone here — it only makes the host a containing block when the picker is
    a real tab stop that focus can scroll to (demo 3).
  </p>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.cap {
  margin: 0;
  font-size: 0.78rem;
  font-family: var(--mono);
  color: #40485c;
}
.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  text-align: center;
  min-height: 5.5rem;
  justify-content: center;
}
/* Only the click-enabled zone gets the pointer and the ring. The opted-out
   zone deliberately has neither — see the prose. */
.dz--click {
  cursor: pointer;
}
.dz--click:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
.dz[data-dropzone='active'] {
  border-color: #4f46e5;
  background: #eef2ff;
}
.probe {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--mono);
  font-size: 0.75rem;
  color: #40485c;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.probe b {
  color: #1f2430;
}
.pg-btn--inline {
  padding: 0.05rem 0.4rem;
  font-size: 0.78rem;
}
</style>
