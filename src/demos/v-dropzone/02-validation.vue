<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropzoneRejectEvent } from 'v-dropzone'

const accept = ref('image/*,.pdf')
const maxSizeKb = ref(500)
const maxCount = ref(3)
const multiple = ref(true)

const accepted = ref<string[]>([])
const rejected = ref<string>('')

// A partial rejection fires BOTH callbacks for one drop — `onReject` first,
// then `on`, in the same synchronous pass. Clearing the previous drop's output
// inside each handler would let the second callback wipe the first one's line,
// which is exactly the mixed case this card exists to show. A microtask-scoped
// flag makes the reset happen once per drop instead.
let sameDrop = false
function startDrop() {
  if (sameDrop) return
  sameDrop = true
  queueMicrotask(() => (sameDrop = false))
  accepted.value = []
  rejected.value = ''
}

const options = computed(() => ({
  accept: accept.value || undefined,
  maxSize: maxSizeKb.value * 1024,
  maxCount: maxCount.value,
  multiple: multiple.value,
  on: (files: File[]) => {
    startDrop()
    accepted.value = files.map((f) => f.name)
  },
  onReject: (e: DropzoneRejectEvent) => {
    startDrop()
    rejected.value = `reasons: [${e.reasons.join(', ')}] — ${e.files.map((f) => f.name).join(', ')}`
  },
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">accept <input v-model="accept" class="pg-input" style="width: 11rem" /></label>
    <label class="pg-label">
      maxSize <input v-model.number="maxSizeKb" class="pg-input" type="number" step="100" style="width: 6rem" /> KB
    </label>
    <label class="pg-label">
      maxCount <input v-model.number="maxCount" class="pg-input" type="number" style="width: 4rem" />
    </label>
    <label class="pg-label"><input v-model="multiple" type="checkbox" /> multiple</label>
  </div>

  <div class="dz" v-dropzone="options">
    Drop a mix of files — or click to browse — and watch which ones survive
  </div>

  <p v-if="accepted.length" class="ok">accepted: {{ accepted.join(', ') }}</p>
  <p v-if="rejected" class="bad">{{ rejected }}</p>

  <p class="pg-muted">
    <code>accept</code> and <code>maxSize</code> are <strong>per file</strong> — the survivors still
    reach <code>on</code>. <code>multiple: false</code> and <code>maxCount</code> are
    <strong>drop-level</strong>: violating them rejects the whole drop with reason
    <code>'count'</code>. Reasons always arrive in the canonical order
    <code>['type', 'size', 'count']</code>. Note <code>multiple</code> defaults to
    <code>true</code> here, unlike <code>&lt;input type="file"&gt;</code>. Drop one good file and
    one bad one together to see both lines at once — a partial rejection fires
    <code>onReject</code> <em>and</em> <code>on</code> for the same drop.
  </p>

  <p class="pg-muted">
    Click-to-pick is on by default here too, and it earns its keep on this card: the
    <code>accept</code> and <code>multiple</code> you type above are mirrored onto the hidden
    <code>&lt;input type="file"&gt;</code> on every update, so the <em>native dialog</em> filters by
    the live values before you have picked anything. That is a hint, not a guarantee — the same
    per-file <code>accept</code> / <code>maxSize</code> and drop-level <code>multiple</code> /
    <code>maxCount</code> rules re-run on whatever comes back, and reject it with the same reasons.
    Set <code>maxCount</code> to 1, leave <code>multiple</code> ticked, and pick two files to watch
    the dialog allow it and the validator refuse it.
  </p>
</template>

<style scoped>
.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.5rem;
  text-align: center;
  transition: background 120ms ease, border-color 120ms ease;
  /* Click-to-pick is on, so the zone reads as a button. */
  cursor: pointer;
}
/* The picker input is clipped to 1px, so the HOST paints its focus ring.
   Nothing else in this zone is focusable, so `:focus-within` is exactly the
   picker's own focus. (`.dz:has(> input[type='file']:focus-visible)` is the
   precise form when a zone has other focusable children; see demo 3.) */
.dz:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
.dz[data-dropzone='active'] {
  border-color: #4f46e5;
  background: #eef2ff;
}
.dz[data-dropzone='rejected'] {
  border-color: #dc2626;
  background: #fef2f2;
}
.ok,
.bad {
  font-size: 0.83rem;
  font-family: var(--mono);
  margin: 0.6rem 0 0;
}
.ok {
  color: #15803d;
}
.bad {
  color: #b91c1c;
}
</style>
