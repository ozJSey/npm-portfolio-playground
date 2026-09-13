<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextEventDetail } from '@ozjsey/v-select-text'

// `v-select-text` with no value at all already means "select on mount". The
// ref only exists so the button can push `enabled` back through a
// false → true edge and re-fire it.
const quoteEnabled = ref(true)
const nestedEnabled = ref(false)

const quoteKind = ref('—')
const quoteChars = ref(0)
const nestedText = ref('—')

function onQuote(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  quoteKind.value = d.kind
  quoteChars.value = d.text.length
}

function onNested(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  // `detail.text` is already the resolved (rendered) text, so it goes
  // straight on screen — no cleanup needed.
  nestedText.value = d.text
}

function reselectQuote() {
  quoteEnabled.value = false
  requestAnimationFrame(() => (quoteEnabled.value = true))
}

function selectNested() {
  nestedEnabled.value = false
  requestAnimationFrame(() => (nestedEnabled.value = true))
}

// Mounting is what fires a bare binding, so the bare host is mounted on demand
// rather than at load — twelve cards share one document selection.
const bareMounted = ref(false)
</script>

<template>
  <div class="pg-col">
    <blockquote class="quote" v-select-text="quoteEnabled" @select-text="onQuote">
      The real job is <strong>rendered text</strong>: a quote, a table cell, a code span —
      anything a <em>Range</em> can wrap. Selecting an <code>&lt;input&gt;</code> is one line
      of vanilla JS and never needed a directive.
    </blockquote>

    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @click="reselectQuote">Re-select the quote</button>
      <span class="pg-chip">detail.kind: {{ quoteKind }}</span>
      <span class="pg-chip">detail.text.length (rendered): {{ quoteChars }}</span>
    </div>

    <p class="nested" v-select-text="nestedEnabled" @select-text="onNested">
      <span>Ships from</span> <strong>Rotterdam</strong> on <code>2026-09-02</code>
      <span>— <em>three</em> pallets, 1.2 t</span>.
    </p>

    <div class="pg-row">
      <button class="pg-btn" @click="selectNested">Select the nested paragraph</button>
      <span class="pg-muted">one Range, four child elements</span>
    </div>

    <div class="pg-row">
      <button class="pg-btn" @click="bareMounted = !bareMounted">
        {{ bareMounted ? 'Unmount' : 'Mount' }} a bare binding
      </button>
      <code v-if="bareMounted" v-select-text class="bare">v-select-text — no value at all</code>
      <span v-else class="pg-muted">the headline form: no value, selects on mount</span>
    </div>
    <p class="pg-kv">detail.text = {{ nestedText }}</p>

    <p class="pg-muted">
      The quote selects itself on mount and the second paragraph selects on the button, one
      Range straight across its <code>&lt;span&gt;</code>, <code>&lt;strong&gt;</code> and
      <code>&lt;code&gt;</code> children. Nothing here is focusable and nothing is focused —
      the highlight is painted by the document selection, so it keeps its full colour instead
      of greying out the way an <code>&lt;input&gt;</code>'s does when the field loses focus.
      <code>detail.kind</code> is <code>'text'</code> for any ordinary element: no
      <code>contenteditable</code>, no <code>&lt;input&gt;</code>, no <code>user-select: all</code>.
      <code>detail.text</code> is the text <em>as rendered</em> — the chip above is shorter than the
      quote's raw <code>textContent</code>, because the formatting space around the markup is not
      part of what you see selected.
    </p>
  </div>
</template>

<style scoped>
.quote {
  margin: 0;
  padding: 0.6rem 0.9rem;
  border-left: 3px solid #4f46e5;
  background: #fbfcfe;
  border-radius: 0 8px 8px 0;
  max-width: 38rem;
  line-height: 1.55;
}
.bare {
  font-family: var(--mono);
  font-size: 0.8rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.15rem 0.4rem;
}
.nested {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  max-width: 38rem;
}
</style>
