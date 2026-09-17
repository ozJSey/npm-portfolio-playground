<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import {
  libraries,
  demoCount,
  orphanedDemoFiles,
  missingDemoFiles,
  manifestProblems,
} from './registry'
import type { Demo } from './registry'
import { cardHref, matchesCard, parseHash } from './card-link'
import { libraryFailures } from './libraries'
import { nextTabIndex } from './tablist'
import { clearAllEdits, editedDemoIds } from './storage'
import DemoCard from './components/DemoCard.vue'
import Documentation from './components/Documentation.vue'

const activeId = ref(libraries[0]?.id ?? '')
/**
 * Every project has two views (`tickets/DOCS-1`): the cards, and the package's
 * own README rendered.
 *
 * The URL shape is fixed by `tickets/_STANDARDS.md` — `#<library-id>` is the
 * playground, and published READMEs already link to it, so that form must keep
 * meaning what it means. Documentation is `#<library-id>/docs`, which leaves
 * `#<library-id>/<file>.vue` free for the per-card deep link DOCS-1 still owes.
 */
type View = 'playground' | 'docs'
const view = ref<View>('playground')
const dirtyIds = ref(new Set(editedDemoIds()))
const filter = ref('')

/**
 * DOCS-4 — the third meaning of `sub`, and the one that ships.
 *
 * `#<library-id>/<card>` selects a tab *and* points at one card. Published
 * READMEs use it to link a paragraph to the card that demonstrates it, so these
 * strings live inside tarballs on other people's disks; `src/card-link.ts`
 * explains why the segment is a slug and what that commits us to.
 *
 * Two pieces of state, because a link can be right or stale and both have to be
 * visible:
 *   - `deepLinkedFile` is the card that was asked for and found. It is marked
 *     on screen and scrolled to, and the rest of the tab is left exactly where
 *     it was — someone arriving from a README usually wants the neighbours too.
 *   - `unknownCard` is a segment that matched nothing. It degrades to the tab
 *     and says so, because a stale link in a published README cannot be fixed
 *     for the reader who already has it; a blank page would be the one outcome
 *     worse than the link not existing.
 */
const deepLinkedFile = ref('')
const unknownCard = ref('')

/**
 * Where the libraries on this page actually came from, in words — sibling
 * sources, sibling dist builds, or the published npm packages. Computed in
 * `vite.config.ts`, which is the only place that knows whether an alias was
 * installed. It replaces a hardcoded "sources from ../<package>/" that the
 * deployed site printed while running none of them (DOCS-6).
 */
const origin = __PLAYGROUND_ORIGIN__
// ?editors=open mounts every card with its editor visible — used by the smoke
// test to catch failures that only occur when CodeMirror instantiates.
const editorsOpen = new URLSearchParams(location.search).get('editors') === 'open'

const active = computed(() => libraries.find((l) => l.id === activeId.value) ?? libraries[0])

/**
 * PG-22. A library whose `import()` failed, or whose build exported something
 * Vue cannot register, is scoped to its own tab instead of blanking the app —
 * but it is scoped *loudly*: a summary on every tab so it cannot be missed by
 * clicking elsewhere, and an error card in place of this tab's demos, because
 * every one of them would otherwise fail for the same reason, forty lines from
 * the cause.
 *
 * `manifest.pkg` is the npm specifier; `libraries.ts` keys failures by the same
 * string, which is why the id/pkg split in `registry.ts` matters here.
 */
const failedLibraries = libraryFailures
const activeFailure = computed(() => failedLibraries.find((f) => f.specifier === active.value.pkg))

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
  view.value = 'playground'
  clearDeepLink()
  location.hash = id
  window.scrollTo({ top: 0 })
}

function showView(next: View) {
  view.value = next
  clearDeepLink()
  location.hash = next === 'docs' ? `${activeId.value}/docs` : activeId.value
  window.scrollTo({ top: 0 })
}

