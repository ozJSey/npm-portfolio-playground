<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { SelectTextEventDetail, SelectTextOptions } from '@ozjsey/v-select-text'

const log = ref<string[]>([])

function onSelectText(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  log.value.unshift(`kind=${d.kind} start=${d.start} end=${d.end} text=${JSON.stringify(d.text)}`)
  log.value.length = Math.min(log.value.length, 6)
}

// 1 — the bare binding. `v-select-text` with no value means "select on mount",
// so mounting the field is the whole trigger.
const bareMounted = ref(false)

function mountBare() {
  bareMounted.value = false
  requestAnimationFrame(() => (bareMounted.value = true))
}

// 2 — an explicit range on an <input>.
const start = ref(6)
const end = ref(11)
const direction = ref<NonNullable<SelectTextOptions['direction']>>('forward')
const rangeEnabled = ref(false)
const field = useTemplateRef<HTMLInputElement>('field')

function selectRange() {
  // The directive selects; it never focuses. Do both from one handler.
  field.value?.focus()
  rangeEnabled.value = false
  requestAnimationFrame(() => (rangeEnabled.value = true))
}

// 3 — a <textarea>. `value` is one string, so a range walks straight over the
// line break; leaving start/end off selects everything.
const note = ref('first line of the textarea\nsecond line, same value')
const noteRange = ref<{ start?: number; end?: number }>({})
const noteEnabled = ref(false)
const area = useTemplateRef<HTMLTextAreaElement>('area')

function selectNote(next: { start?: number; end?: number }) {
  noteRange.value = next
  area.value?.focus()
  noteEnabled.value = false
  requestAnimationFrame(() => (noteEnabled.value = true))
}

// 4 — setSelectionRange throws on type="number"; the directive falls back.
const numberEnabled = ref(false)
const numberField = useTemplateRef<HTMLInputElement>('numberField')

function selectNumber() {
  numberField.value?.focus()
  numberEnabled.value = false
  requestAnimationFrame(() => (numberEnabled.value = true))
}
</script>

<template>
  <div class="pg-col">
    <div class="pg-box pg-col">
      <span class="pg-label"><strong>Bare binding — fires on mount</strong></span>
      <input
        v-if="bareMounted"
        v-select-text
        class="pg-input"
        value="Selected the moment I mounted"
        style="width: 24rem"
        @select-text="onSelectText"
      />
      <p v-else class="pg-kv">— not mounted yet —</p>
      <div class="pg-row">
        <button class="pg-btn pg-btn--primary" @click="mountBare">Mount it</button>
        <span class="pg-muted">
          Same as <code>v-select-text="true"</code>. Mounted here on demand only so this card does
          not fight the other eleven for the page's one selection.
        </span>
      </div>
    </div>

    <div class="pg-box pg-col">
      <span class="pg-label"><strong>Range and direction on an &lt;input&gt;</strong></span>
      <input
        ref="field"
        v-select-text="{ enabled: rangeEnabled, start, end, direction }"
        class="pg-input"
        value="Hello World from v-select-text"
        style="width: 24rem"
        @select-text="onSelectText"
      />
      <div class="pg-row">
        <label class="pg-label">
          start
          <input v-model.number="start" class="pg-input" type="number" style="width: 5rem" />
        </label>
        <label class="pg-label">
          end
          <input v-model.number="end" class="pg-input" type="number" style="width: 5rem" />
        </label>
        <label class="pg-label">
          direction
          <select v-model="direction" class="pg-select">
            <option>forward</option>
            <option>backward</option>
            <option>none</option>
          </select>
        </label>
        <button class="pg-btn pg-btn--primary" @click="selectRange">Select range</button>
      </div>
    </div>

    <div class="pg-box pg-col">
      <span class="pg-label"><strong>A &lt;textarea&gt; range across two lines</strong></span>
      <textarea
        ref="area"
        v-model="note"
        v-select-text="{ enabled: noteEnabled, start: noteRange.start, end: noteRange.end }"
        class="pg-input"
        style="width: 24rem; height: 3.4rem; resize: vertical"
        @select-text="onSelectText"
      ></textarea>
      <div class="pg-row">
        <button class="pg-btn" @click="selectNote({ start: 11, end: 38 })">
          select 11–38 (over the line break)
        </button>
        <button class="pg-btn" @click="selectNote({})">select all (no offsets)</button>
      </div>
    </div>

    <div class="pg-box pg-col">
      <span class="pg-label"><strong>type="number" — the select() fallback</strong></span>
      <input
        ref="numberField"
        v-select-text="{ enabled: numberEnabled, start: 2, end: 5 }"
        class="pg-input"
        type="number"
        value="1234567890"
        style="width: 10rem"
        @select-text="onSelectText"
      />
      <div class="pg-row">
        <button class="pg-btn" @click="selectNumber">Ask for 2–5</button>
        <span class="pg-muted">
          <code>setSelectionRange</code> throws on <code>type="number"</code>, so the directive
          falls back to <code>select()</code> — watch the log report <code>0–10</code>.
        </span>
      </div>
    </div>

    <pre class="pg-log">{{ log.join('\n') || '— no selection yet —' }}</pre>

    <p class="pg-muted">
      These are the <code>setSelectionRange</code> paths: offsets index <code>value</code> directly,
      so no whitespace resolution is involved and a newline is just one character. The directive
      selects but never focuses — real apps drive focus and selection from the same handler, as
      every button here does. Click somewhere else afterwards: an input's highlight greys out on
      blur, while a selection over static text keeps its colour — it never needed focus.
    </p>
  </div>
</template>
