<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { SelectTextEventDetail } from '@ozjsey/v-select-text'

// The most ordinary shape there is: a bare binding on a host whose text has
// not arrived yet. Until SEL-4 this fired ONE event claiming `text: ""`, wiped
// whatever the page already had selected, and then never fired again.
// Rendered as data, not as a template literal: the SFC compiler closes an
// interpolation at the FIRST `}}`, so `{{ '{{ fromApi }}' }}` written inline is
// an unterminated string constant and the whole card fails to compile.
const HOST_SOURCE = '<p v-select-text>{{ fromApi }}</p>'
const COLLAPSED_RANGE = '{ start: 5, end: 5 }'

const fromApi = ref('')
const mounted = ref(false)
const events = ref<string[]>([])
const pending = ref(false)

function log(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  events.value.push(`text=${JSON.stringify(d.text)} start=${d.start} end=${d.end}`)
}

function mountEmpty() {
  fromApi.value = ''
  events.value = []
  mounted.value = true
}

function fetchText() {
  pending.value = true
  // A real round trip, one tick later — the whole point is that the text is
  // not there at mount.
  setTimeout(() => {
    fromApi.value = 'Text that arrived from the API after mount.'
    pending.value = false
  }, 400)
}

function reset() {
  mounted.value = false
  fromApi.value = ''
  events.value = []
}

// The "your selection survives" half: select this paragraph by hand (or with
// the button), then mount the empty host beside it.
const decoy = ref<HTMLElement | null>(null)
const live = ref('')

function readSelection() {
  live.value = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? ''
}

// Shown live rather than behind a button, because pressing a button is itself
// a way to lose a selection — see the `@mousedown.prevent` note below.
onMounted(() => document.addEventListener('selectionchange', readSelection))
onBeforeUnmount(() => document.removeEventListener('selectionchange', readSelection))

function selectTheDecoy() {
  const el = decoy.value
  if (!el) return
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(range)
}
</script>

<template>
  <div class="pg-col">
    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @mousedown.prevent @click="mountEmpty">
        Mount it empty
      </button>
      <button
        class="pg-btn"
        :disabled="!mounted || pending"
        @mousedown.prevent
        @click="fetchText"
      >{{ pending ? 'fetching…' : 'Let the text arrive' }}</button>
      <button class="pg-btn" @mousedown.prevent @click="reset">Reset</button>
    </div>

    <p v-if="mounted" class="late" v-select-text @select-text="log">{{ fromApi }}</p>
    <p v-else class="pg-muted">
      Not mounted. The host below is <code>{{ HOST_SOURCE }}</code> — no options at all.
    </p>

    <div class="pg-row">
      <span class="pg-chip">select-text events: {{ events.length }}</span>
      <span class="pg-kv">{{ events.length ? events[events.length - 1] : '— none —' }}</span>
    </div>

    <hr class="rule" />

    <p ref="decoy" class="decoy">
      A paragraph the user had already selected. Select it, then mount the empty host above — this
      selection has to survive, because an empty host has nothing to select and no business
      clearing the page.
    </p>

    <div class="pg-row">
      <button class="pg-btn" @mousedown.prevent @click="selectTheDecoy">
        Select this paragraph
      </button>
      <span class="pg-kv">
        live getSelection() = {{ live === '' ? '— nothing —' : JSON.stringify(live.slice(0, 46) + '…') }}
      </span>
    </div>

    <p class="pg-muted">
      Every button on this card carries <code>@mousedown.prevent</code>. Pressing a button normally
      collapses the document selection before its <code>click</code> handler ever runs, which would
      destroy the very thing this card is asking you to watch. That is browser behaviour, not the
      directive.
    </p>

    <p class="pg-muted">
      <strong>An empty resolution is a no-op, not a failure.</strong> Nothing is selected, no event
      fires, no warning prints, and the document selection is left exactly as it was. The
      <code>'edge'</code> trigger is spent by a selection that <em>happened</em>, not by an enabled
      render — so the host is still armed when the text lands, and selects it with no
      <code>trigger: 'always'</code> and no manual <code>enabled</code> cycle. Count the events: one,
      after the fetch. The same holds for a whitespace-only host, for
      <code>{{ COLLAPSED_RANGE }}</code>, and for a range that covers only the space the
      resolver inserts between two block children — a collapsed Range is not a selection.
    </p>
  </div>
</template>

<style scoped>
.late {
  margin: 0;
  min-height: 1.6rem;
  padding: 0.5rem 0.75rem;
  border: 1px dashed var(--stage-border);
  border-radius: 8px;
  max-width: 38rem;
}
.decoy {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid #94a3b8;
  background: #f8fafc;
  border-radius: 0 8px 8px 0;
  max-width: 38rem;
  line-height: 1.5;
}
.rule {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--stage-border);
  margin: 0.35rem 0;
}
</style>
