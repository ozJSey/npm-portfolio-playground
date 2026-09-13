<script setup lang="ts">
import { ref } from 'vue'

const tabs = ['Overview', 'Pricing', 'Docs', 'Changelog']
const selected = ref('Overview')
const followFocus = ref(true)

function onMove(event: Event) {
  // Automatic activation: the tab under focus becomes the selected tab. The
  // directive moves focus; choosing what that means is the app's job.
  if (!followFocus.value) return
  if (!(event instanceof CustomEvent)) return
  selected.value = (event.detail.item.textContent || '').trim()
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input type="checkbox" v-model="followFocus" />
      selection follows focus (APG "automatic activation")
    </label>
  </div>

  <div class="tabs" role="tablist" aria-label="Package" v-keyboard-navigation
    @keyboard-navigate="onMove">
    <button v-for="tab in tabs" :key="tab" role="tab" class="tab" :aria-selected="selected === tab"
      :tabindex="-1" @click="selected = tab">
      {{ tab }}
    </button>
  </div>

  <div class="panel" role="tabpanel">
    <strong>{{ selected }}</strong>
    <p class="pg-muted">Panel content for {{ selected }}.</p>
  </div>

  <p class="pg-muted">
    A tablist wraps by default — arrow past <em>Changelog</em> and you land on <em>Overview</em>.
    The directive writes <code>tabindex</code> and nothing else: <code>aria-selected</code> is set
    by the <code>keyboard-navigate</code> handler above, or by the click, exactly as you decide.
  </p>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0.15rem;
  border-bottom: 2px solid #e6e9f2;
}
.tab {
  border: none;
  background: none;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.85rem;
  color: #5b6478;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.tab[aria-selected='true'] {
  color: #3730a3;
  border-bottom-color: #4f46e5;
  font-weight: 600;
}
.tab:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
.panel {
  padding: 0.8rem 0.2rem;
}
.panel p {
  margin: 0.2rem 0 0;
}
</style>
