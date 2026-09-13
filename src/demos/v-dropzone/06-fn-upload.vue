<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropzoneApi, UploadError } from '@ozjsey/v-dropzone'

const dz = ref<DropzoneApi>()
const log = ref<string[]>([])
const percent = ref(0)
const shouldFail = ref(false)

function push(line: string) {
  log.value.unshift(line)
  log.value.length = Math.min(log.value.length, 8)
}

// The S3-presigned shape: get a URL, PUT the body, report progress, return
// whatever your caller needs. The directive owns state, cancellation and the
// error surface; the transport is yours.
//
// The third argument is how a custom transport feeds the directive's own
// `onProgress` option — calling it is what makes `--dropzone-progress` and the
// `onProgress(file, percent)` callback move on this path. Ticks are slow
// enough to leave a window for the Cancel button.
async function upload(file: File, signal: AbortSignal, report?: (p: number) => void) {
  push(`→ requesting a presigned URL for ${file.name}`)
  for (let p = 0; p <= 100; p += 10) {
    if (signal.aborted) throw new Error('aborted by the directive')
    await new Promise((r) => setTimeout(r, 220))
    report?.(p)
  }
  if (shouldFail.value) throw new Error('presigned URL expired')
  return { key: `uploads/${file.name}`, etag: Math.random().toString(36).slice(2, 10) }
}

function onProgress(file: File, pct: number) {
  percent.value = pct
}

function onUploaded(file: File, response: unknown) {
  push(`✓ ${file.name} → ${JSON.stringify(response)}`)
}

// `aborted` is the flag that separates "the transport failed" from "we stopped
// it" — cancel() and host unmount both land here.
function onError(file: File, error: UploadError) {
  push(`✗ ${file.name} → ${error.message}${error.aborted ? ' [aborted]' : ''}`)
}

// Built in <script setup>, not inline: a template expression would unwrap the
// ref and the api would never bind. See demo 7.
const options = computed(() => ({ ref: dz, upload, onProgress, onUploaded, onError }))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="shouldFail" type="checkbox" /> make the transport throw</label>
    <button class="pg-btn" :disabled="!dz?.uploading.length" @click="dz?.cancel()">
      Cancel {{ dz?.uploading.length ? `(${dz.uploading.length})` : '' }}
    </button>
    <span class="pg-chip">{{ percent }}%</span>
  </div>

  <div class="dz" v-dropzone="options">
    <strong>Drop a file — or click to browse — and a fake presigned PUT runs</strong>
    <span class="pg-muted">one call per accepted file, ~2.4s each</span>
  </div>

  <pre class="pg-log" style="margin-top: 0.6rem">{{ log.join('\n') || '— idle —' }}</pre>

  <p class="pg-muted">
    Hit <strong>Cancel</strong> mid-upload: the directive aborts the
    <code>AbortSignal</code> your function is already watching, and the throw comes back as
    <code>onError(file, { aborted: true })</code> — the same path a host unmount takes. A thrown
    <code>Error</code> otherwise becomes <code>onError(file, { message })</code>; a non-Error throw
    falls back to <code>'Upload failed'</code>. <code>batched</code> is URL-only — group inside your
    function if you need it.
  </p>

  <p class="pg-muted">
    The third parameter is the bridge to the directive's own <code>onProgress</code> option: a
    custom transport that never calls it still uploads, but reports no progress and leaves
    <code>--dropzone-progress</code> flat.
  </p>

  <p class="pg-muted">
    Click-to-pick is on by default, so the zone browses on click and on <kbd>Tab</kbd> +
    <kbd>Enter</kbd> with nothing configured. A picked file reaches your transport exactly as a
    dropped one does — the pick is a source of files, not a second pipeline — so
    <strong>Cancel</strong> and the <code>aborted</code> flag behave the same either way.
  </p>
</template>

<style scoped>
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
