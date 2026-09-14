<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropzoneApi } from '@ozjsey/v-dropzone'

const dz = ref<DropzoneApi>()
const done = ref<string[]>([])

function onUploaded(file: File) {
  done.value.push(file.name)
}

// Built in <script setup> so the `ref` survives: a template expression would
// unwrap it to `dz.value` and the api would never attach. See demo 7.
const options = computed(() => ({
  ref: dz,
  autoUpload: false,
  upload: { url: '/api/upload' },
  onUploaded,
}))
</script>

<template>
  <div class="dz" v-dropzone="options">
    <strong>Drop files, or click to browse — nothing uploads yet</strong>
    <span class="pg-muted">they queue in <code>api.pending</code> for review</span>
  </div>

  <ul v-if="dz?.pending.length" class="queue">
    <li v-for="f in dz.pending" :key="f.name">
      <span class="name">{{ f.name }}</span>
      <span class="pg-muted">{{ (f.size / 1024).toFixed(1) }} KB</span>
      <button class="pg-btn" @click="dz?.upload(f)">upload just this one</button>
      <button class="pg-btn remove" @click="dz?.cancel(f)">remove</button>
    </li>
  </ul>

  <div class="pg-row" style="margin-top: 0.7rem">
    <button class="pg-btn pg-btn--primary" :disabled="!dz?.pending.length" @click="dz?.upload()">
      Upload all {{ dz?.pending.length ?? 0 }}
    </button>
    <button class="pg-btn" @click="dz?.open()">Add more…</button>
    <span v-if="done.length" class="pg-chip">uploaded: {{ done.join(', ') }}</span>
  </div>

  <p class="pg-muted">
    <code>autoUpload: false</code> flips drop / paste / pick into queue-only mode. The no-arg
    <code>upload()</code> flushes the queue; <code>upload(file)</code> routes specific files through
    validation and the pipeline — which is how "upload only the ones I ticked" is built.
  </p>

  <p class="pg-muted">
    <strong>remove</strong> is <code>api.cancel(file)</code>. On a queued file there is no request
    to abort, so it simply drops out of <code>api.pending</code> and the zone's state does not move
    — a review queue needs a remove, and until 0.1.1 this call was a silent no-op on anything that
    had not started uploading. The no-arg <code>cancel()</code> is the other half: it aborts what is
    in flight and leaves the queue alone.
  </p>

  <p class="pg-muted">
    There are two ways into the queue and they are the same code path. The zone itself browses on
    click — that is <code>clickToPick</code>, on by default, with <kbd>Tab</kbd> + <kbd>Enter</kbd>
    as its keyboard route — and <strong>Add more…</strong> calls <code>api.open()</code> on the same
    hidden input from outside the host. Either way the files land in <code>api.pending</code>
    without uploading, because <code>autoUpload: false</code> gates the pipeline, not the source.
  </p>
</template>

<style scoped>
.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  /* Click-to-pick is on, so the zone reads as a button. */
  cursor: pointer;
}
/* The picker input is clipped to 1px, so the HOST paints its focus ring.
   Nothing else in this zone is focusable — the queue and its buttons are
   siblings, not children — so `:focus-within` is exactly the picker's own
   focus. (`.dz:has(> input[type='file']:focus-visible)` is the precise form
   when a zone has other focusable children; see demo 3.) */
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
.queue {
  list-style: none;
  margin: 0.7rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.queue li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.82rem;
}
.name {
  font-family: var(--mono);
  min-width: 12rem;
}
.remove {
  color: #b91c1c;
}
</style>