/* --------------------------------------------------------------------------
 * Two real tab strips
 *
 * Both were `role="tablist"` already and neither behaved like one: every tab
 * was its own tab stop and no arrow key moved between them. `src/tablist.ts`
 * says why that particular lie is embarrassing on this particular site.
 *
 * Ids are computed rather than collected through template refs, because they
 * are needed anyway — `aria-controls` on the tab and `aria-labelledby` on the
 * panel are what tie the two halves together for a screen reader, and once the
 * id exists, `getElementById` is a shorter path to "focus the tab I just
 * selected" than a ref array.
 * -------------------------------------------------------------------------- */
const VIEWS = ['playground', 'docs'] as const
const VIEW_LABELS: Record<View, string> = { playground: 'Playground', docs: 'Documentation' }

const libTabId = (id: string) => `tab-library-${id}`
const viewTabId = (name: View) => `tab-view-${name}`

/** Selection follows focus (APG automatic activation), so move focus with it. */
function focusTab(id: string) {
  void nextTick(() => document.getElementById(id)?.focus())
}

function onLibraryKeydown(event: KeyboardEvent) {
  const index = libraries.findIndex((l) => l.id === activeId.value)
  const next = nextTabIndex(event.key, { count: libraries.length, index })
  if (next === null) return
  event.preventDefault()
  select(libraries[next].id)
  focusTab(libTabId(libraries[next].id))
}

function onViewKeydown(event: KeyboardEvent) {
  const next = nextTabIndex(event.key, { count: VIEWS.length, index: VIEWS.indexOf(view.value) })
  if (next === null) return
  event.preventDefault()
  showView(VIEWS[next])
  focusTab(viewTabId(VIEWS[next]))
}

function clearDeepLink() {
  deepLinkedFile.value = ''
  unknownCard.value = ''
}

/** Follow a card link from the sidebar — same URL a README would carry. */
function openCard(demo: Demo) {
  const href = cardHref(activeId.value, demo.file)
  if (location.hash === href) resolveCard(demo.file)
  else location.hash = href
}

function syncFromHash() {
  const { id, sub } = parseHash(location.hash)
  const library = libraries.find((l) => l.id === id)
  if (!library) return
  activeId.value = library.id
  view.value = sub === 'docs' ? 'docs' : 'playground'
  clearDeepLink()
  if (!sub || sub === 'docs') return

  const demo = library.demos.find((d) => matchesCard(d.file, sub))
  if (!demo) {
    unknownCard.value = sub
    return
  }
  // A filter left over from an earlier visit would hide the card the link asked
  // for, and "the link is broken" is what that looks like from outside.
  filter.value = ''
  resolveCard(demo.file)
}

function resolveCard(file: string) {
  deepLinkedFile.value = file
  void nextTick(() => anchorTo(file))
}

/**
 * Bring the deep-linked card into view, and keep it there while the page
 * settles.
 *
 * A single `scrollIntoView()` is not enough here and the reason is specific to
 * this app: every card compiles its SFC asynchronously, so the cards *above*
 * the target keep changing height for a second or so after the hash resolves.
 * Anchoring once lands you near the card and then drifts away from it — which
 * reads as a deep link that does not work.
 *
 * So: re-anchor every frame until the document height has been still for ten
 * consecutive frames, bounded by a deadline so a card that never stops
 * animating cannot hold the scroll position hostage. `scroll-margin-top` on
 * `.demo` keeps it clear of the sticky header.
 */
