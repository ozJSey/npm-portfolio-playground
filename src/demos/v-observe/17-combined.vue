<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { MutateEvent, ResizeEvent } from 'v-observe'

const scroller = useTemplateRef<HTMLElement>('scroller')
const host = useTemplateRef<HTMLElement>('host')
const stateAttr = ref('—')
const label = ref('idle')
const items = ref(['one'])

function refreshAttr() {
  stateAttr.value = host.value?.getAttribute('data-observe-state') ?? '—'
}

function onResize(e: ResizeEvent) {
  if (e.mode === 'tick') label.value = `${Math.round(e.to.width)}px · ${e.bracket}`
  refreshAttr()
}
function onMutate(_e: MutateEvent) {
  refreshAttr()
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn" @click="items.push(`item ${items.length + 1}`)">Add child</button>
    <button class="pg-btn" :disabled="items.length < 2" @click="items.pop()">Remove child</button>
    <button class="pg-btn" @click="refreshAttr">Read the attribute</button>
  </div>

  <div ref="scroller" class="pg-scroller" style="height: 190px">
    <p v-for="i in 4" :key="i" class="filler">scroll me {{ i }}</p>

    <div
      ref="host"
      class="host"
      v-observe="{
        intersect: { root: scroller, on: refreshAttr },
        resize: { breakpoints: { sm: 0, md: 320, lg: 520 }, handler: onResize },
        mutate: { on: ['children:added', 'children:removed'], handler: onMutate },
      }"
    >
      <strong>{{ label }}</strong>
      <span v-for="item in items" :key="item" class="pg-chip">{{ item }}</span>
    </div>

    <p v-for="i in 6" :key="`b${i}`" class="filler">scroll me {{ i + 4 }}</p>
  </div>

  <p class="pg-kv" style="margin-top: 0.5rem">data-observe-state = "{{ stateAttr }}"</p>
  <p class="pg-muted">
    Resize the host (drag its corner), add a child, scroll it out of view — each mode owns exactly
    one segment of the attribute and never overwrites the others.
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
.host {
  margin: 0.5rem;
  padding: 0.9rem;
  width: 280px;
  resize: horizontal;
  overflow: auto;
  border: 2px solid #b9c1d4;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  background: #fff;
}
.host[data-observe-state*='intersect:visible'] {
  border-color: #16a34a;
}
.host[data-observe-state*='mutate:active'] {
  background: #fffbeb;
}
</style>
