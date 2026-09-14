<script setup lang="ts">
import { ref } from 'vue'
import type { CopyResult } from '@ozjsey/v-copy'

/**
 * Copy what the **user** highlighted — with the mouse, or with Shift+Arrow.
 *
 * The hard part is invisible: pressing the trigger destroys the selection
 * before the click handler ever runs. Measured in this browser, dragging a real
 * selection and clicking a real trigger:
 *
 *   <button>                            the selection survives
 *   <span> (what v-copy makes copyable) the selection is GONE by `click`
 *
 * Both triggers below are bound identically, and both copy — because the
 * directive snapshots the selection on `pointerdown`, before the browser's own
 * default action collapses it. The `<span>` is the interesting one: comment the
 * snapshot out of the library and it copies nothing.
 */
const picked = ref<string[]>([])

const log = ref<string[]>([])
function onResult(e: Event) {
  const r = (e as CustomEvent<CopyResult>).detail
  log.value.unshift(r.success ? `ok — copied ${JSON.stringify(r.text)}` : `refused — error: "${r.error}"`)
  log.value.splice(6)
}
</script>

<template>
  <div class="pg-col" @copy-result="onResult">
    <p class="prose">
      Ada Lovelace wrote the first algorithm intended for a machine, in 1843. Drag across any part of
      this sentence, then press one of the two triggers below.
    </p>

    <p class="nosel">
      This block is <code>user-select: none</code>. Try to drag across it: the selection stringifies
      to <code>""</code>, and an empty copy is refused rather than clearing your clipboard.
    </p>

    <div class="pg-row two">
      <label class="pg-col grow">
        <span class="pg-label">A text field — Shift+Arrow here, then press a trigger</span>
        <textarea class="pg-input field" rows="2" spellcheck="false">sk-live-4417-field-selection</textarea>
      </label>
      <label class="pg-col grow">
        <span class="pg-label">An editable note — Shift+Arrow, then Tab to a trigger and press Enter</span>
        <div class="pg-input note" contenteditable spellcheck="false">contenteditable selection survives Tab</div>
      </label>
    </div>

    <div class="pg-row">
      <!-- Same binding, two host shapes. `.selection` is the whole opt-in; the
           array is an ordinary history sink, which the selection feeds like any
           other source. -->
      <button class="pg-btn" v-copy.selection="picked">Copy selection — a &lt;button&gt;</button>
      <span class="pg-btn chip" v-copy.selection="picked">Copy selection — a &lt;span&gt;</span>
      <span class="pg-muted">the span is where the selection would otherwise be lost</span>
    </div>

    <p class="pg-muted">
      What lands on the clipboard is <code>getSelection().toString()</code> — exactly what ⌘C would
      have produced, the separators an engine inserts at block boundaries included. That is
      deliberately the <em>opposite</em> of the call <code>v-select-text</code> makes: there the
      directive owns a resolved view of the selection it made, so reporting one string and copying
      another would be the bug. Here the user's own selection is the truth.
    </p>

    <div class="pg-row">
      <strong class="pg-label">Selections copied</strong>
      <span class="pg-muted">newest first — <code>dedupe</code> promotes a repeat instead of adding a row</span>
    </div>
    <ul class="picked">
      <li v-for="(text, i) in picked" :key="text + i">{{ text }}</li>
      <li v-if="!picked.length" class="pg-muted">— nothing yet —</li>
    </ul>

    <pre class="pg-log">{{ log.length ? log.join('\n') : '— highlight something and press a trigger —' }}</pre>
  </div>
</template>

<style scoped>
.prose {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  background: #fbfcfe;
  line-height: 1.7;
}
/* Part of what the card demonstrates: this region selects as the empty string. */
.nosel {
  user-select: none;
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px dashed #d4b3b3;
  border-radius: 8px;
  background: #fdf6f6;
  font-size: 0.82rem;
}
.chip {
  cursor: pointer;
}
.pg-btn[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
.two {
  align-items: stretch;
}
.grow {
  flex: 1 1 16rem;
}
.field,
.note {
  font-family: var(--mono);
  font-size: 0.78rem;
}
.note {
  min-height: 2.6rem;
}
.picked {
  margin: 0;
  padding-left: 1.1rem;
  font-family: var(--mono);
  font-size: 0.78rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
</style>
