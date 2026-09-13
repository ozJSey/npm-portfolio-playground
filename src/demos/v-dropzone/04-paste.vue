<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DropzoneRejectEvent } from '@ozjsey/v-dropzone'

const scope = ref<'host' | 'document'>('document')
// `pasteOn: 'host'` only hears a paste while focus is inside the host, and the
// whole point of the card is that you can *see* whether it is. Driven by
// focusin/focusout rather than a poll so it reads the browser, not a guess.
const armed = ref(false)
const uploadPasted = ref(false)
const previews = ref<string[]>([])
const rejected = ref('')
const log = ref<string[]>([])

const options = computed(() => ({
  paste: true,
  pasteOn: scope.value,
  accept: 'image/*',
  // Ticking the box adds the upload leg: the pasted screenshot then walks
  // uploading → success exactly as a dropped file would.
  upload: uploadPasted.value ? { url: '/api/upload' } : undefined,
  // Click-to-pick is on by default, so the previews below now sit inside a
  // click target. A screenshot you just pasted is something to look at, not a
  // button — an `<img>` carries no click semantics the built-in interactive
  // list can recognise, so it takes an explicit exemption.
  clickIgnore: '.shots',
  on: (files: File[]) => {
    rejected.value = ''
    for (const url of previews.value) URL.revokeObjectURL(url)
    previews.value = files.map((f) => URL.createObjectURL(f))
  },
  onReject: (e: DropzoneRejectEvent) => {
    rejected.value = `reasons: [${e.reasons.join(', ')}] — ${e.files.map((f) => f.name || '(unnamed)').join(', ')}`
  },
  onUploaded: (file: File) => log.value.unshift(`✓ uploaded ${file.name}`),
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      pasteOn
      <select v-model="scope" class="pg-select">
        <option value="document">document (paste anywhere)</option>
        <option value="host">host (must be focused)</option>
      </select>
    </label>
    <label class="pg-label">
      <input v-model="uploadPasted" type="checkbox" /> upload what I paste
    </label>
  </div>

  <!-- No `tabindex="0"` on the wrapper. `pasteOn: 'host'` needs focus somewhere
       inside the host, and click-to-pick's own `<input type="file">` — a child
       of this element, clipped but focusable — supplies it: a click on the zone
       focuses it, Tab lands on it, and the paste event bubbles from there to
       the host listener. A hand-rolled tab stop here would be a second one for
       the same zone. -->
  <div class="dz" v-dropzone="options" @focusin="armed = true" @focusout="armed = false">
    <strong>Take a screenshot and press ⌘V</strong>
    <span v-if="scope === 'document'" class="pg-muted">
      <code>pasteOn: 'document'</code> — paste anywhere on the page, no gesture needed first
    </span>
    <span v-else class="pg-muted">
      <code>pasteOn: 'host'</code> — <strong>click this box</strong> (or <kbd>Tab</kbd> to it)
      so the paste has somewhere to land
    </span>
    <span v-if="scope === 'host'" class="armed" :class="{ 'armed--on': armed }">
      {{ armed ? 'focused — ⌘V lands here' : 'not focused — ⌘V goes nowhere' }}
    </span>
    <div v-if="previews.length" class="shots">
      <img v-for="url in previews" :key="url" :src="url" alt="pasted screenshot" />
    </div>
  </div>

  <p v-if="rejected" class="bad">{{ rejected }}</p>
  <p v-if="log.length" class="pg-kv">{{ log[0] }}</p>

  <p class="pg-muted">
    The paste path shares the same validation, the same <code>rejected</code> lifecycle and the same
    upload dispatch as drop and pick — copy a <em>file</em> that is not an image and paste it to see
    the rejection reasons and the red border, or tick the box above to watch a pasted screenshot run
    the whole upload pipeline. iOS Safari does not fire <code>paste</code> for images outside
    inputs — that is why <code>'document'</code> is the recommendation for screenshot flows.
  </p>

  <p class="pg-muted">
    <strong><code>pasteOn: 'host'</code> works with the gesture you would actually try.</strong>
    A plain <code>&lt;div&gt;</code> cannot take focus, so the zone borrows the one focusable
    control the directive already owns: click-to-pick's <code>&lt;input type="file"&gt;</code>,
    clipped to 1px but a real tab stop, sitting inside this element. Clicking the zone focuses it
    and the paste event bubbles from there to the host listener; <kbd>Tab</kbd> reaches the same
    control. Watch the chip above flip as you click in and click away.
  </p>
  <p class="pg-muted">
    Clicking also opens the file dialog — that is click-to-pick, on by default, doing exactly its
    job; dismiss it and the zone is still focused and armed. If you want a paste target with no
    browse affordance at all, the right pairing is <code>pasteOn: 'document'</code>, not
    <code>clickToPick: false</code>: switching the picker off removes the only focusable thing in
    the zone, and host-scoped paste then has nothing to attach to for a keyboard user. Demo 13 is
    the opt-out on its own terms.
  </p>
  <p class="pg-muted">
    The pasted previews are exempted with <code>clickIgnore: '.shots'</code> — clicking a
    screenshot you just pasted should not reopen a file dialog.
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
  gap: 0.3rem;
  text-align: center;
  /* Click-to-pick is on, so the zone reads as a button. */
  cursor: pointer;
}
/* Was `:focus-visible` back when the host carried its own `tabindex`. The host
   is not focusable any more — its picker input is, and that input is clipped to
   1px — so the ring has to follow focus *within*. Nothing else in this zone is
   focusable, so this is exactly the picker's own focus.
   (`.dz:has(> input[type='file']:focus-visible)` is the precise form when a
   zone has other focusable children; see demo 3.) */
.dz:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
/* Guarded previews — output, not controls. */
.shots {
  cursor: default;
}
.armed {
  font-family: var(--mono);
  font-size: 0.72rem;
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  border: 1px solid #b9c1d4;
  color: #6b7280;
  background: #fff;
}
.armed--on {
  border-color: #4f46e5;
  color: #4f46e5;
  background: #eef2ff;
}
.bad {
  margin: 0.6rem 0 0;
  font-size: 0.85rem;
  color: #b91c1c;
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
.dz[data-dropzone='active'] {
  border-color: #4f46e5;
  background: #eef2ff;
}
.shots {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
  flex-wrap: wrap;
}
.shots img {
  max-height: 120px;
  border-radius: 6px;
  border: 1px solid var(--stage-border);
}
</style>
