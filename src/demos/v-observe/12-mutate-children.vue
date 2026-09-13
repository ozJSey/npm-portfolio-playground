<script setup lang="ts">
import { ref } from 'vue'
import type { MutateEvent } from 'v-observe'

const useMatch = ref(true)
const items = ref([{ id: 1, kind: 'card' }])
const log = ref<string[]>([])
let nextId = 2

function add(kind: 'card' | 'note') {
  items.value.push({ id: nextId++, kind })
}

function onMutate(e: MutateEvent) {
  const names = (e.added ?? e.removed ?? []).map((el) => el.className).join(', ')
  log.value.unshift(`${e.type}: ${names || '(filtered out)'}`)
  log.value.length = Math.min(log.value.length, 8)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input v-model="useMatch" type="checkbox" /> match: '.card'
    </label>
    <button class="pg-btn pg-btn--primary" @click="add('card')">Add .card</button>
    <button class="pg-btn" @click="add('note')">Add .note</button>
    <button class="pg-btn" :disabled="!items.length" @click="items.pop()">Remove last</button>
  </div>

  <ul
    class="list"
    v-observe="{
      mutate: {
        on: ['children:added', 'children:removed'],
        match: useMatch ? '.card' : undefined,
        handler: onMutate,
      },
    }"
  >
    <li v-for="item in items" :key="item.id" :class="item.kind">{{ item.kind }} #{{ item.id }}</li>
  </ul>

  <pre class="pg-log" style="margin-top: 0.5rem">{{ log.join('\n') || '— add or remove a child —' }}</pre>
  <p class="pg-muted">
    With the filter on, adding a <code>.note</code> produces nothing. <code>match</code> also takes
    an array; an invalid selector in that array is skipped rather than thrown, and the valid
    siblings still apply. Text nodes never appear in <code>added</code> / <code>removed</code> —
    element nodes only.
  </p>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0.5rem;
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: 3rem;
}
.card,
.note {
  font-size: 0.8rem;
  border-radius: 6px;
  padding: 0.2rem 0.6rem;
}
.card {
  background: #eef2ff;
  color: #3730a3;
  border: 1px solid #c7d0ff;
}
.note {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fcd34d;
}
</style>
