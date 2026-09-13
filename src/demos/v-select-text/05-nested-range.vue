<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import type { SelectTextEventDetail, SelectTextOptions } from 'v-select-text'

const start = ref(13)
const end = ref(53)
const direction = ref<NonNullable<SelectTextOptions['direction']>>('forward')
const enabled = ref(false)
const detail = ref<SelectTextEventDetail | null>(null)
const rendered = ref('')

const quote = useTemplateRef<HTMLElement>('quote')

// The same rule the default `whitespace: 'collapse'` applies: runs of ASCII
// whitespace count as one space, leading/trailing whitespace is dropped. That
// is the string `start` / `end` are indices into — not `textContent`, which
// still counts the formatting space Vue's compiler leaves around it.
function renderedText(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/[\t\n\f\r ]+/g, ' ').trim()
}

onMounted(() => {
  if (quote.value) rendered.value = renderedText(quote.value)
})

function select() {
  // 'edge' fires on false → true, so round-trip to re-run with the new range.
  enabled.value = false
  requestAnimationFrame(() => (enabled.value = true))
}

function selectRange(nextStart: number, nextEnd: number) {
  start.value = nextStart
  end.value = nextEnd
  select()
}

function onSelectText(e: Event) {
  detail.value = (e as CustomEvent<SelectTextEventDetail>).detail
}

const summary = computed(() => {
  const d = detail.value
  if (!d) return '— nothing selected yet —'
  return [
    `kind=${d.kind} start=${d.start} end=${d.end} direction=${d.direction}`,
    `text=${JSON.stringify(d.text)}`,
  ].join('\n')
})
</script>

<template>
  <div class="pg-col">
    <p
      ref="quote"
      v-select-text="{ enabled, start, end, direction }"
      class="quote"
      @select-text="onSelectText"
    >
      Ship it with <strong>a <span class="tag">v-select-text</span> range</strong> that crosses
      <em>every nested node</em> in one go.
    </p>

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
      <button class="pg-btn pg-btn--primary" @click="select">Select</button>
    </div>

    <div class="pg-row">
      <span class="pg-chip">rendered length {{ rendered.length }}</span>
      <button class="pg-btn" @click="selectRange(-5, 28)">start -5 → clamps to 0</button>
      <button class="pg-btn" @click="selectRange(15, 999)">end 999 → clamps to length</button>
      <button class="pg-btn" @click="selectRange(53, 13)">start &gt; end → swaps</button>
    </div>

    <pre class="pg-log">{{ summary }}</pre>

    <p class="pg-muted">
      Offsets are flat indices into the text as rendered ({{ rendered.length }} characters here),
      which a <code>TreeWalker</code> maps back onto <code>(textNode, offset)</code> pairs — that is
      how one range covers the <code>&lt;strong&gt;</code>, the <code>&lt;span&gt;</code> nested
      inside it and the <code>&lt;em&gt;</code> after it. <code>start</code> clamps to 0,
      <code>end</code> clamps to the length, <code>start &gt; end</code> swaps silently, and the
      event reports what was actually resolved.
    </p>
  </div>
</template>

<style scoped>
.quote {
  border: 1px solid var(--stage-border);
  border-left: 3px solid #4f46e5;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  margin: 0;
  max-width: 34rem;
  line-height: 1.6;
}
.tag {
  font-family: var(--mono);
  font-size: 0.9em;
}
</style>
