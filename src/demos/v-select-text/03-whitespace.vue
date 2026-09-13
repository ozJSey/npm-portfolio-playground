<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextEventDetail } from '@ozjsey/v-select-text'

// Multi-line, source-indented text — a template literal, a markdown blob, a
// description field off an API. The browser paints it as one collapsed line;
// `textContent` still carries every newline and every leading space.
const passage = `
  The quick brown fox
  jumps over the lazy dog,
  then naps in the sun.
`

// What 'collapse' indexes: a run of ASCII whitespace counts as one space and
// leading/trailing whitespace is dropped — the text as rendered.
const rendered = passage.replace(/[\t\n\f\r ]+/g, ' ').trim()

const start = ref(4)
const end = ref(9)
const enabled = ref(false)
const collapsedText = ref<string | null>(null)
const preservedText = ref<string | null>(null)

function onCollapse(e: Event) {
  collapsedText.value = (e as CustomEvent<SelectTextEventDetail>).detail.text
}

function onPreserve(e: Event) {
  preservedText.value = (e as CustomEvent<SelectTextEventDetail>).detail.text
}

// Both hosts read the same `enabled`, so one false → true edge fires both.
function fireBoth() {
  enabled.value = false
  requestAnimationFrame(() => (enabled.value = true))
}

// A `white-space: pre` host is the case 'preserve' exists for: raw indices off
// the source string line up 1:1 with the characters the browser paints, so
// indexOf is enough to select a whole line, indentation included.
const snippet = `{
  "name": "@ozjsey/v-select-text",
  "version": "2.0.0"
}`
const versionLine = '  "version": "2.0.0"'
const lineStart = snippet.indexOf(versionLine)
const lineEnd = lineStart + versionLine.length

const preEnabled = ref(false)
const preText = ref<string | null>(null)

function onPre(e: Event) {
  preText.value = (e as CustomEvent<SelectTextEventDetail>).detail.text
}

function firePre() {
  preEnabled.value = false
  requestAnimationFrame(() => (preEnabled.value = true))
}
</script>

<template>
  <div class="pg-col">
    <div class="pg-row">
      <label class="pg-label">
        start
        <input v-model.number="start" type="range" min="0" :max="passage.length" />
        <code>{{ start }}</code>
      </label>
      <label class="pg-label">
        end
        <input v-model.number="end" type="range" min="0" :max="passage.length" />
        <code>{{ end }}</code>
      </label>
      <button class="pg-btn pg-btn--primary" @click="fireBoth">Select in both</button>
    </div>

    <div class="pair">
      <div class="pg-col">
        <div class="pg-row">
          <span class="pg-chip">whitespace: 'collapse'</span>
          <span class="pg-chip">indexes {{ rendered.length }} rendered chars</span>
        </div>
        <p
          class="passage"
          v-select-text="{ enabled, start, end }"
          @select-text="onCollapse"
        >{{ passage }}</p>
        <p class="pg-kv">
          selected: {{ collapsedText === null ? '—' : JSON.stringify(collapsedText) }}
        </p>
      </div>

      <div class="pg-col">
        <div class="pg-row">
          <span class="pg-chip">whitespace: 'preserve'</span>
          <span class="pg-chip">indexes {{ passage.length }} textContent chars</span>
        </div>
        <p
          class="passage"
          v-select-text="{ enabled, start, end, whitespace: 'preserve' }"
          @select-text="onPreserve"
        >{{ passage }}</p>
        <p class="pg-kv">
          selected: {{ preservedText === null ? '—' : JSON.stringify(preservedText) }}
        </p>
      </div>
    </div>

    <p class="pg-muted">
      Both fire on the same edge and there is only one document selection, so the second host keeps
      the paint — the reported text is what each one actually asked for.
    </p>

    <div class="pg-row">
      <span class="pg-chip">white-space: pre + whitespace: 'preserve'</span>
      <button class="pg-btn" @click="firePre">
        Select snippet.indexOf(versionLine) → {{ lineStart }}–{{ lineEnd }}
      </button>
    </div>
    <div
      class="code-block"
      v-select-text="{ enabled: preEnabled, start: lineStart, end: lineEnd, whitespace: 'preserve' }"
      @select-text="onPre"
    >{{ snippet }}</div>
    <p class="pg-kv">selected: {{ preText === null ? '—' : JSON.stringify(preText) }}</p>

    <p class="pg-muted">
      <code>'collapse'</code> counts a run of whitespace as one space and drops leading and trailing
      whitespace, so <code>start</code> / <code>end</code> / <code>match</code> are offsets into the
      text <em>as rendered</em> — {{ rendered.length }} characters here, not {{ passage.length }}.
      <code>'preserve'</code> indexes raw <code>textContent</code>: off by the indentation in
      normal flow, and exactly right for the <code>white-space: pre</code> block, where what the
      string says and what the browser paints are the same characters.
    </p>
  </div>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  gap: 0.75rem;
  align-items: start;
}
.passage {
  margin: 0;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  background: #fff;
}
.code-block {
  white-space: pre;
  font-family: var(--mono);
  font-size: 0.78rem;
  line-height: 1.5;
  margin: 0;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  background: #fff;
  overflow-x: auto;
  max-width: 26rem;
}
</style>
