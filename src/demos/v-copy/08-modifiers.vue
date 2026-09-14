<script setup lang="ts">
import { ref } from 'vue'

const outerClicks = ref(0)
const linkClicks = ref(0)
</script>

<template>
  <div class="pg-col">
    <!-- .once — every listener detaches after the trigger fires once, and stays
         detached: a later re-render must not put the listeners, the tabindex or
         the role="button" back on an element that no longer copies. -->
    <button class="pg-btn" v-copy.once="'copied exactly once'">
      .once — click twice, only the first copies
    </button>

    <!-- .trim — textContent is always trimmed; .trim also trims an explicit source. -->
    <button class="pg-btn" v-copy.trim="'   padded source   '">
      .trim — copies "padded source" without the spaces
    </button>

    <!-- .stop — the click never reaches the counting parent. -->
    <div class="outer" @click="outerClicks++">
      parent click count: {{ outerClicks }}
      <button class="pg-btn" v-copy.stop="'stopped'">.stop (parent stays put)</button>
      <button class="pg-btn" v-copy="'not stopped'">no modifier (parent increments)</button>
    </div>

    <!-- .prevent — default action suppressed; the anchor does not navigate. -->
    <p class="pg-muted" style="margin: 0">
      link clicks: {{ linkClicks }} — the URL bar never gains <code>#never</code>
      <a href="#never" v-copy.prevent="'link text'" @click="linkClicks++">
        .prevent — copies without following the href
      </a>
    </p>
  </div>
</template>

<style scoped>
.outer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  border: 1px dashed var(--stage-border);
  border-radius: 8px;
  padding: 0.6rem;
  font-size: 0.82rem;
  color: #5b6478;
}
a {
  color: #4f46e5;
  margin-left: 0.4rem;
}
</style>
