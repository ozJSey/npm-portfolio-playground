<script setup lang="ts">
import { ref } from 'vue'

const go = ref(false)
const detached = document.createElement('div') // never inserted into the document

const cases = [
  { label: "container: '' (empty selector)", opts: { container: '' } },
  { label: "container: '>>>' (invalid CSS)", opts: { container: '>>>' } },
  { label: "container: ':scope @@' (malformed)", opts: { container: ':scope @@' } },
  { label: "container: '#nope' (no such element)", opts: { container: '#nope' } },
  { label: 'container: detached element', opts: { container: detached } },
  { label: 'container: () => { throw }', opts: { container: () => { throw new Error('boom') } } },
]

function fire() {
  go.value = false
  requestAnimationFrame(() => (go.value = true))
}
</script>

<template>
  <div class="pg-col">
    <button class="pg-btn pg-btn--primary" @click="fire">
      Trigger every broken binding at once
    </button>

    <ul class="cases">
      <li v-for="c in cases" :key="c.label">
        <code>{{ c.label }}</code>
        <span v-scroll-into-view="{ condition: go, ...c.opts }" class="probe">no-op</span>
      </li>
    </ul>

    <!-- Non-boolean binding values are treated as "disabled" rather than crashing. -->
    <p class="pg-muted">
      Also inert: <code>v-scroll-into-view="null"</code>, <code>="42"</code>,
      <code>="'yes'"</code>.
    </p>
    <div class="pg-row">
      <span v-scroll-into-view="null" class="probe">null</span>
      <span v-scroll-into-view="42" class="probe">42</span>
      <span v-scroll-into-view="'yes'" class="probe">'yes'</span>
    </div>

    <p class="pg-muted">
      Nothing throws and the page does not move — a bad feature flag or runtime config cannot take
      down the render cycle. Since 1.3.0 it is not <em>silent</em> either: open the console and each
      broken <code>container</code> has said so once, in a sentence you can search for. Silence was
      the actual complaint — <code>container</code> deliberately refuses to fall back to native
      <code>scrollIntoView</code>, so a typo in a selector produced a scroll that never happened and
      nothing to grep for. Each element says each sentence once: through 1.3.0 the latch was
      global per message, so the FIRST element to reach one spent it for the session and every
      broken row after it was silent again — a diagnostic that looked like one. Six bindings
      are broken above and they all reach the same sentence; the console should hold six
      copies of it, not one.
    </p>
  </div>
</template>

<style scoped>
.cases {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
}
.cases li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.probe {
  font-size: 0.72rem;
  color: #6b7488;
  border: 1px dashed var(--stage-border);
  border-radius: 4px;
  padding: 0 0.35rem;
}
</style>
