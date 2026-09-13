<script setup lang="ts">
import { ref } from 'vue'

const duration = ref(2500)
</script>

<template>
  <div class="pg-col">
    <label class="pg-label">
      feedback duration
      <input v-model.number="duration" class="pg-input" type="number" step="250" min="0" style="width: 6rem" />
      ms
    </label>

    <!-- Custom class + duration. Options are reactive: change the number above. -->
    <button
      class="pg-btn flash-host"
      v-copy="{ source: 'custom feedback', feedback: { className: 'flash', duration } }"
    >
      .flash for {{ duration }}ms
    </button>

    <!-- Rename the attribute the directive toggles. -->
    <button class="pg-btn attr-host" v-copy="{ source: 'renamed attribute', feedback: { attribute: 'data-done' } }">
      [data-done] instead of [data-copied]
    </button>

    <!-- Opt out entirely — the copy still happens, silently. -->
    <button class="pg-btn" v-copy="{ source: 'no feedback at all', feedback: false }">
      feedback: false (copies, shows nothing)
    </button>
  </div>
</template>

<style scoped>
.flash-host.flash {
  background: #16a34a;
  border-color: #16a34a;
  color: #fff;
}
.attr-host[data-done] {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
</style>
