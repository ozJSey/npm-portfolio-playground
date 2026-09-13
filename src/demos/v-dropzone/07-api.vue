<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropzoneApi } from '@ozjsey/v-dropzone'

// The directive fills this ref with a reactive api whose identity is stable
// across option updates — safe to capture in a computed or a watch.
const dz = ref<DropzoneApi>()
const endpoint = ref('/api/upload-slow')

// The options object is built HERE, not in the template. Vue unwraps refs
// inside template expressions, so `v-dropzone="{ ref: dz, … }"` would hand the
// directive `dz.value` — `undefined` at mount — and the api would never bind.
// Anything passing `ref` has to build its options in <script setup>.
const options = computed(() => ({
  ref: dz,
  upload: { url: endpoint.value },
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      endpoint
      <select v-model="endpoint" class="pg-select">
        <option value="/api/upload-slow">/api/upload-slow (4s — time to cancel)</option>
        <option value="/api/upload-fail">/api/upload-fail (500 — time to retry)</option>
        <option value="/api/upload">/api/upload</option>
      </select>
    </label>
  </div>

  <div class="dz" v-dropzone="options">
    <strong>Drop files, or click to browse</strong>
    <span class="pg-muted">or drive everything from the buttons below</span>
  </div>

  <div class="pg-row" style="margin-top: 0.7rem">
    <button class="pg-btn pg-btn--primary" @click="dz?.open()">open()</button>
    <button class="pg-btn" :disabled="!dz?.uploading.length" @click="dz?.cancel()">
      cancel() {{ dz?.uploading.length ? `(${dz.uploading.length})` : '' }}
    </button>
    <button class="pg-btn" :disabled="!dz?.failed.length" @click="dz?.retry()">
      retry() {{ dz?.failed.length ? `(${dz.failed.length})` : '' }}
    </button>
    <button class="pg-btn" :disabled="dz?.state !== 'error'" @click="dz?.dismissError()">
      dismissError()
    </button>
  </div>

  <ul v-if="dz?.uploading.length || dz?.failed.length" class="per-file">
    <li v-for="f in dz.uploading" :key="`up-${f.name}`">
      <span class="pg-chip">uploading</span>
      <span class="name">{{ f.name }}</span>
      <button class="pg-btn" @click="dz?.cancel(f)">cancel(file)</button>
    </li>
    <li v-for="f in dz.failed" :key="`fail-${f.name}`">
      <span class="pg-chip pg-chip--bad">failed</span>
      <span class="name">{{ f.name }}</span>
      <button class="pg-btn" @click="dz?.retry(f)">retry(file)</button>
    </li>
  </ul>

  <dl class="kv">
    <dt>state</dt><dd>{{ dz?.state ?? '—' }}</dd>
    <dt>pending</dt><dd>{{ dz?.pending.map((f) => f.name).join(', ') || '—' }}</dd>
    <dt>uploading</dt><dd>{{ dz?.uploading.map((f) => f.name).join(', ') || '—' }}</dd>
    <dt>failed</dt><dd>{{ dz?.failed.map((f) => f.name).join(', ') || '—' }}</dd>
  </dl>

  <p class="pg-muted">
    <code>open()</code> is independent of the click affordance in both directions. The zone above
    already opens the picker on click — that is the default, and this card passes no
    <code>clickToPick</code> at all — but <code>open()</code> keeps working under
    <code>clickToPick: false</code> too: the hidden input is created on demand and survives the
    affordance being withdrawn, so a toolbar button outside the zone, or a keyboard shortcut, can
    drive a zone that is otherwise drop-only. That is what the <code>open()</code> button above is:
    the same picker, reached from outside the host. Every array is reactive; nothing
    is read back out of the DOM.
  </p>

  <p class="pg-muted">
    Each method has a no-arg and a per-file form. Drop several files at
    <code>/api/upload-slow</code> and cancel one row: only that file's request aborts, the rest keep
    going. Same for <code>retry(file)</code> against <code>/api/upload-fail</code>. Under
    <code>batched: true</code> there is only one request behind the group, so cancelling any member
    aborts all of them.
  </p>

  <p class="pg-muted">
    One trap worth copying carefully: the options object is built in
    <code>&lt;script setup&gt;</code>, never inline in the template. Vue unwraps refs inside
    template expressions, so <code>v-dropzone="{ ref: dz }"</code> passes <code>dz.value</code> —
    <code>undefined</code> — and the api silently never binds. Nothing throws; the buttons simply
    stay dead.
  </p>
</template>

<style scoped>
.per-file {
  list-style: none;
  margin: 0.7rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.per-file li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.per-file .name {
  font-family: var(--mono);
  flex: 1;
}
.pg-chip--bad {
  background: #fef2f2;
  color: #b91c1c;
}

.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  /* Click-to-pick is on, so the zone reads as a button. */
  cursor: pointer;
}
/* The picker input is clipped to 1px, so the HOST paints its focus ring.
   Nothing else inside this zone is focusable — the api buttons are siblings,
   not children — so `:focus-within` is exactly the picker's own focus.
   (`.dz:has(> input[type='file']:focus-visible)` is the precise form when a
   zone has other focusable children; see demo 3.) */
.dz:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
.dz[data-dropzone='active'] {
  border-color: #4f46e5;
  background: #eef2ff;
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
.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.1rem 0.8rem;
  font-family: var(--mono);
  font-size: 0.78rem;
  margin: 0.8rem 0 0;
}
.kv dt {
  color: #6b7488;
}
.kv dd {
  margin: 0;
}
</style>
