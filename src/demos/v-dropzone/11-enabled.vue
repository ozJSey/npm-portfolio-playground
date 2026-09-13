<script setup lang="ts">
import { ref } from 'vue'

interface Zone {
  id: string
  accept: string
  files: string[]
}

const enabled = ref(true)
const zones = ref<Zone[]>([
  { id: 'avatars', accept: 'image/*', files: [] },
  { id: 'documents', accept: '.pdf,.docx,.txt', files: [] },
  { id: 'anything', accept: '', files: [] },
])

// Curried per-zone handler. Each zone gets its own closure; the directive keys
// its state by element, so the three never interfere.
const receive = (zone: Zone) => (files: File[]) => {
  zone.files = files.map((f) => f.name)
}
</script>

<template>
  <label class="pg-label" style="margin-bottom: 0.6rem">
    <input v-model="enabled" type="checkbox" /> enabled (detaches every listener when off)
  </label>

  <div class="zones">
    <div
      v-for="zone in zones"
      :key="zone.id"
      class="dz"
      v-dropzone="{
        enabled,
        accept: zone.accept || undefined,
        on: receive(zone),
        clickIgnore: '.names',
      }"
    >
      <strong>{{ zone.id }}</strong>
      <code class="pg-muted">{{ zone.accept || 'anything' }}</code>
      <ul class="names">
        <li v-for="name in zone.files" :key="name">{{ name }}</li>
      </ul>
    </div>
  </div>

  <p class="pg-muted">
    Three zones rendered from one <code>v-for</code> with no per-iteration setup: state is keyed by
    element in a <code>WeakMap</code> and torn down in <code>unmounted</code>. Drop into one and the
    others do not react — and the same holds for the click-to-pick dialog each of them now owns,
    since the picker input is a child of its own host.
  </p>

  <p class="pg-muted">
    <strong><code>enabled: false</code> is the strongest proof there is that nothing is left
    behind.</strong> The listeners are removed entirely rather than ignored, so dragging over the
    zones does nothing — and the picker input is <em>destroyed</em>, not hidden. Untick the box and
    press <kbd>Tab</kbd> through this card: the three tab stops inside the zones are gone, because
    the controls they belonged to no longer exist. Tick it again and all three come back, named and
    focusable, with their <code>accept</code> re-mirrored. A disabled zone with a live tab stop on
    an invisible file input would be a phantom control; there isn't one.
  </p>

  <p class="pg-muted">
    Each zone lists the filenames it received <em>inside</em> its own host, which is a stray-click
    surface as soon as the zone is a click target: reading a filename must not open a dialog. Hence
    <code>clickIgnore: '.names'</code> — the list is exempted, the rest of the box still browses.
  </p>
</template>

<style scoped>
.zones {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.6rem;
}
.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  min-height: 7rem;
  /* Click-to-pick is on, so every zone reads as a button. */
  cursor: pointer;
}
/* The picker input is clipped to 1px, so the HOST paints its focus ring.
   Nothing else in a zone is focusable, so `:focus-within` is exactly the
   picker's own focus. (`.dz:has(> input[type='file']:focus-visible)` is the
   precise form when a zone has other focusable children; see demo 3.)
   With `enabled: false` there is no input left to focus, so no ring appears —
   which is the point of the card. */
.dz:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
/* The guarded filename list — output, not a control. */
.names {
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
.dz ul {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  font-size: 0.75rem;
  font-family: var(--mono);
  text-align: center;
}
</style>
