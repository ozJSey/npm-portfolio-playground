<script setup lang="ts">
import { computed, ref } from 'vue'

// The same component, twice on one page — the shape every real app has and
// the shape no unit test in this package had until 0.2.0.
const lists = [
  { id: 'left', name: 'Left list', prefix: 'L' },
  { id: 'right', name: 'Right list', prefix: 'R' },
]
const rows = Array.from({ length: 60 }, (_, i) => i + 1)

const documentWide = ref(false)

/**
 * Both lists are handed the *same* options object, exactly as two instances of
 * one component would be.
 *
 *   scoped        container: '.scroll-pane'  → each host resolves its own
 *   document-wide container: () => document.querySelector('.scroll-pane')
 *
 * The second is what a bare selector did in 0.1.0, written out loud. The
 * getter form is the only way to point at an element outside the group now,
 * which is the point: you have to mean it.
 */
const options = computed(() => ({
  scroll: {
    container: documentWide.value
      ? () => document.querySelector<HTMLElement>('.scroll-pane')
      : '.scroll-pane',
  },
}))

const tops = ref<Record<string, number>>({ left: 0, right: 0 })
function measure() {
  const next: Record<string, number> = {}
  for (const list of lists) {
    const pane = document.querySelector<HTMLElement>(`[data-pane="${list.id}"]`)
    next[list.id] = pane ? Math.round(pane.scrollTop) : -1
  }
  tops.value = next
}

function reset() {
  for (const list of lists) {
    const pane = document.querySelector<HTMLElement>(`[data-pane="${list.id}"]`)
    if (pane) pane.scrollTop = 0
  }
  measure()
}
</script>

<template>
  <p class="pg-muted">
    <strong>Which box scrolls.</strong> Two instances, one options object, one selector. Click
    <em>R 1</em> in the right-hand list, hold <kbd>↓</kbd>, then press <em>Measure</em>. Only the
    right pane's <code>scrollTop</code> should move.
  </p>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input type="checkbox" v-model="documentWide" />
      resolve document-wide (<code>() =&gt; document.querySelector('.scroll-pane')</code>) — what
      <code>0.1.0</code> did with a bare selector
    </label>
    <button class="pg-btn" @click="measure">Measure</button>
    <button class="pg-btn" @click="reset">Reset</button>
  </div>

  <div class="pg-row" style="align-items: flex-start; gap: 1.2rem">
    <div v-for="list in lists" :key="list.id">
      <h5 class="head">{{ list.name }}</h5>
      <div class="scroll-pane" :data-pane="list.id">
        <ul class="list" role="listbox" :aria-label="list.name" v-keyboard-navigation="options">
          <li v-for="n in rows" :key="n" role="option" class="row" :aria-selected="false">
            {{ list.prefix }} {{ n }}
          </li>
        </ul>
      </div>
      <p class="pg-kv">
        scrollTop <code :class="`top-${list.id}`">{{ tops[list.id] }}</code>
      </p>
    </div>
  </div>

  <p class="pg-muted">
    Tick the box and try the right-hand list again: the <strong>left</strong> pane scrolls and the
    right one never moves. That was live in <code>0.1.0</code> for every bare selector, because
    <code>resolveContainer</code> called <code>document.querySelector</code> — the first match on
    the page, not this group's. The maths downstream
    (<code>relTop = itemRect.top - boxRect.top + container.scrollTop</code>) was then relative to a
    box that does not contain the item, so it wrote an arbitrary <code>scrollTop</code> onto a
    stranger's element.
  </p>
  <p class="pg-muted">
    Untick it and a bare <code>'.scroll-pane'</code> resolves against <em>this</em> host: the host
    itself if it matches, else its nearest matching ancestor, else a descendant. The
    <code>':scope &lt;sel&gt;'</code> form means a <strong>descendant</strong>, the way it does in
    CSS — it used to be <code>el.closest()</code>, an <em>ancestor</em>, and out through the host
    as well. Nothing in the string forms can leave the group any more; the getter above is how you
    name a stranger, out loud.
  </p>
</template>

<style scoped>
.head {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.scroll-pane {
  width: 150px;
  height: 160px;
  overflow-y: auto;
  box-shadow: inset 0 0 0 1px #dfe3ec;
  border-radius: 10px;
  background: #fff;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  box-sizing: border-box;
  height: 32px;
  padding: 0 0.6rem;
  line-height: 32px;
  font-size: 0.82rem;
  border-bottom: 1px solid #f1f3f9;
  cursor: pointer;
}
.row[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.row:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
</style>
