<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useScrollIntoView } from '@ozjsey/v-scroll-into-view'

const sectionRef = useTemplateRef<HTMLElement>('section')

const scroller = useScrollIntoView({
  target: () => sectionRef.value,
  options: {
    behavior: 'smooth',
    block: 'start',
    container: '#composable-pane',
    offset: { top: 16 },
  },
})

function instant() {
  // update() MERGES — container and offset survive.
  scroller.update({ behavior: 'instant' })
  scroller.scroll()
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" @click="scroller.scroll()">scroll()</button>
    <button class="pg-btn" @click="instant">update({ behavior: 'instant' }) + scroll()</button>
    <button class="pg-btn" :disabled="scroller.state.value === 'idle'" @click="scroller.cancel()">
      cancel()
    </button>
    <span class="pg-chip">state: {{ scroller.state.value }}</span>
  </div>

  <div id="composable-pane" class="pg-scroller">
    <p v-for="i in 16" :key="i" class="filler">filler {{ i }}</p>
    <section ref="section" class="target">📍 composable target</section>
    <p v-for="i in 16" :key="`t${i}`" class="filler">filler {{ i + 16 }}</p>
  </div>

  <p class="pg-muted">
    <code>cancel()</code> only has something to cancel between the <code>scroll()</code> call and
    the next animation frame, so the button is almost always disabled — that is the point of the
    reactive <code>state</code>.
  </p>
</template>

<style scoped>
.filler {
  margin: 0;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: #97a0b4;
  border-bottom: 1px solid #eef1f6;
}
.target {
  padding: 0.7rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
</style>
