<script setup lang="ts">
import { ref } from 'vue'

const sentence = 'The quick brown fox jumps over the lazy dog.'
const end = ref(5)
const edgeOn = ref(false)
const alwaysOn = ref(false)

function grow(which: 'edge' | 'always') {
  end.value = end.value >= sentence.length ? 5 : Math.min(end.value + 6, sentence.length)
  if (which === 'edge') edgeOn.value = true
  else alwaysOn.value = true
}
</script>

<template>
  <div class="pg-col">
    <div class="pg-row">
      <p v-select-text="{ enabled: edgeOn, start: 0, end, trigger: 'edge' }" class="host">
        {{ sentence }}
      </p>
      <button class="pg-btn" @click="grow('edge')">end = {{ end }} · trigger 'edge'</button>
      <span class="pg-muted">stays at whatever its one edge selected</span>
    </div>

    <div class="pg-row">
      <p v-select-text="{ enabled: alwaysOn, start: 0, end, trigger: 'always' }" class="host">
        {{ sentence }}
      </p>
      <button class="pg-btn pg-btn--primary" @click="grow('always')">
        end = {{ end }} · trigger 'always'
      </button>
      <span class="pg-muted">re-selects on every update</span>
    </div>

    <p class="pg-muted">
      Press the <code>'edge'</code> button twice: the first press is the <code>false → true</code>
      transition and selects <code>0–end</code>, the second moves <code>end</code> but leaves the
      highlight exactly where it was. Then press the <code>'always'</code> button — from there on
      <em>either</em> button repaints that paragraph, because <code>'always'</code> re-runs on every
      update while <code>enabled</code> stays <code>true</code>. That is what you want when the
      range, or the text under it, moves and the selection should follow; a document holds one
      selection at a time, so the top paragraph goes dark once the bottom one takes over.
    </p>
  </div>
</template>

<style scoped>
.host {
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  margin: 0;
  flex: 1 1 20rem;
  max-width: 26rem;
  background: #fff;
}
</style>
