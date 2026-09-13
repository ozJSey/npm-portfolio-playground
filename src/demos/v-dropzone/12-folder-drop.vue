<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropzoneRejectEvent } from 'v-dropzone'

const onlyImages = ref(false)
const maxCount = ref(0)
const files = ref<File[]>([])
const rejected = ref('')

const totalBytes = computed(() => files.value.reduce((n, f) => n + f.size, 0))

// A partial rejection fires BOTH callbacks for one drop (onReject first, then
// on). Both land in the same synchronous pass, so a microtask-scoped flag
// groups them: the first callback of a drop clears the previous drop's output,
// the second only adds to it — a mixed folder shows both halves.
let sameDrop = false
function startDrop() {
  if (sameDrop) return
  sameDrop = true
  queueMicrotask(() => (sameDrop = false))
  files.value = []
  rejected.value = ''
}

const options = computed(() => ({
  // The one card on this tab that opts out. Click-to-pick is on by default,
  // but a bare `<input type="file">` browses for FILES — a folder needs
  // `webkitdirectory`, which the directive does not set. Leaving the default
  // on here would answer "drag a folder in" with a file dialog.
  clickToPick: false,
  accept: onlyImages.value ? 'image/*' : undefined,
  maxCount: maxCount.value > 0 ? maxCount.value : undefined,
  on: (dropped: File[]) => {
    startDrop()
    files.value = dropped
  },
  onReject: (e: DropzoneRejectEvent) => {
    startDrop()
    rejected.value = `rejected ${e.files.length} file(s) — reasons: [${e.reasons.join(', ')}]`
  },
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input v-model="onlyImages" type="checkbox" /> accept: 'image/*'
    </label>
    <label class="pg-label">
      maxCount
      <input v-model.number="maxCount" class="pg-input" type="number" min="0" style="width: 5rem" />
      <span class="pg-muted">(0 = unlimited)</span>
    </label>
    <button class="pg-btn" :disabled="!files.length && !rejected" @click="((files = []), (rejected = ''))">
      Clear
    </button>
  </div>

  <div class="dz" v-dropzone="options">
    <strong>Drag a folder in from Finder / Explorer</strong>
    <span class="pg-muted">nested directories are walked and flattened into plain files</span>
    <span class="pg-muted">drop-only — clicking this box does nothing, and nothing here takes Tab</span>
  </div>

  <p v-if="rejected" class="bad">{{ rejected }}</p>

  <div v-if="files.length" class="result">
    <p class="pg-kv">
      {{ files.length }} file(s) · {{ (totalBytes / 1024).toFixed(1) }} KB total
    </p>
    <ul class="files">
      <li v-for="(f, i) in files" :key="i">
        {{ f.name }} <span class="pg-muted">{{ f.type || 'unknown type' }}</span>
      </li>
    </ul>
  </div>

  <p class="pg-muted">
    A dropped directory arrives as one <code>dataTransfer</code> item with no files on it — the
    plain <code>dt.files</code> path silently yields nothing, which is why most dropzones just
    ignore folders. This one reads <code>webkitGetAsEntry()</code>
    <strong>synchronously inside the drop handler</strong> (the browser revokes
    <code>dataTransfer</code> the moment it returns), then walks each directory with
    <code>createReader().readEntries()</code>, looping until a batch comes back empty — real
    browsers cap each call at ~100 entries.
  </p>
  <p class="pg-muted">
    The flattened result then goes through the ordinary pipeline, so validation applies to the
    <em>contents</em>, not the folder: tick <code>accept</code> and drop a mixed folder to see
    per-file type rejection, or set <code>maxCount: 2</code> and drop a folder of five to see the
    whole drop rejected with reason <code>'count'</code>. Files come back flat — the directory
    structure is not preserved on the <code>File</code> objects.
  </p>
  <p class="pg-muted">
    Browsers without the FileSystem Entry API fall back to the synchronous <code>dt.files</code>
    path, so plain multi-file drops keep working — and so does a subtler case: Chromium exposes
    <code>webkitGetAsEntry</code> on every item but answers <code>null</code> from it whenever the
    item has nothing on disk behind it (a synthetic <code>DataTransfer</code>, a drag out of a
    virtual folder, a mail-client attachment). The directive treats an empty walk as "no entries"
    and reads <code>dataTransfer.files</code> instead, rather than delivering zero files.
  </p>
  <p class="pg-muted">
    Recursion is capped at 64 levels so a self-referencing entry — the shape a symlink loop
    produces — terminates; everything found above the cutoff is still delivered. An empty folder is
    a no-op (the handler is not called, the state stays <code>idle</code>), and an entry the OS
    refuses to hand over is skipped rather than failing the whole drop.
  </p>
  <p class="pg-muted">
    <strong>This card sets <code>clickToPick: false</code></strong> — demo 13 is the option on its
    own terms, side by side with the default; here it is the option in its natural habitat, and
    the reason is the point of it. Click-to-pick is <em>on by default</em> — every other
    zone here opens a picker when you click it — but a folder is a <em>drop-only</em> capability. A
    bare <code>&lt;input type="file"&gt;</code> browses for files, not directories; that needs
    <code>webkitdirectory</code>, which the directive does not set. Leaving the default on would
    answer &ldquo;drag a folder in&rdquo; with a <em>file</em> dialog.
  </p>
  <p class="pg-muted">
    Opting out removes the affordance rather than hiding it: no picker input is created at all, so
    there is no tab stop inside the zone — and the card carries no <code>cursor: pointer</code> and
    no focus ring, because there is nothing to point at or focus. That is the rule the whole tab
    follows: the pointer, the ring and the tab stop appear together, or none of them do. If you
    want a folder picker anyway, render your own
    <code>&lt;input type="file" webkitdirectory&gt;</code> next to the zone — the built-in
    interactive list means clicks on it keep their own semantics.
  </p>
</template>

<style scoped>
/* Deliberately no `cursor: pointer` and no focus ring on this card: with
   `clickToPick: false` there is no click affordance and no picker input to
   focus, so painting either would promise something the zone cannot do. */
.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  text-align: center;
}
.dz[data-dropzone='active'] {
  border-color: #4f46e5;
  background: #eef2ff;
}
.dz[data-dropzone='rejected'] {
  border-color: #dc2626;
  background: #fef2f2;
}
.result {
  margin-top: 0.7rem;
}
.files {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  font-family: var(--mono);
  font-size: 0.78rem;
  max-height: 9rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.bad {
  font-family: var(--mono);
  font-size: 0.8rem;
  color: #b91c1c;
  margin: 0.6rem 0 0;
}
</style>
