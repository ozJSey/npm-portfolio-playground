<script setup lang="ts">
import { ref } from 'vue'

const users = [
  { id: 1, email: 'ada@lovelace.dev' },
  { id: 2, email: 'grace@hopper.dev' },
  { id: 3, email: 'alan@turing.dev' },
  { id: 4, email: 'edsger@dijkstra.dev' },
]

// The ref is yours — the directive only fills it. Forward it to a store,
// provide/inject it, whatever. Newest entry is always index 0.
const history = ref<string[]>([])
</script>

<template>
  <div class="split">
    <ul class="rows">
      <li v-for="u in users" :key="u.id" v-copy="history">{{ u.email }}</li>
    </ul>

    <aside class="pg-box">
      <strong>history</strong>
      <span class="pg-muted"> ({{ history.length }} entries, newest first)</span>
      <ol v-if="history.length" class="log">
        <li v-for="(entry, i) in history" :key="i">{{ entry }}</li>
      </ol>
      <p v-else class="pg-muted">Nothing copied yet.</p>
      <button class="pg-btn" :disabled="!history.length" @click="history = []">Clear</button>
      <p class="pg-muted">
        <code>dedupe</code> is on by default, so clicking the same row twice does not add a second
        entry — it moves the existing one back to the top. Demo 15 shows what that costs when two
        labelled sources share one history.
      </p>
    </aside>
  </div>
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
}
@media (max-width: 640px) {
  .split {
    grid-template-columns: 1fr;
  }
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.rows li {
  font-family: var(--mono);
  font-size: 0.85rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}
.rows li[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
.log {
  font-family: var(--mono);
  font-size: 0.78rem;
  margin: 0.5rem 0;
  padding-left: 1.2rem;
}
</style>
