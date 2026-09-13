<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DropzoneApi } from '@ozjsey/v-dropzone'

const dz = ref<DropzoneApi>()
const rejectDuration = ref(1500)
const successDuration = ref(1500)
const endpoint = ref('/api/upload')
const trail = ref<string[]>([])

// Record every state the machine passes through.
const options = computed(() => ({
  ref: dz,
  accept: 'image/*',
  rejectDuration: rejectDuration.value,
  successDuration: successDuration.value,
  upload: { url: endpoint.value },
  // The zone's whole content is the live state readout, and click-to-pick is
  // on by default — so a click aimed at *reading* the state would open an OS
  // dialog, and anything picked from it walks the machine and lands in the
  // trail below. Guarding the readout keeps the transitions in this card
  // caused by the drops you make, not by the clicks you make to look at them.
  clickIgnore: '.state',
}))

// `api.state` is reactive, so a watch catches every transition. Polling would
// be lossy by construction — drop either duration below the poll interval and
// the very state this card exists to show would never make it into the trail.
watch(
  () => dz.value?.state,
  (state) => {
    if (!state) return
    trail.value.unshift(state)
    trail.value.length = Math.min(trail.value.length, 10)
  },
)
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      rejectDuration
      <input v-model.number="rejectDuration" class="pg-input" type="number" step="500" style="width: 6rem" />
    </label>
    <label class="pg-label">
      successDuration
      <input v-model.number="successDuration" class="pg-input" type="number" step="500" style="width: 6rem" />
    </label>
    <label class="pg-label">
      endpoint
      <select v-model="endpoint" class="pg-select">
        <option value="/api/upload">succeeds (~700ms)</option>
        <option value="/api/upload-slow">succeeds slowly (~4s — time to drag over it)</option>
        <option value="/api/upload-fail">fails</option>
      </select>
    </label>
  </div>

  <div class="dz" v-dropzone="options">
    <strong class="state">{{ dz?.state ?? 'idle' }}</strong>
    <span class="pg-muted">drop an image (accepted) or a .txt (rejected)</span>
    <span class="pg-muted">clicking anywhere but the state word browses instead</span>
  </div>

  <p class="pg-kv" style="margin-top: 0.6rem">trail: {{ trail.join(' ← ') || '—' }}</p>

  <p class="pg-muted">
    <code>rejected</code> and <code>success</code> auto-clear back to <code>idle</code>;
    <code>error</code> is <strong>sticky</strong> and only clears on the next drop or
    <code>dismissError()</code>. Starting a new drag while a rejection is pending cancels the clear
    (so you always see <code>active</code> while dragging), and dragging during an upload flips to
    <code>active</code> then back to <code>uploading</code> — not <code>idle</code>. Pick the slow
    endpoint and drag a file over the zone without dropping it to watch that last one in the trail;
    do the same over a zone in <code>error</code> and the error is still there when you leave.
  </p>

  <p class="pg-muted">
    Picking files through the click-to-pick dialog (on by default — click the zone, or
    <kbd>Tab</kbd> then <kbd>Enter</kbd>) drives exactly the same machine as a drop: same
    validation, same <code>uploading</code> → <code>success</code>/<code>error</code>, same entries
    in the trail. Only <code>active</code> is drag-specific, since there is no hover phase to a
    dialog. The state word itself is exempted with <code>clickIgnore: '.state'</code> — a readout
    you click to read should not answer with a file dialog.
  </p>
</template>

<style scoped>
.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  font-family: var(--mono);
  transition: background 140ms ease, border-color 140ms ease;
  /* Click-to-pick is on, so the zone reads as a button. */
  cursor: pointer;
}
/* The picker input is clipped to 1px, so the HOST paints its focus ring.
   Nothing else here is focusable, so `:focus-within` is exactly the picker's
   own focus. (`.dz:has(> input[type='file']:focus-visible)` is the precise
   form when a zone has other focusable children; see demo 3.) */
.dz:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
/* Guarded readout — output, not a control. */
.state {
  cursor: default;
}
.dz[data-dropzone='active'] {
  border-color: #4f46e5;
  background: #eef2ff;
}
.dz[data-dropzone='rejected'] {
  border-color: #dc2626;
  background: #fef2f2;
}
.dz[data-dropzone='uploading'] {
  border-color: #2563eb;
  background: #eff6ff;
}
.dz[data-dropzone='success'] {
  border-color: #16a34a;
  background: #f0fdf4;
}
.dz[data-dropzone='error'] {
  border-color: #dc2626;
  background: #fef2f2;
}
</style>
