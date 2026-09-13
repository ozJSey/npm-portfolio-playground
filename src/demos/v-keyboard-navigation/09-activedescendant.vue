<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'

const cities = [
  'Amsterdam', 'Ankara', 'Athens', 'Berlin', 'Bern', 'Bratislava', 'Brussels',
  'Bucharest', 'Budapest', 'Copenhagen', 'Dublin', 'Helsinki', 'Istanbul',
  'Lisbon', 'Ljubljana', 'London', 'Madrid', 'Oslo', 'Paris', 'Prague',
  'Reykjavik', 'Riga', 'Rome', 'Sofia', 'Stockholm', 'Tallinn', 'Vienna',
  'Vilnius', 'Warsaw', 'Zagreb',
]

const mode = ref<'activedescendant' | 'roving'>('activedescendant')
const selected = ref('')
const pointer = ref('—')
const host = useTemplateRef<HTMLElement>('host')

const options = computed(() => ({ activedescendant: mode.value === 'activedescendant' }))

function readPointer() {
  pointer.value = host.value?.getAttribute('aria-activedescendant') || '(roving tabindex — no pointer)'
}

// Read it once on mount too: the attribute is already set before any key is
// pressed, and a readout showing "—" over a live attribute would be a lie.
onMounted(readPointer)

// After the mode switch has been through the directive's updated hook, not
// before it.
function onModeChange() {
  nextTick(readPointer)
}

function onMove(event: Event) {
  if (!(event instanceof CustomEvent)) return
  readPointer()
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      mode
      <select v-model="mode" class="pg-select" @change="onModeChange">
        <option value="activedescendant">aria-activedescendant</option>
        <option value="roving">roving tabindex (default)</option>
      </select>
    </label>
    <span class="pg-muted">focus the list, then use the arrows</span>
  </div>

  <ul ref="host" class="list" role="listbox" aria-label="Cities"
    v-keyboard-navigation="options" @keyboard-navigate="onMove">
    <li v-for="city in cities" :key="city" :id="`city-${city}`" role="option" class="row"
      :aria-selected="selected === city" @click="selected = city">
      {{ city }}
    </li>
  </ul>

  <p class="pg-kv">aria-activedescendant: {{ pointer }}</p>
  <p class="pg-kv">selected: {{ selected || '—' }}</p>

  <p class="pg-muted">
    In <code>aria-activedescendant</code> mode the DOM focus never leaves the
    <code>&lt;ul&gt;</code>, so <code>:focus</code> matches nothing inside it — the highlight you
    see is <code>[data-keyboard-navigation-item="active"]</code>, which is why the directive
    publishes that hook. Selection is still yours: click a city to set
    <code>aria-selected</code>.
  </p>
  <p class="pg-muted">
    This is also the mode where the browser scrolls <em>nothing at all</em> — the APG names
    scrolling as the developer's responsibility here, and the directive takes it. Switch modes and
    arrow to the bottom: both follow, and one of them would not without this package.
  </p>
</template>

<style scoped>
.list {
  /* Six 36px rows exactly, so the box never cuts a row in half. */
  height: 216px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
  background: #fff;
}
.list:focus-visible {
  outline: 2px solid #4f46e5;
}
.row {
  box-sizing: border-box;
  height: 36px;
  padding: 0 0.75rem;
  line-height: 36px;
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
</style>
