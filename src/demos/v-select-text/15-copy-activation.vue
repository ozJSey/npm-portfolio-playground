<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import type { SelectTextCopyDetail } from '@ozjsey/v-select-text'

// The activation rule, MEASURED rather than repeated.
//
// Three things this card exists to show, all confirmed with trusted input in
// Chrome 152 (see playground/scripts/interactions/v-select-text.mjs):
//
//   1. Transient activation lasts about five seconds after a real gesture, so
//      a `setTimeout(…, 250)` inside a click handler still has it. "A timer
//      loses the activation" is folklore. What loses it is the window
//      expiring — or never having had a gesture at all, which is what
//      `trigger: 'edge'` firing on mount is.
//   2. Past that window Chrome refuses the write itself: `NotAllowedError`,
//      reported as `reason: 'no-user-activation'`. This is not a
//      Firefox/Safari-only caveat.
//   3. Nothing throws either way. The refusal arrives on `select-text-copy`
//      with a reason, and a refused copy never clears the clipboard.
const enabled = ref(false)

interface Row {
  how: string
  /** `navigator.userActivation.isActive` read at the moment of the flip. */
  activation: boolean | null
  ok: boolean
  reason: string
}
const log = ref<Row[]>([])

/** Whatever the next `select-text-copy` is answering. */
let pending: { how: string; activation: boolean | null } = { how: '—', activation: null }

function activationNow(): boolean | null {
  return navigator.userActivation ? navigator.userActivation.isActive : null
}

function onCopy(e: Event) {
  const d = (e as CustomEvent<SelectTextCopyDetail>).detail
  log.value.unshift({ ...pending, ok: d.ok, reason: d.reason ?? '' })
  if (log.value.length > 6) log.value.pop()
}

/**
 * Re-arm the edge. `enabled` has to be observed false by a render before it can
 * transition to true again, so a plain `false; true` in one turn is a no-op
 * after the first press — Vue sees no change and the directive is never
 * updated. `nextTick` is a microtask: the gesture is still live across it.
 */
async function flip(how: string) {
  enabled.value = false
  await nextTick()
  pending = { how, activation: activationNow() }
  enabled.value = true
}

/** Legal: the gesture is still live. */
function flipNow() {
  void flip('inside the handler')
}

/** Also legal — and that is the point. 250 ms is well inside the 5 s window. */
function flipSoon() {
  setTimeout(() => void flip('setTimeout 250ms — still inside the window'), 250)
}

/** The real hazard: past the window, so there is no activation left. */
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
function flipLate() {
  if (timer) return
  countdown.value = 6
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value > 0) return
    clearInterval(timer as ReturnType<typeof setInterval>)
    timer = null
    void flip('6s later — the activation has expired')
  }, 1000)
}
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const readBack = ref('')
async function readClipboard() {
  try {
    readBack.value = await navigator.clipboard.readText()
  } catch (err) {
    readBack.value = `unreadable: ${(err as Error).name}`
  }
}
</script>

<template>
  <div class="pg-col">
    <p
      class="subject"
      v-select-text="{ enabled, copy: true }"
      @select-text-copy="onCopy"
    >TOKEN-ACTIVATION-DEMO-4821</p>

    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @click="flipNow">Flip inside the handler</button>
      <button class="pg-btn" @click="flipSoon">Flip in 250 ms</button>
      <button class="pg-btn" :disabled="countdown > 0" @click="flipLate">
        {{ countdown > 0 ? `flipping in ${countdown}s…` : 'Flip in 6 s (past the window)' }}
      </button>
      <button class="pg-btn" @click="readClipboard">Read the clipboard back</button>
    </div>

    <p class="pg-kv">clipboard = {{ readBack === '' ? '— not read yet —' : JSON.stringify(readBack) }}</p>

    <ul class="log">
      <li v-if="!log.length" class="pg-muted">No attempt yet — nothing has touched your clipboard.</li>
      <li v-for="(row, i) in log" :key="i" :class="row.ok ? 'ok' : 'bad'">
        <code>{{ row.how }}</code>
        — activation at flip:
        <strong>{{ row.activation === null ? 'not exposed' : row.activation }}</strong>
        → {{ row.ok ? 'copied' : `refused (${row.reason})` }}
      </li>
    </ul>

    <p class="pg-muted">
      This host uses the <strong>default</strong> <code>trigger: 'edge'</code> with
      <code>copy: true</code>, so it prints one warning per element naming <code>trigger:
      'click'</code> as the fix — and <em>still attempts the write</em>, because pre-blocking would
      make the package less capable than the engines actually permit: the first two buttons below
      are legal, and a page granted <code>clipboard-write</code> can write with no gesture at all.
      Safari also exposes no <code>navigator.userActivation</code> to pre-check with.
    </p>

    <p class="pg-muted">
      <strong>Measured, not assumed.</strong> Transient activation survives about five seconds after
      a real gesture, so the first two buttons both keep it — <em>a timer does not automatically
      lose the activation</em>, which is the half of this folklore that is wrong. The third waits
      past the window and flips with <code>activation: false</code>: that is the shape of the real
      bug, a selection armed by data arriving rather than by a click, and it is exactly what
      <code>trigger: 'edge'</code> does on mount. <strong>Chrome refuses it</strong> —
      <code>NotAllowedError</code>, reported here as
      <code>reason: 'no-user-activation'</code> — and so do Firefox and Safari. Hence
      <code>trigger: 'click'</code>.
    </p>

    <p class="pg-muted">
      However it ends, nothing throws and nothing rejects: the outcome arrives on
      <code>select-text-copy</code> with <code>reason: 'no-user-activation'</code> where the engine
      reports activation state and <code>'denied'</code> where it does not, and
      <code>data-select-text-copy</code> settles on <code>copied</code> or <code>error</code>.
      <strong>A refused copy never clears what was on the clipboard</strong> — read it back after one
      and see.
    </p>
  </div>
</template>

<style scoped>
.subject {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.85rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  background: #fbfcfe;
  align-self: flex-start;
}
.subject[data-select-text-copy='copied'] {
  border-color: #86efac;
  background: #f0fdf4;
}
.subject[data-select-text-copy='error'] {
  border-color: #fca5a5;
  background: #fef2f2;
}
.log {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.82rem;
  line-height: 1.7;
}
.log .ok {
  color: #15803d;
}
.log .bad {
  color: #b91c1c;
}
</style>