let anchorFrame = 0
function anchorTo(file: string) {
  cancelAnimationFrame(anchorFrame)
  const deadline = performance.now() + 2000
  let lastHeight = -1
  let stableFrames = 0
  const step = () => {
    // A newer link, a tab click or the docs view took over: stop pulling.
    if (deepLinkedFile.value !== file || view.value !== 'playground') return
    document.getElementById(`demo-${file}`)?.scrollIntoView({ block: 'start' })
    const height = document.documentElement.scrollHeight
    stableFrames = height === lastHeight ? stableFrames + 1 : 0
    lastHeight = height
    if (stableFrames >= 10 || performance.now() > deadline) return
    anchorFrame = requestAnimationFrame(step)
  }
  anchorFrame = requestAnimationFrame(step)
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
onBeforeUnmount(() => {
  cancelAnimationFrame(anchorFrame)
  window.removeEventListener('hashchange', syncFromHash)
})
</script>

<template>
  <header class="app-header">
    <div class="app-header__bar">
      <h1 class="app-header__title">v-* portfolio playground</h1>
      <span class="app-header__meta">
        {{ libraries.length }} libraries · {{ demoCount }} demos · {{ origin }}
      </span>
      <span class="app-header__spacer" />
      <!-- Filters demo cards, so it does nothing on the Documentation tab. -->
      <input
        v-if="view !== 'docs'"
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
    <nav class="tabs" role="tablist" aria-label="Library" @keydown="onLibraryKeydown">
      <button
        v-for="lib in libraries"
        :key="lib.id"
        class="tab"
        role="tab"
        :id="libTabId(lib.id)"
        :aria-selected="lib.id === active.id"
        :tabindex="lib.id === active.id ? 0 : -1"
        aria-controls="library-panel"
        @click="select(lib.id)"
      >
        {{ lib.id }}<span class="tab__count">{{ lib.demos.length }}</span>
      </button>
    </nav>
  </header>

  <main class="layout">
    <div id="library-panel" role="tabpanel" :aria-labelledby="libTabId(active.id)">
      <!--
        PG-22. Rendered on every tab, with a stable class and a `data-package`
        per line, so `scripts/smoke.mjs` finds it in a `--dump-dom` snapshot of
        any URL and can name the package rather than reporting "No library tabs
        rendered".
      -->
      <section v-if="failedLibraries.length" class="pg-library-failures">
        <h2>
          {{ failedLibraries.length }} librar{{ failedLibraries.length === 1 ? 'y' : 'ies' }} failed to
          load ({{ origin }})
        </h2>
        <p
          v-for="failure in failedLibraries"
          :key="failure.specifier"
          class="pg-library-failure"
          :data-package="failure.specifier"
        >
          <strong>{{ failure.specifier }}</strong> — {{ failure.message }}
        </p>
        <p class="pg-library-failures__hint">
          Every other tab still works. To verify yours around a broken sibling, restart the dev server
          with <code>PLAYGROUND_UNALIAS={{ failedLibraries.map((f) => f.dir).join(',') }}</code> —
          that package then resolves from <code>node_modules</code> instead of its source.
        </p>
      </section>

      <!--
        DOCS-4. A card link that resolves to nothing lands here rather than on a
        blank page. Above the library header, not down with the cards, because
        the reader following it is holding a README they cannot edit: the first
        thing they need is to be told the link is stale, and the second is the
        list of ids this tab does answer to so they can find the card by hand.
        A tab's `notes` can run to a dozen lines, and a notice underneath them
        is a notice nobody sees.
      -->
      <p
        v-if="unknownCard"
        class="demo__banner demo__banner--warn pg-unknown-card"
        :data-unknown-card="unknownCard"
      >
        No card “{{ unknownCard }}” on #{{ active.id }} — showing the whole tab instead. The link
        that brought you here is out of date. This tab has:
        {{ active.demos.map((d) => d.slug).join(', ') }}
      </p>

      <!--
        The tagline is the playground's own one-line pitch for the library. On
        the Documentation tab the README opens with its own H1 and its own
        opening sentence directly underneath this, saying the same thing twice
        in two voices. The heading stays either way — it is where you are — but
        the tagline steps aside for the document that does the job better.
      -->
      <div class="lib-head">
        <h2>{{ active.id }} <span class="lib-head__pkg">{{ active.pkg }}</span></h2>
        <p v-if="view !== 'docs'">{{ active.tagline }}</p>
      </div>

      <!--
        A real tab widget, not two buttons that toggle a boolean. The strip is
        one tab stop, arrows move within it (src/tablist.ts), each tab names the
        panel it controls and the panel names the tab that labels it — and it is
        drawn attached to that panel, sharing its top edge, so the relationship
        the ARIA describes is the one the eye sees.
      -->
      <div class="views">
        <div class="views__tabs" role="tablist" aria-label="View" @keydown="onViewKeydown">
          <button
            v-for="name in VIEWS"
            :key="name"
            class="views__tab"
            role="tab"
            :id="viewTabId(name)"
            :aria-selected="view === name"
            :tabindex="view === name ? 0 : -1"
            aria-controls="view-panel"
            @click="showView(name)"
          >
            {{ VIEW_LABELS[name] }}
            <span v-if="name === 'playground'" class="lib-head__viewcount">
              {{ active.demos.length }}
            </span>
          </button>
        </div>

        <div
          id="view-panel"
          class="views__panel"
          role="tabpanel"
          :aria-labelledby="viewTabId(view)"
        >
          <Documentation v-if="view === 'docs'" :library="active" />
          <template v-else>
            <ul v-if="active.notes?.length" class="lib-head__notes">
              <li v-for="note in active.notes" :key="note">{{ note }}</li>
            </ul>

            <p v-if="manifestProblems.length" class="demo__banner demo__banner--error">
              {{ manifestProblems.join(' ') }}
            </p>
            <p v-if="orphanedDemoFiles.length" class="demo__banner demo__banner--warn">
              Not listed in any manifest (so not rendered): {{ orphanedDemoFiles.join(', ') }}
            </p>
            <p v-if="missingDemoFiles.length" class="demo__banner demo__banner--warn">
              Listed in a manifest but missing on disk: {{ missingDemoFiles.join(', ') }}
            </p>

            <section v-if="activeFailure" class="demo pg-library-failure-card">
              <h3>{{ active.demos.length }} demos on this tab cannot run</h3>
              <p class="demo__banner demo__banner--error">
                {{ activeFailure.specifier }} failed to load — {{ activeFailure.message }}
              </p>
              <p class="pg-muted">
                The cards are not rendered because every one of them binds
                <code>v-{{ active.id.replace(/^v-/, '') }}</code>, and mounting them would bury this
                message under a screenful of resolve failures. Fix
                <code>{{ activeFailure.dir }}/</code>, or re-run with
                <code>PLAYGROUND_UNALIAS={{ activeFailure.dir }}</code>.
              </p>
            </section>

            <template v-else>
              <DemoCard
                v-for="demo in visibleDemos"
                :key="demo.id"
                :demo="demo"
                :library-id="active.id"
                :deep-linked="demo.file === deepLinkedFile"
                :initial-editor-open="editorsOpen"
                @dirty="onDirty"
              />

              <p v-if="!visibleDemos.length" class="pg-muted">
                No demo in this tab matches “{{ filter }}”.
              </p>
            </template>
          </template>
        </div>
      </div>
    </div>

    <aside v-if="view === 'playground'" class="toc">
      <p class="toc__title">{{ active.id }} demos</p>
      <!--
        The sidebar writes the canonical deep link (DOCS-4), so the URL in the
        address bar after a click is the one to paste into a README — and the
        router's scroll path is exercised every time anyone uses this list,
        rather than only by the links nobody clicks in-house.
      -->
      <a
        v-for="demo in active.demos"
        :key="demo.id"
        :href="cardHref(active.id, demo.file)"
        :class="{ 'is-dirty': dirtyIds.has(demo.id), 'is-current': demo.file === deepLinkedFile }"
        @click.prevent="openCard(demo)"
        >{{ demo.title }}</a
      >
    </aside>
  </main>
</template>
