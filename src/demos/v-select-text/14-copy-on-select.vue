<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextCopyDetail, SelectTextEventDetail } from '@ozjsey/v-select-text'

// `copy: true` writes exactly `detail.text` — the same string the select-text
// event reports. `trigger: 'click'` is what makes the write legal: a clipboard
// write needs a user gesture, and the default 'edge' trigger fires on mount.
const copyOn = ref(true)
const lastSelected = ref('')
const lastCopied = ref('')
const lastReason = ref('')
const ok = ref<boolean | null>(null)
const order = ref<string[]>([])

const packageName = /v-[a-z-]+$/

function onSelectText(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  lastSelected.value = d.text
  order.value.push('select-text')
}

function onCopy(e: Event) {
  const d = (e as CustomEvent<SelectTextCopyDetail>).detail
  ok.value = d.ok
  lastCopied.value = d.text
  lastReason.value = d.reason ?? ''
  order.value.push('select-text-copy')
  if (order.value.length > 4) order.value = order.value.slice(-4)
}

const readBack = ref('')
async function readClipboard() {
  try {
    readBack.value = await navigator.clipboard.readText()
  } catch (err) {
    readBack.value = `unreadable: ${(err as Error).name}`
  }
}
</script>

<template>
  <div class="pg-col">
    <div
      class="pg-col tokens"
      @select-text="onSelectText"
      @select-text-copy="onCopy"
    >
      <div class="pg-row">
        <span class="pg-label key">API key</span>
        <code
          class="token"
          v-select-text="{ trigger: 'click', copy: copyOn }"
        >sk-live-9f3b2c7d41ae4e08b6c5</code>
      </div>

      <div class="pg-row">
        <span class="pg-label key">commit</span>
        <code
          class="token"
          v-select-text="{ trigger: 'click', copy: copyOn }"
        >4d9a1f6c8b27e05a3f1d9c4b6e8a70d2f5c31b9e</code>
      </div>

      <div class="pg-row">
        <span class="pg-label key">install + match</span>
        <code
          class="token"
          v-select-text="{ trigger: 'click', copy: copyOn, match: packageName }"
        >npm install @ozjsey/v-select-text</code>
        <span class="pg-muted">only the part <code>/v-[a-z-]+$/</code> matched is copied</span>
      </div>

      <div class="pg-row">
        <span class="pg-label key">rendered view</span>
        <code
          class="token"
          v-select-text="{ trigger: 'click', copy: copyOn }"
        >ORD-2026-0917<span class="hidden">-INTERNAL-DRAFT</span> ·  2 pallets</code>
        <span class="pg-muted">
          the <code>display: none</code> part is in <code>textContent</code> and never reaches the
          clipboard
        </span>
      </div>
    </div>

    <div class="pg-row">
      <label class="pg-label"><input v-model="copyOn" type="checkbox" /> copy</label>
      <span class="pg-chip">selected: {{ lastSelected === '' ? '—' : JSON.stringify(lastSelected) }}</span>
      <span class="pg-chip" :class="{ good: ok === true, bad: ok === false }">
        copy: {{ ok === null ? '—' : ok ? 'ok' : `failed (${lastReason})` }}
      </span>
      <span class="pg-kv">clipboard received: {{ lastCopied === '' ? '—' : JSON.stringify(lastCopied) }}</span>
    </div>

    <div class="pg-row">
      <button class="pg-btn" @click="readClipboard">Read the clipboard back</button>
      <span class="pg-kv">{{ readBack === '' ? '— not read yet —' : JSON.stringify(readBack) }}</span>
      <span class="pg-kv">order: {{ order.join(' → ') || '—' }}</span>
    </div>

    <p class="pg-muted">
      Click a token, or <strong>Tab to it and press Enter or Space</strong> —
      <code>trigger: 'click'</code> is no longer mouse-only. While it is active the directive adds
      <code>tabindex="0"</code>, <code>role="button"</code> and Enter/Space handling, and takes all
      three back when the trigger changes or the host unmounts; anything you wrote yourself is left
      alone, and a real control (<code>&lt;button&gt;</code>, <code>&lt;a href&gt;</code>,
      <code>&lt;input&gt;</code>) is left alone entirely.
    </p>
    <p class="pg-muted">
      What lands on the clipboard is exactly <code>detail.text</code> — never
      <code>getSelection().toString()</code>, which is <code>""</code> on a
      <code>user-select: none</code> host and would wipe your clipboard. Watch the order chip:
      <code>select-text</code> always comes first, and the write is already in flight before your
      handler runs, so a handler cannot spend the user activation the write needs. The
      <code>data-select-text-copy</code> attribute on each token goes
      <code>pending → copied</code>, which is what paints the tick with no JavaScript.
    </p>
  </div>
</template>

<style scoped>
.tokens {
  gap: 0.4rem;
}
.key {
  width: 8rem;
  flex: none;
}
.token {
  font-family: var(--mono);
  font-size: 0.8rem;
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  background: #fbfcfe;
  cursor: pointer;
}
.token:hover {
  background: #eef2ff;
  border-color: #c7d0ff;
}
.token:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
.hidden {
  display: none;
}
.token[data-select-text-copy='copied']::after {
  content: ' ✓';
  color: #15803d;
}
.token[data-select-text-copy='error']::after {
  content: ' ✕';
  color: #b91c1c;
}
.pg-chip.good {
  border-color: #86efac;
  background: #f0fdf4;
}
.pg-chip.bad {
  border-color: #fca5a5;
  background: #fef2f2;
}
</style>
