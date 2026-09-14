<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import type { KeyboardNavigationApi } from '@ozjsey/v-keyboard-navigation'

const cities = [
  'Amsterdam', 'Ankara', 'Athens', 'Barcelona', 'Berlin', 'Bern', 'Bratislava',
  'Brussels', 'Bucharest', 'Budapest', 'Copenhagen', 'Dublin', 'Hamburg',
  'Helsinki', 'Istanbul', 'Lisbon', 'Ljubljana', 'London', 'Madrid', 'Milan',
  'Munich', 'Oslo', 'Paris', 'Porto', 'Prague', 'Reykjavik', 'Riga', 'Rome',
  'Sofia', 'Stockholm', 'Tallinn', 'Valencia', 'Vienna', 'Vilnius', 'Warsaw',
  'Zagreb', 'Zurich',
]

// The api is how the input drives the list: the directive deliberately never
// touches a key pressed inside a text field, so a combobox has to forward the
// three keys the input does not own itself.
const api = ref<KeyboardNavigationApi>()

const query = ref('')
const chosen = ref('')
const opened = ref(false)
const pointer = ref('')
const focusHolder = ref('—')
const lastReason = ref('—')
const host = useTemplateRef<HTMLElement>('host')

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? cities.filter((c) => c.toLowerCase().includes(q)) : cities
})

// `activedescendant` because focus has to stay in the input: in roving-tabindex
// mode "active" *is* focus, and there is no way to point at a row without
// leaving the field the user is typing in.
const options = computed(() => ({
  activedescendant: true,
  hover: true,
  wrap: false,
  ref: api,
}))

/**
 * The directive writes `aria-activedescendant` on its host — the `<ul>`. A
 * combobox needs it on the element that actually holds focus, which is the
 * input, so the card mirrors it. Naming an element to carry the pointer is not
 * something the directive offers yet; see the README's known limitations.
 */
function readPointer() {
  pointer.value = host.value?.getAttribute('aria-activedescendant') ?? ''
  const el = document.activeElement
  focusHolder.value = el instanceof HTMLElement ? (el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '')) : '—'
}

onMounted(readPointer)

function onMove(event: Event) {
  if (!(event instanceof CustomEvent)) return
  lastReason.value = event.detail.reason
  opened.value = true
  readPointer()
}

function step(delta: number) {
  const handle = api.value
  if (!handle) return
  // The first ArrowDown lands *on* the first option rather than past it.
  if (!opened.value) {
    handle.focus(0)
    opened.value = true
  } else if (delta > 0) handle.next()
  else handle.previous()
  nextTick(readPointer)
}

function commit() {
  const item = api.value?.activeItem
  if (!item) return
  chosen.value = item.textContent?.trim() ?? ''
}

function onQuery() {
  opened.value = false
  nextTick(readPointer)
}
</script>

<template>
  <p class="pg-muted">
    <strong>The case the focus rule exists for.</strong> Type in the field, arrow through the list,
    then move the mouse over a row. The highlight follows the cursor and
    <em>focus never leaves the input</em> — keep typing and the letters still land in the field.
  </p>

  <div class="combo">
    <input id="combo-input" class="pg-input" type="text" role="combobox" aria-expanded="true"
      aria-controls="combo-list" aria-autocomplete="list" placeholder="Filter cities…"
      :aria-activedescendant="pointer" v-model="query" @input="onQuery"
      @keydown.down.prevent="step(1)" @keydown.up.prevent="step(-1)"
      @keydown.enter.prevent="commit" @focus="readPointer" @blur="readPointer" />

    <ul id="combo-list" ref="host" class="list" role="listbox" aria-label="Cities"
      v-keyboard-navigation="options" @keyboard-navigate="onMove">
      <li v-for="city in matches" :key="city" :id="`combo-${city}`" role="option" class="row"
        :aria-selected="chosen === city" @click="chosen = city">
        {{ city }}
      </li>
      <li v-if="!matches.length" class="row empty" aria-disabled="true">no match</li>
    </ul>
  </div>

  <p class="pg-kv">focus is on: <code class="focus-holder">{{ focusHolder }}</code></p>
  <p class="pg-kv">aria-activedescendant: <code class="pointer">{{ pointer || '—' }}</code></p>
  <p class="pg-kv">last reason: <code class="reason">{{ lastReason }}</code></p>
  <p class="pg-kv">chosen: <code class="chosen">{{ chosen || '—' }}</code></p>

  <p class="pg-muted">
    In roving-tabindex mode "active" <em>is</em> focus, so hover would have to blur the field to
    highlight a row. That is why hover <strong>never moves focus into the group</strong>: it moves
    the active marker, the roving <code>tabindex</code> and
    <code>aria-activedescendant</code>, and it takes the DOM focus with it only when the keyboard
    was already standing on one of the group's items — where there is nothing to steal and where
    leaving it behind would paint two highlights instead of one.
  </p>
  <p class="pg-muted">
    The input is <em>outside</em> the directive's host and drives it through the imperative api,
    because <code>keys.ts</code> refuses to claim any key pressed inside a text field — a rule this
    package will not bend, since a field the arrows can enter but never leave is a keyboard trap.
    A combobox is the one pattern where <kbd>↑</kbd><kbd>↓</kbd> genuinely belong to the list and
    not to the input, and forwarding three keys is the honest way to say so.
  </p>
</template>

<style scoped>
.combo {
  max-width: 320px;
}
.combo .pg-input {
  width: 100%;
  box-sizing: border-box;
}
.list {
  height: 180px;
  overflow-y: auto;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
  background: #fff;
}
.row {
  box-sizing: border-box;
  height: 30px;
  padding: 0 0.75rem;
  line-height: 30px;
  font-size: 0.85rem;
  border-bottom: 1px solid #f1f3f9;
  cursor: pointer;
}
.row[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.row[aria-selected='true']::after {
  content: ' ✓';
  color: #4f46e5;
}
.row.empty {
  color: #8a90a2;
  cursor: default;
}
</style>
