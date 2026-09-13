<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextEventDetail } from 'v-select-text'

const enabled = ref(true)
const lastText = ref<string | null>(null)
const lastRange = ref('')

// RegExps live in <script setup>: the template compiler parses expressions as
// plain JavaScript, so keep anything clever out of the template.
const packageName = /v-[a-z-]+$/

// `select-text` bubbles, so one listener on the wrapper covers every token.
function onSelectText(e: Event) {
  const detail = (e as CustomEvent<SelectTextEventDetail>).detail
  lastText.value = detail.text
  lastRange.value = `kind=${detail.kind} start=${detail.start} end=${detail.end}`
}
</script>

<template>
  <div class="pg-col">
    <div class="pg-col tokens" @select-text="onSelectText">
      <div class="pg-row">
        <span class="pg-label key">API key</span>
        <code
          class="token"
          v-select-text="{ enabled, trigger: 'click' }"
        >sk-live-9f3b2c7d41ae4e08b6c5</code>
      </div>

      <div class="pg-row">
        <span class="pg-label key">commit</span>
        <code
          class="token"
          v-select-text="{ enabled, trigger: 'click' }"
        >4d9a1f6c8b27e05a3f1d9c4b6e8a70d2f5c31b9e</code>
      </div>

      <div class="pg-row">
        <span class="pg-label key">install</span>
        <code
          class="token"
          v-select-text="{ enabled, trigger: 'click' }"
        >npm install v-select-text</code>
      </div>

      <div class="pg-row">
        <span class="pg-label key">install + match</span>
        <code
          class="token"
          v-select-text="{ enabled, trigger: 'click', match: packageName }"
        >npm install v-select-text</code>
        <span class="pg-muted">selects only what <code>/v-[a-z-]+$/</code> matched</span>
      </div>
    </div>

    <div class="pg-row">
      <label class="pg-label">
        <input v-model="enabled" type="checkbox" /> enabled
      </label>
      <span class="pg-chip">
        last click selected: {{ lastText === null ? '— nothing yet —' : JSON.stringify(lastText) }}
      </span>
      <span class="pg-kv">{{ lastRange }}</span>
    </div>

    <p class="pg-muted">
      Click a token: nothing fires on mount, one selection fires per click while
      <code>enabled</code> is true. Uncheck it and click again — the listener is removed, not
      ignored. CSS <code>user-select: all</code> buys the same click affordance and stops there;
      here you also get the <code>select-text</code> event, the text in its payload, and the option
      to narrow the click to a <code>match</code> instead of the whole line.
    </p>
  </div>
</template>

<style scoped>
.tokens {
  gap: 0.4rem;
}
.key {
  width: 7rem;
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
</style>
