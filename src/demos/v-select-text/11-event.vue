<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { SelectTextEventDetail, SelectTextOptions } from '@ozjsey/v-select-text'

const direction = ref<NonNullable<SelectTextOptions['direction']>>('forward')

const quoteEnabled = ref(false)
const quoteMode = ref<'match' | 'all'>('match')
const quoteBinding = computed<SelectTextOptions>(() =>
  quoteMode.value === 'match'
    ? { enabled: quoteEnabled.value, match: 'Range API', direction: direction.value }
    : { enabled: quoteEnabled.value, direction: direction.value },
)

const fieldEnabled = ref(false)
const range = ref({ start: 0, end: 5 })
const fieldBinding = computed<SelectTextOptions>(() => ({
  enabled: fieldEnabled.value,
  start: range.value.start,
  end: range.value.end,
  direction: direction.value,
}))

const field = useTemplateRef<HTMLInputElement>('field')
const last = ref<SelectTextEventDetail | null>(null)
const events = ref<string[]>([])
const copyState = ref('')

// One handler for both hosts: the event bubbles, so the wrapper hears every
// selection made below it and `detail.kind` says which host it came from.
function onSelectText(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  last.value = d
  events.value.unshift(
    `kind=${d.kind} start=${d.start} end=${d.end} direction=${d.direction} text=${short(d.text)}`,
  )
  events.value.length = Math.min(events.value.length, 6)
  copyState.value = ''
}

// JSON-quoted so the whitespace in `text` stays visible, then capped so one
// event is one line.
function short(text: string) {
  const quoted = JSON.stringify(text)
  return quoted.length > 46 ? `${quoted.slice(0, 45)}…"` : quoted
}

function fireQuote(mode: 'match' | 'all') {
  quoteEnabled.value = false
  requestAnimationFrame(() => {
    quoteMode.value = mode
    quoteEnabled.value = true
  })
}

function fireField(start: number, end: number) {
  field.value?.focus()
  fieldEnabled.value = false
  requestAnimationFrame(() => {
    range.value = { start, end }
    fieldEnabled.value = true
  })
}

// The payoff: the event hands you the exact string that is selected, so the
// integration is one line and never re-reads the DOM.
async function copyDetailText() {
  const detail = last.value
  if (!detail) return
  try {
    await navigator.clipboard.writeText(detail.text)
    copyState.value = `copied ${detail.text.length} chars`
  } catch {
    copyState.value = 'clipboard blocked by the browser'
  }
}

const lastText = computed(() => (last.value ? short(last.value.text) : '—'))
</script>

<template>
  <div class="pg-col" @select-text="onSelectText">
    <p v-select-text="quoteBinding" class="quote">
      The Range API selects rendered text, so this <em>paragraph</em> reports
      <code>kind: 'text'</code> — no focus involved, and the highlight survives a click on a
      button. Clicking other text or the page background collapses it, the way any document
      selection goes.
    </p>

    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @click="fireQuote('match')">
        &lt;p&gt; — match 'Range API'
      </button>
      <button class="pg-btn" @click="fireQuote('all')">&lt;p&gt; — select all</button>
    </div>

    <input
      ref="field"
      v-select-text="fieldBinding"
      class="pg-input"
      value="event payload demonstration"
      style="width: 24rem"
    />

    <div class="pg-row">
      <button class="pg-btn" @click="fireField(0, 5)">input — 0–5</button>
      <button class="pg-btn" @click="fireField(6, 13)">input — 6–13</button>
      <button class="pg-btn" @click="fireField(-3, 999)">input — -3–999 (clamped)</button>
      <label class="pg-label">
        direction
        <select v-model="direction" class="pg-select">
          <option>forward</option>
          <option>backward</option>
          <option>none</option>
        </select>
      </label>
    </div>

    <div class="pg-row">
      <button class="pg-btn" :disabled="!last" @click="copyDetailText">
        copy detail.text
      </button>
      <span class="pg-kv">detail.text = {{ lastText }}</span>
      <span v-if="copyState" class="pg-chip">{{ copyState }}</span>
    </div>

    <pre class="pg-log">{{ events.join('\n') || '— no selection yet —' }}</pre>

    <p class="pg-muted">
      Fire each host and watch <code>kind</code> flip between <code>text</code> and
      <code>input</code> — one bubbled listener covers both. Offsets are the <em>resolved</em>
      ones, so <code>-3–999</code> logs <code>0–27</code>, and <code>text</code> is exactly what is
      now selected: the field you hand to a clipboard, a quote box or an analytics call. Every
      path reports the same resolved view — selecting the whole <code>&lt;p&gt;</code>, an explicit
      range and a <code>match</code> all count characters the same way, so
      <code>detail.text</code> is what the reader sees highlighted rather than the raw
      <code>textContent</code> around it.
    </p>
  </div>
</template>

<style scoped>
.quote {
  border-left: 3px solid #4f46e5;
  border-radius: 0 6px 6px 0;
  padding: 0.5rem 0.8rem;
  margin: 0;
  max-width: 36rem;
  background: #fbfcfe;
}
</style>
