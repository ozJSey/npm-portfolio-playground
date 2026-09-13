<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { SelectTextEventDetail } from '@ozjsey/v-select-text'

const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/

const enabled = ref(false)
const needle = ref('invoice INV-4821')
const useRegex = ref(false)
const matchIndex = ref(0)

const detail = ref<SelectTextEventDetail | null>(null)
const ran = ref(false)

const pattern = computed(() => (useRegex.value ? DATE_PATTERN : needle.value))

const outcome = computed(() => {
  if (!ran.value) return 'press Select'
  if (!detail.value) return 'no match — nothing selected, no event'
  return `detail.text: "${detail.value.text}"`
})

const offsets = computed(() =>
  detail.value ? `${detail.value.start}–${detail.value.end}` : '—',
)

function onSelectText(e: Event) {
  detail.value = (e as CustomEvent<SelectTextEventDetail>).detail
}

function select() {
  detail.value = null
  ran.value = false
  enabled.value = false
  requestAnimationFrame(() => {
    enabled.value = true
    // The directive selects synchronously inside Vue's update, so one tick
    // later we know whether the event fired at all.
    nextTick(() => (ran.value = true))
  })
}
</script>

<template>
  <div class="pg-col">
    <p
      class="prose"
      v-select-text="{ enabled, match: pattern, matchIndex }"
      @select-text="onSelectText"
    >
      Ticket <code>OPS-1420</code> covers invoice <strong>INV-4821</strong>, issued
      <em>2026-07-14</em>, and invoice <strong>INV-4907</strong>, due
      <em>2026-08-23</em>. A third invoice never arrived — chase it on the
      <strong>invoice</strong> thread before Friday.
    </p>

    <div class="pg-row">
      <label class="pg-label">
        match
        <input
          v-model="needle"
          class="pg-input"
          :disabled="useRegex"
          type="text"
          style="width: 15rem"
        />
      </label>
      <label class="pg-label">
        <input v-model="useRegex" type="checkbox" />
        RegExp <code>/\d{4}-\d{2}-\d{2}/</code> (the two dates)
      </label>
      <label class="pg-label">
        matchIndex
        <input v-model.number="matchIndex" class="pg-input" type="number" style="width: 5rem" />
      </label>
      <button class="pg-btn pg-btn--primary" @click="select">Select</button>
    </div>

    <div class="pg-row">
      <span class="pg-chip">{{ outcome }}</span>
      <span class="pg-chip">offsets: {{ offsets }}</span>
    </div>

    <p class="pg-muted">
      The default needle starts in plain text and ends inside a <code>&lt;strong&gt;</code> —
      that is the point: <code>match</code> is searched against the flattened, rendered text, so
      an occurrence may span nested elements, and it can never reach into text the user cannot
      see. Type
      <code>invoice</code> with <code>matchIndex: -1</code> to take the last of the four
      occurrences; anything out of range (try <code>9</code>) selects nothing and dispatches no
      event, which is what the chip reports.
    </p>
  </div>
</template>

<style scoped>
.prose {
  margin: 0;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  background: #fbfcfe;
  max-width: 38rem;
  line-height: 1.6;
}
</style>
