<script setup lang="ts">
import { reactive } from 'vue'
import type { CopyController } from '@ozjsey/v-copy'

// A reactive object bound to the directive is enriched IN PLACE with
// copy() / clear() and the reactive copied / history / last members.
// This is the "scoped slot from a directive" form — no composable.
const ctrl = reactive<CopyController>({ max: 5 })

const snippet = 'npm install @ozjsey/v-copy'
</script>

<template>
  <code class="snippet" v-copy="ctrl">{{ snippet }}</code>

  <div class="pg-row" style="margin-top: 0.75rem">
    <button class="pg-btn pg-btn--primary" @click="ctrl.copy?.()">ctrl.copy()</button>
    <button class="pg-btn" @click="ctrl.copy?.('overridden text')">copy('overridden text')</button>
    <button class="pg-btn" :disabled="!ctrl.history?.length" @click="ctrl.clear?.()">
      ctrl.clear()
    </button>
    <span v-if="ctrl.copied" class="pg-chip">copied ✓</span>
  </div>

  <dl class="kv">
    <dt>ctrl.copied</dt><dd>{{ ctrl.copied ?? false }}</dd>
    <dt>ctrl.last</dt><dd>{{ ctrl.last ?? '—' }}</dd>
    <dt>ctrl.history</dt><dd>{{ ctrl.history?.length ?? 0 }} / max {{ ctrl.max }}</dd>
  </dl>
</template>

<style scoped>
.snippet {
  display: inline-block;
  font-family: var(--mono);
  background: #f4f6fb;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}
.snippet[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  font-family: var(--mono);
  font-size: 0.78rem;
  margin: 0.9rem 0 0;
}
.kv dt {
  color: #6b7488;
}
.kv dd {
  margin: 0;
}
</style>
