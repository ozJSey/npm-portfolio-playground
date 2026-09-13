<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UploadError } from '@ozjsey/v-dropzone'

const endpoint = ref('/api/upload')
const method = ref<'POST' | 'PUT' | 'PATCH'>('POST')
const batched = ref(false)
const perFileFns = ref(false)
const timeoutMs = ref(0)
const withCredentials = ref(false)
const rawText = ref(false)
const progress = ref<Record<string, number>>({})
const log = ref<string[]>([])

function push(line: string) {
  log.value.unshift(line)
  log.value.length = Math.min(log.value.length, 8)
}

// Custom parser — bypasses the default JSON-when-applicable behaviour.
const parseRaw = (xhr: XMLHttpRequest) => `raw:${xhr.responseText.length} chars`

const options = computed(() => ({
  upload: {
    // `url` and `formDataExtras` are value-or-function. The function form is
    // resolved per file — this is the shape an S3 presigned flow takes, where
    // each file needs its own signed URL. Under `batched: true` there is one
    // request for the whole group, so both are resolved once against the FIRST
    // file only; per-file functions and batching are mutually exclusive.
    url: perFileFns.value ? (file: File) => `${endpoint.value}?name=${encodeURIComponent(file.name)}` : endpoint.value,
    method: method.value,
    // Headers are resolved per file too, so a token refresh between two files
    // is picked up.
    headers: () => ({ 'x-demo-token': `t_${Date.now().toString(36)}` }),
    fieldName: 'file',
    formDataExtras: perFileFns.value
      ? (file: File) => ({ folder: 'playground', originalName: file.name })
      : { folder: 'playground' },
    batched: batched.value,
    timeout: timeoutMs.value,
    withCredentials: withCredentials.value,
    parseResponse: rawText.value ? parseRaw : undefined,
  },
  onProgress: (file: File, percent: number) => {
    progress.value = { ...progress.value, [file.name]: percent }
  },
  onUploaded: (file: File, response: unknown) => push(`✓ ${file.name} → ${JSON.stringify(response)}`),
  onError: (file: File, error: UploadError) =>
    push(
      `✗ ${file.name} → ${error.message}${error.status ? ` (${error.status})` : ''}` +
        `${error.timedOut ? ' [timedOut]' : ''}${error.aborted ? ' [aborted]' : ''}`,
    ),
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      endpoint
      <select v-model="endpoint" class="pg-select">
        <option value="/api/upload">/api/upload (200 after ~700ms)</option>
        <option value="/api/upload-slow">/api/upload-slow (200 after ~4s)</option>
        <option value="/api/upload-fail">/api/upload-fail (500)</option>
      </select>
    </label>
    <label class="pg-label">
      method
      <select v-model="method" class="pg-select">
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="PATCH">PATCH</option>
      </select>
    </label>
    <label class="pg-label"><input v-model="batched" type="checkbox" /> batched (one XHR for all)</label>
    <label class="pg-label">
      <input v-model="perFileFns" type="checkbox" /> url + formDataExtras as functions
    </label>
  </div>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      timeout
      <input v-model.number="timeoutMs" class="pg-input" type="number" step="500" min="0" style="width: 6rem" />
      ms (0 = none — try 1000 with the slow endpoint → [timedOut])
    </label>
    <label class="pg-label"><input v-model="withCredentials" type="checkbox" /> withCredentials</label>
    <label class="pg-label"><input v-model="rawText" type="checkbox" /> custom parseResponse</label>
  </div>

  <div class="dz" v-dropzone="options">
    <strong>Drop files to upload for real — or click to browse</strong>
    <span class="pg-muted">the dev server answers these three routes</span>
  </div>

  <p v-if="batched" class="pg-muted" style="margin-top: 0.6rem">
    <strong>batched:</strong> one request behind all of these — every bar below shows the same
    request-wide percent, not that file's own.
  </p>

  <ul v-if="Object.keys(progress).length" class="bars">
    <li v-for="(pct, name) in progress" :key="name">
      <span class="name">{{ name }}</span>
      <span class="track"><i :style="{ width: `${pct}%` }" /></span>
      <span class="pct">{{ pct }}%</span>
    </li>
  </ul>

  <pre class="pg-log" style="margin-top: 0.6rem">{{ log.join('\n') || '— no uploads yet —' }}</pre>

  <p class="pg-muted">
    The directive owns the <code>XMLHttpRequest</code> + <code>FormData</code> plumbing and never
    sets <code>Content-Type</code> — XHR generates the multipart boundary itself, and a
    consumer-supplied content-type is filtered out. Responses are parsed as JSON when the server
    says so; malformed JSON falls back to raw text.
  </p>

  <p class="pg-muted">
    Tick <code>batched</code> and drop three files: one request goes out instead of three, and
    <code>onProgress</code> / <code>onUploaded</code> / <code>onError</code> still fire once per
    file but every call carries the same request-wide payload. The per-file
    <code>url</code> / <code>headers</code> / <code>formDataExtras</code> functions are resolved
    once, against the first file — so tick both boxes together only to see that trade-off, never in
    real code.
  </p>

  <p class="pg-muted">
    Click-to-pick is on by default, so the zone browses on click and on <kbd>Tab</kbd> +
    <kbd>Enter</kbd>. Picked files take the identical route — same validation, same
    <code>FormData</code>, same per-file <code>url</code> / <code>headers</code> /
    <code>formDataExtras</code> resolution, same <code>onProgress</code> bars. Picking is the easier
    way to get a file big enough to watch progress actually move, since a drop of a few KB finishes
    in one event.
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
.bars {
  list-style: none;
  margin: 0.7rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.bars li {
  display: grid;
  grid-template-columns: 12rem 1fr 3rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
}
.name {
  font-family: var(--mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track {
  height: 6px;
  border-radius: 3px;
  background: #e5e9f7;
  overflow: hidden;
}
.track i {
  display: block;
  height: 100%;
  background: #4f46e5;
  transition: width 120ms ease-out;
}
.pct {
  text-align: right;
  font-family: var(--mono);
}
</style>
