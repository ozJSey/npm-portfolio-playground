<script setup lang="ts">
import { ref } from 'vue'
import type { RichCopyEntry } from '@ozjsey/v-copy'

const max = ref(3)
const log = ref<RichCopyEntry[]>([])

const commands = [
  { key: 'npm', text: 'npm install @ozjsey/v-copy' },
  { key: 'pnpm', text: 'pnpm add @ozjsey/v-copy' },
  { key: 'yarn', text: 'yarn add @ozjsey/v-copy' },
  { key: 'bun', text: 'bun add @ozjsey/v-copy' },
]
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      max
      <input v-model.number="max" type="range" min="1" max="8" />
      {{ max }}
    </label>
    <button class="pg-btn" :disabled="!log.length" @click="log = []">Clear</button>
  </div>

  <div class="pg-row">
    <code
      v-for="c in commands"
      :key="c.key"
      class="cmd"
      v-copy="{ source: c.text, sink: log, max, rich: true, key: c.key }"
      >{{ c.text }}</code
    >
  </div>

  <pre class="pg-log" style="margin-top: 0.6rem">{{
    log.length
      ? log.map((e) => `[${e.key}] ${e.text}`).join('\n')
      : '— copy a few commands, then shrink max and copy again —'
  }}</pre>

  <p class="pg-muted">
    The config form takes the history target as <code>sink</code> — same array semantics as the
    bound-ref form in demo 3, but combinable with every other option. <code>max</code> caps the
    array (oldest entries evicted on the next copy); <code>key</code> labels rich entries without
    the directive-argument syntax of demo 4.
  </p>
</template>

<style scoped>
.cmd {
  font-family: var(--mono);
  font-size: 0.82rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
.cmd[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
</style>
