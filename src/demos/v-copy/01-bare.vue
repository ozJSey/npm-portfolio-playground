<script setup lang="ts">
const emails = ['ada@lovelace.dev', 'grace@hopper.dev', 'alan@turing.dev']
</script>

<template>
  <p class="pg-muted">
    Click a row. The directive reads <code>textContent</code> live at copy time and trims it.
  </p>

  <ul class="rows">
    <li v-for="email in emails" :key="email" v-copy>{{ email }}</li>
  </ul>
</template>

<style scoped>
.rows {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-width: 22rem;
}
.rows li {
  font-family: var(--mono);
  font-size: 0.85rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}
.rows li:hover {
  background: #f4f6fb;
}
/* The directive sets [data-copied] for 1.5s — pure CSS confirmation. */
.rows li[data-copied] {
  border-color: #16a34a;
}
.rows li[data-copied]::after {
  content: ' ✓ copied';
  color: #16a34a;
}
</style>
