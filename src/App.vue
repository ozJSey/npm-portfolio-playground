<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { libraries, demoCount, orphanedDemoFiles, missingDemoFiles } from './registry'
import { clearAllEdits, editedDemoIds } from './storage'
import DemoCard from './components/DemoCard.vue'

const activeId = ref(libraries[0]?.id ?? '')
const dirtyIds = ref(new Set(editedDemoIds()))
const filter = ref('')

const target = __PLAYGROUND_TARGET__
// ?editors=open mounts every card with its editor visible — used by the smoke
// test to catch failures that only occur when CodeMirror instantiates.
const editorsOpen = new URLSearchParams(location.search).get('editors') === 'open'

const active = computed(() => libraries.find((l) => l.id === activeId.value) ?? libraries[0])

const visibleDemos = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return active.value.demos
  return active.value.demos.filter((d) =>
    `${d.title} ${d.blurb} ${d.tags.join(' ')} ${(d.uses ?? []).join(' ')} ${d.file}`
      .toLowerCase()
      .includes(q),
  )
})

const dirtyCount = computed(() => dirtyIds.value.size)

function onDirty(demoId: string, dirty: boolean) {
  const next = new Set(dirtyIds.value)
  if (dirty) next.add(demoId)
  else next.delete(demoId)
  dirtyIds.value = next
}

function select(id: string) {
  activeId.value = id
  filter.value = ''
  location.hash = id
  window.scrollTo({ top: 0 })
}

function syncFromHash() {
  const id = location.hash.replace(/^#/, '')
  if (id && libraries.some((l) => l.id === id)) activeId.value = id
}

function resetAll() {
  if (!confirm(`Discard local edits in ${dirtyCount.value} demo(s)?`)) return
  clearAllEdits()
  location.reload()
}

onMounted(() => {
  syncFromHash()
  window.addEventListener('hashchange', syncFromHash)
})
onBeforeUnmount(() => window.removeEventListener('hashchange', syncFromHash))
</script>

<template>
  <header class="app-header">
    <div class="app-header__bar">
      <h1 class="app-header__title">v-* portfolio playground</h1>
      <span class="app-header__meta">
        {{ libraries.length }} libraries · {{ demoCount }} demos ·
        {{ target === 'dist' ? 'dist builds' : 'sources' }} from <code>../&lt;package&gt;/</code>
      </span>
      <span class="app-header__spacer" />
      <input
        v-model="filter"
        class="pg-input"
        type="search"
        placeholder="Filter demos in this tab…"
        style="background: var(--bg-inset); color: var(--text); border-color: var(--border)"
      />
      <button v-if="dirtyCount" class="demo__btn" @click="resetAll">
        Reset {{ dirtyCount }} edited demo(s)
      </button>
    </div>
    <nav class="tabs" role="tablist">
      <button
        v-for="lib in libraries"
        :key="lib.id"
        class="tab"
        role="tab"
        :aria-selected="lib.id === active.id"
        @click="select(lib.id)"
      >
        {{ lib.id }}<span class="tab__count">{{ lib.demos.length }}</span>
      </button>
    </nav>
  </header>

  <main class="layout">
    <div>
      <div class="lib-head">
        <h2>{{ active.id }}</h2>
        <p>{{ active.tagline }}</p>
        <span class="lib-head__status">{{ active.status }}</span>
        <ul v-if="active.notes?.length" class="lib-head__notes">
          <li v-for="note in active.notes" :key="note">{{ note }}</li>
        </ul>
      </div>

      <p v-if="orphanedDemoFiles.length" class="demo__banner demo__banner--warn">
        Not listed in any manifest (so not rendered): {{ orphanedDemoFiles.join(', ') }}
      </p>
      <p v-if="missingDemoFiles.length" class="demo__banner demo__banner--warn">
        Listed in a manifest but missing on disk: {{ missingDemoFiles.join(', ') }}
      </p>

      <DemoCard
        v-for="demo in visibleDemos"
        :key="demo.id"
        :demo="demo"
        :initial-editor-open="editorsOpen"
        @dirty="onDirty"
      />

      <p v-if="!visibleDemos.length" class="pg-muted">No demo in this tab matches “{{ filter }}”.</p>
    </div>

    <aside class="toc">
      <p class="toc__title">{{ active.id }} demos</p>
      <a
        v-for="demo in active.demos"
        :key="demo.id"
        :href="`#demo-${demo.file}`"
        :class="{ 'is-dirty': dirtyIds.has(demo.id) }"
        >{{ demo.title }}</a
      >
    </aside>
  </main>
</template>
