<script setup lang="ts">
import { ref } from 'vue'

const files = ref<File[]>([])

function onFiles(dropped: File[]) {
  files.value = dropped
}
</script>

<template>
  <div class="dz" v-dropzone="onFiles">
    <strong>Drop files here — or click to browse</strong>
    <span class="pg-muted">move the cursor across these children while dragging —</span>
    <span class="pg-muted">the zone stays active, no phantom dragleave</span>
  </div>

  <ul v-if="files.length" class="files">
    <li v-for="f in files" :key="f.name">
      {{ f.name }} <span class="pg-muted">({{ (f.size / 1024).toFixed(1) }} KB, {{ f.type || 'unknown type' }})</span>
    </li>
  </ul>

  <p class="pg-muted">
    Four events wired, all four <code>preventDefault</code>ed (without which the browser navigates
    away and opens your file), and an enter/leave counter so nested children do not flip the state.
    That counter bug is the reason this directive exists. Dropping a <em>folder</em> works too —
    see demo 12.
  </p>

  <p class="pg-muted">
    The binding here is a bare handler function, and that is already the whole affordance:
    <strong>click-to-pick is on by default</strong>, so this zone also opens the native file dialog
    on click and reaches it from the keyboard with <kbd>Tab</kbd> then <kbd>Enter</kbd> — picked
    files arrive at the same <code>onFiles</code>. Pass <code>clickToPick: false</code> to opt out
    (demo 12); demo 3 covers the guards that keep it from shadowing anything inside the zone.
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
  transition: background 120ms ease, border-color 120ms ease;
  /* Click-to-pick is on, so the zone reads as a button. */
  cursor: pointer;
}
/* The picker input is clipped to 1px, so the HOST paints its focus ring or Tab
   lands somewhere invisible. Nothing else in this zone is focusable, so
   `:focus-within` is exactly the picker's own focus.
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
.files {
  margin: 0.7rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
}
</style>
