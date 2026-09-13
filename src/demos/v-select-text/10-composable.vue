<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useSelectText } from '@ozjsey/v-select-text'
import type { SelectTextEventDetail } from '@ozjsey/v-select-text'

const field = useTemplateRef<HTMLTextAreaElement>('field')
const quote = useTemplateRef<HTMLElement>('quote')
const log = ref<string[]>([])

// No directive on either element — the composable owns them. Handy for route
// hooks, stores, or any caller that lives outside the template.
const fieldSelection = useSelectText({
  target: () => field.value,
  options: { start: 0, end: 15 },
})

// Same API, but the target is a plain <p>. The Range path needs no focus and
// no contenteditable.
const quoteSelection = useSelectText({
  target: () => quote.value,
  options: { match: 'Range API' },
})

function record(label: string, detail: SelectTextEventDetail | null) {
  log.value.unshift(
    detail
      ? `${label} → { kind: '${detail.kind}', start: ${detail.start}, end: ${detail.end}, text: ${JSON.stringify(detail.text)} }`
      : `${label} → null`,
  )
  log.value.length = Math.min(log.value.length, 6)
}

function selectFirstLine() {
  field.value?.focus()
  fieldSelection.update({ start: 0, end: 15 })
  record('field.select()', fieldSelection.select())
}

function shrinkField() {
  field.value?.focus()
  // Partial patch: `start` survives the merge, only `end` moves.
  fieldSelection.update({ end: 5 })
  record('field.update({ end: 5 }).select()', fieldSelection.select())
}

function selectWholeField() {
  field.value?.focus()
  fieldSelection.update({ start: undefined, end: undefined })
  record('field.select() — whole value', fieldSelection.select())
}

function selectMatch() {
  quoteSelection.update({ match: 'Range API' })
  record("quote.select() — match 'Range API'", quoteSelection.select())
}

function selectMissingMatch() {
  quoteSelection.update({ match: 'not in this paragraph' })
  record('quote.select() — match that misses', quoteSelection.select())
}

function selectWholeQuote() {
  quoteSelection.update({ match: undefined })
  record('quote.select() — whole host', quoteSelection.select())
}
</script>

<template>
  <div class="pg-col">
    <!-- Content starts on the tag's own line: a newline straight after
         `<textarea>` survives into `value` and would shift every offset by one. -->
    <textarea ref="field" class="pg-input" rows="3" style="width: 26rem">First line here
Second line here</textarea
    >

    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @click="selectFirstLine">select(0, 15)</button>
      <button class="pg-btn" @click="shrinkField">update({ end: 5 })</button>
      <button class="pg-btn" @click="selectWholeField">select all</button>
      <button class="pg-btn" @click="fieldSelection.clear()">clear()</button>
      <span class="pg-chip">textarea state: {{ fieldSelection.state.value }}</span>
    </div>

    <p ref="quote" class="quote">
      This paragraph carries no directive at all — the composable holds a ref to it and drives the
      Range API from script, so the same four methods cover static text.
    </p>

    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @click="selectMatch">select(match)</button>
      <button class="pg-btn" @click="selectMissingMatch">match that misses → null</button>
      <button class="pg-btn" @click="selectWholeQuote">select all</button>
      <button class="pg-btn" @click="quoteSelection.clear()">clear()</button>
      <span class="pg-chip">&lt;p&gt; state: {{ quoteSelection.state.value }}</span>
    </div>

    <pre class="pg-log">{{ log.join('\n') || '— nothing selected yet —' }}</pre>

    <p class="pg-muted">
      <code>select()</code> returns the same detail the event carries — including
      <code>text</code> — or <code>null</code> when the target is gone, disabled, or a
      <code>match</code> found nothing; <code>update()</code> shallow-merges, so
      <code>{ end: 5 }</code> keeps the <code>start</code> from init. Select in the textarea, then
      click one of the buttons: the field's highlight greys out the moment it loses focus, while a
      selection over the paragraph keeps its colour — a document selection needs no focus at all.
      (Clicking other text or the page background collapses it, as it would any selection.)
    </p>
  </div>
</template>

<style scoped>
.quote {
  border-left: 3px solid var(--stage-border);
  padding: 0.1rem 0 0.1rem 0.7rem;
  margin: 0;
  max-width: 34rem;
}
</style>
