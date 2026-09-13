<script setup lang="ts">
import { ref } from 'vue'

const offsetTop = ref(56)
const go = ref(false)
const anchor = ref(3)

function jumpTo(n: number) {
  anchor.value = n
  go.value = false
  requestAnimationFrame(() => (go.value = true))
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      offset.top
      <input v-model.number="offsetTop" class="pg-input" type="number" step="8" style="width: 5rem" />
      px
    </label>
    <button v-for="n in 5" :key="n" class="pg-btn" @click="jumpTo(n)">section {{ n }}</button>
  </div>

  <div id="offset-pane" class="pane pg-scroller">
    <header class="sticky">sticky header — {{ offsetTop }}px tall region to clear</header>
    <section
      v-for="n in 5"
      :key="n"
      class="sec"
      v-scroll-into-view="{
        condition: go && anchor === n,
        container: '#offset-pane',
        block: 'start',
        offset: { top: offsetTop },
      }"
    >
      <h5>Section {{ n }}</h5>
      <p v-for="l in 4" :key="l" class="pg-muted">body line {{ l }}</p>
    </section>
  </div>

  <p class="pg-muted">
    Set the offset to 0 and jump again — the heading slides under the sticky header. With a
    <code>container</code> the offset is subtracted from the computed scrollTop; without one the
    directive writes an ephemeral <code>scroll-margin-top</code> and restores the previous inline
    value afterwards.
  </p>
</template>

<style scoped>
.pane {
  position: relative;
  height: 220px;
}
.sticky {
  position: sticky;
  top: 0;
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  background: #3730a3;
  color: #fff;
  font-size: 0.8rem;
  z-index: 2;
}
.sec {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #eef1f6;
}
.sec h5 {
  margin: 0 0 0.25rem;
}
.sec p {
  margin: 0;
}
</style>
