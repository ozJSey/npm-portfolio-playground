<script setup lang="ts">
import { ref } from 'vue'
import type { CopyResult } from '@ozjsey/v-copy'

/**
 * Which selection is *this* trigger's selection?
 *
 * The default is the whole document, because that is what ⌘C does: a page has
 * one selection, and the platform never asks which card you meant. The toolbar
 * button below is that default.
 *
 * `within` narrows it, and a copy button sitting inside a card is exactly why
 * it exists — highlight something in the other card and this one refuses rather
 * than copying a neighbour's text. Three forms:
 *
 *   within: '.card'   the nearest matching ANCESTOR (then the first match in
 *                     the document, for a toolbar button outside its panel)
 *   within: true      the bound element itself
 *   omitted           anywhere in the document
 *
 * A selection that *spans* the container is out of scope rather than clipped:
 * a clipped string is not what the user highlighted.
 */
const log = ref<string[]>([])
function onResult(e: Event) {
  const r = (e as CustomEvent<CopyResult>).detail
  const who = r.key ? `[${r.key}] ` : ''
  log.value.unshift(who + (r.success ? `ok — ${JSON.stringify(r.text)}` : `refused — error: "${r.error}"`))
  log.value.splice(6)
}
</script>

<template>
  <div class="pg-col" @copy-result="onResult">
    <div class="pg-row">
      <!-- No `within`: the document-wide default. A page-level "copy what I
           selected" toolbar button is a real use, and it is the one shape that
           must work with no configuration at all. -->
      <button class="pg-btn pg-btn--primary page" v-copy:page.selection>
        Copy my selection — anywhere on the page
      </button>
      <span class="pg-muted">no <code>within</code> — the ⌘C default</span>
    </div>

    <div class="pg-row cards">
      <section class="card">
        <h4>Invoice 4417</h4>
        <p class="prose">Ada Lovelace · ada@lovelace.dev · due 1843-12-10</p>
        <button class="pg-btn" v-copy:invoice="{ selection: { within: '.card' } }">
          Copy this card's selection
        </button>
      </section>

      <section class="card">
        <h4>Invoice 9f2c</h4>
        <p class="prose">Grace Hopper · grace@hopper.dev · due 1952-04-02</p>
        <button class="pg-btn" v-copy:receipt="{ selection: { within: '.card' } }">
          Copy this card's selection
        </button>
      </section>
    </div>

    <blockquote class="quote" v-copy:quote="{ selection: { within: true } }">
      within: true — this block is both the text and the trigger. Highlight part of it and click it;
      highlight something in a card above and clicking here refuses.
    </blockquote>

    <p class="pg-muted">
      A <code>within</code> selector that matches nothing <strong>refuses</strong> rather than falling
      back to the whole document — a scope that silently widens would copy text the binding
      explicitly said it did not want. Every refusal here reports
      <code>error: 'empty'</code>: nothing was written, nothing recorded, no
      <code>[data-copied]</code>.
    </p>

    <pre class="pg-log">{{ log.length ? log.join('\n') : '— highlight something, then press a trigger —' }}</pre>
  </div>
</template>

<style scoped>
.cards {
  align-items: stretch;
}
.card {
  flex: 1 1 16rem;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  background: #fbfcfe;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.card h4 {
  margin: 0;
  font-size: 0.82rem;
  color: #5b6478;
}
.prose {
  margin: 0;
  line-height: 1.7;
  font-family: var(--mono);
  font-size: 0.78rem;
}
.quote {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-left: 3px solid #c7d0ff;
  background: #f6f8ff;
  border-radius: 0 8px 8px 0;
  line-height: 1.7;
  cursor: pointer;
}
.pg-btn[data-copied],
.quote[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
</style>
