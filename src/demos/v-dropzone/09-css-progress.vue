<script setup lang="ts">
/**
 * No JavaScript state drives the bar. The directive writes
 * `--dropzone-progress` (0..100) and `--dropzone-files-pending` on the host
 * while a batch is in flight; the stylesheet does the rest. The two controls
 * below only pick which pipeline the drop takes — nothing reads the vars back.
 */
import { computed, ref } from 'vue'

const endpoint = ref('/api/upload-slow')
const maxSizeKb = ref(0)

const options = computed(() => ({
  upload: { url: endpoint.value },
  maxSize: maxSizeKb.value > 0 ? maxSizeKb.value * 1024 : undefined,
  // Click-to-pick is on by default, so the zone is a click target — and the
  // progress bar and the pending counter live *inside* it. Neither carries
  // click semantics the built-in interactive list can recognise (no role, no
  // tabindex, they are a `<div>` and a `<span>`), so without this a click on
  // the readout mid-upload opens an OS file dialog on top of the upload it is
  // reporting. `clickIgnore` is matched with `closest()`, so the `<em>` nested
  // in the counter is covered too.
  clickIgnore: '.bar, .counter',
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      endpoint
      <select v-model="endpoint" class="pg-select">
        <option value="/api/upload-slow">/api/upload-slow (200 after ~4s)</option>
        <option value="/api/upload">/api/upload (200 after ~700ms)</option>
        <option value="/api/upload-fail">/api/upload-fail (500 — bar freezes and turns red)</option>
      </select>
    </label>
    <label class="pg-label">
      maxSize
      <input v-model.number="maxSizeKb" class="pg-input" type="number" min="0" step="100" style="width: 6rem" />
      KB <span class="pg-muted">(0 = unlimited — set it low to reject a drop)</span>
    </label>
  </div>

  <div class="dz" v-dropzone="options">
    <div class="bar" />
    <strong>Drop a few files — or click to browse</strong>
    <span class="counter">still uploading: <em /></span>
    <span class="pg-muted">no refs, no handlers — pure CSS custom properties</span>
  </div>

  <p class="pg-muted">
    A file that errors contributes its <em>last reported percent</em> to the average, so the bar can
    honestly read "failed at 75%" — pick <code>/api/upload-fail</code> and watch it freeze where it
    got to and turn red instead of snapping to 0 or 100. Files still settle the pending counter
    whether they succeed or fail, so it reaches zero either way.
  </p>

  <p class="pg-muted">
    Both variables are cleared when the zone returns to <code>idle</code>. A <em>rejected</em> drop
    never touches them at all, because no upload was attempted — set <code>maxSize</code> to
    something small and drop an oversized file: the border goes red for
    <code>rejected</code>, and the bar stays hidden rather than flashing at 0%.
  </p>

  <p class="pg-muted">
    The zone also opens the file picker on click — that is the default — which is why this card
    passes <code>clickIgnore: '.bar, .counter'</code>. Both readouts are plain elements with no
    click semantics of their own, so the built-in interactive list cannot see them, and a click on
    the progress bar mid-upload would put an OS dialog on top of the upload it is reporting. This is
    the shape the option exists for: <em>output</em> inside a zone that is now a button. The rest of
    the box is still clickable, and <kbd>Tab</kbd> then <kbd>Enter</kbd> reaches the same picker.
  </p>
</template>

<style scoped>
.dz {
  position: relative;
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  overflow: hidden;
  /* Click-to-pick is on, so the zone reads as a button. */
  cursor: pointer;
}
/* The picker input is clipped to 1px, so the HOST paints its focus ring —
   nothing else in this zone is focusable, so `:focus-within` is exactly the
   picker's own focus here. (`.dz:has(> input[type='file']:focus-visible)` is
   the precise form when a zone has other focusable children; see demo 3.) */
.dz:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
/* The guarded readouts are output, not controls — say so with the cursor. */
.bar,
.counter {
  cursor: default;
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
/* `rejected` deliberately gets no `.bar` rule — the vars are never written for
   a drop that failed validation, so there is nothing to show. */
.dz[data-dropzone='rejected'] {
  border-color: #dc2626;
  background: #fef2f2;
}

.bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 5px;
  display: none;
  background: #2563eb;
  width: calc(var(--dropzone-progress, 0) * 1%);
  transition: width 120ms ease-out;
}
.dz[data-dropzone='uploading'] .bar,
.dz[data-dropzone='success'] .bar,
.dz[data-dropzone='error'] .bar {
  display: block;
}
.dz[data-dropzone='success'] .bar {
  background: #16a34a;
}
.dz[data-dropzone='error'] .bar {
  background: #dc2626;
}

.counter {
  font-size: 0.8rem;
  color: #40485c;
  display: none;
}
.dz[data-dropzone='uploading'] .counter {
  display: inline;
  counter-reset: pending var(--dropzone-files-pending);
}
.counter em::before {
  content: counter(pending);
  font-style: normal;
  font-weight: 700;
}
</style>
