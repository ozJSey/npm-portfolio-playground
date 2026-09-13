<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { SelectTextEventDetail, SelectTextOptions } from '@ozjsey/v-select-text'

const mode = ref('whole')
const phrase = ref('brown fox')
const enabled = ref(false)
const last = ref('')
const host = useTemplateRef<HTMLElement>('rich')

// Exactly the options bag a static <p> takes — nothing here is
// contenteditable-specific.
const options = computed<SelectTextOptions>(() => {
  if (mode.value === 'range') return { enabled: enabled.value, start: 4, end: 19 }
  if (mode.value === 'match') return { enabled: enabled.value, match: phrase.value }
  return { enabled: enabled.value }
})

function select() {
  host.value?.focus()
  // 'edge' fires on false → true, so re-selecting needs the round trip.
  enabled.value = false
  requestAnimationFrame(() => (enabled.value = true))
}

function onSelectText(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  last.value = `kind=${d.kind} start=${d.start} end=${d.end} text=${JSON.stringify(d.text)}`
}
</script>

<template>
  <div class="pg-col">
    <p
      ref="rich"
      v-select-text="options"
      contenteditable
      class="rich"
      @select-text="onSelectText"
    >
      The quick brown fox jumps over the lazy dog.
    </p>

    <div class="pg-row">
      <label class="pg-label">
        mode
        <select v-model="mode" class="pg-select">
          <option value="whole">whole host</option>
          <option value="range">start 4 → end 19</option>
          <option value="match">match</option>
        </select>
      </label>
      <label class="pg-label">
        match
        <input
          v-model="phrase"
          class="pg-input"
          :disabled="mode !== 'match'"
          style="width: 12rem"
        />
      </label>
      <button class="pg-btn pg-btn--primary" @click="select">Select</button>
    </div>

    <pre class="pg-log">{{ last || '— no selection yet —' }}</pre>

    <p class="pg-muted">
      Edit the sentence, then press Select — <code>match</code> and the offsets are read from the
      live content on every fire, never from the markup Vue rendered: retype <em>fox</em> as
      <em>cat</em> and the match finds nothing, so there is no selection and no event. Offsets are
      whitespace-resolved, so <code>start: 4</code> lands on the fifth <em>rendered</em> character
      despite the formatting space around the markup. A static <code>&lt;p&gt;</code> takes this exact options
      bag; the only difference here is that the host is editable and focusable.
    </p>
  </div>
</template>

<style scoped>
.rich {
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  margin: 0;
  max-width: 34rem;
  background: #fff;
}
.rich:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 1px;
}
</style>
