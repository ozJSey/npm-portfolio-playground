<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from '@ozjsey/v-scroll-into-view'

const mirror = ref(false)
const go = ref(false)
const nativeOut = ref('—')
const containerOut = ref('—')

const natPane = useTemplateRef<HTMLElement>('natPane')
const natTarget = useTemplateRef<HTMLElement>('natTarget')
const conPane = useTemplateRef<HTMLElement>('conPane')
const conTarget = useTemplateRef<HTMLElement>('conTarget')

function nativeOptions(): VScrollIntoViewOptions {
  return { condition: go.value, block: 'start', behavior: 'instant' }
}

function containerOptions(): VScrollIntoViewOptions {
  return {
    condition: go.value,
    container: conPane.value ?? undefined,
    block: 'start',
    behavior: 'instant',
    offset: mirror.value ? { top: 40 } : undefined,
  }
}

function gap(pane: HTMLElement | null, target: HTMLElement | null): string {
  if (!pane || !target) return '—'
  return `gap above target: ${Math.round(target.getBoundingClientRect().top - pane.getBoundingClientRect().top)}px`
}

function run(): void {
  const nat = natPane.value
  const con = conPane.value
  if (!nat || !con) return
  nat.scrollTop = 0
  con.scrollTop = 0
  go.value = false
  nativeOut.value = 'scrolling…'
  containerOut.value = 'scrolling…'
  requestAnimationFrame(() => {
    go.value = true
    window.setTimeout(() => {
      nativeOut.value = gap(natPane.value, natTarget.value)
      containerOut.value = gap(conPane.value, conTarget.value)
    }, 500)
  })
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input v-model="mirror" type="checkbox" />
      mirror it with <code>offset: { top: 40 }</code>
    </label>
    <button class="pg-btn pg-btn--primary" @click="run">Run both</button>
  </div>

  <div class="panes">
    <div>
      <p class="pg-kv cap">no container — native path</p>
      <div ref="natPane" class="pg-scroller">
        <p v-for="i in 8" :key="i" class="filler">filler line {{ i }}</p>
        <p ref="natTarget" class="target" v-scroll-into-view="nativeOptions()">
          🎯 scroll-margin-top: 40px
        </p>
        <p v-for="i in 8" :key="`b${i}`" class="filler">filler line {{ i + 8 }}</p>
      </div>
      <p class="pg-kv readout-native">{{ nativeOut }}</p>
    </div>

    <div>
      <p class="pg-kv cap">container — the pane is pinned</p>
      <div ref="conPane" class="pg-scroller">
        <p v-for="i in 8" :key="i" class="filler">filler line {{ i }}</p>
        <p ref="conTarget" class="target" v-scroll-into-view="containerOptions()">
          🎯 scroll-margin-top: 40px
        </p>
        <p v-for="i in 8" :key="`b${i}`" class="filler">filler line {{ i + 8 }}</p>
      </div>
      <p class="pg-kv readout-container">{{ containerOut }}</p>
    </div>
  </div>

  <p class="pg-muted">
    Same markup, same <code>block: 'start'</code>, same stylesheet rule. The native path hands the
    scroll to the browser, so the CSS <code>scroll-margin-top</code> opens its 40px gap; the
    <code>container</code> path does the arithmetic itself against
    <code>getBoundingClientRect()</code>, which does not include scroll margins, so the gap
    disappears. A global <code>scroll-margin-top</code> for a sticky header therefore stops working
    the moment you add <code>container</code> — tick the box to mirror it with the
    <code>offset</code> option, which is how you get it back.
  </p>
</template>

<style scoped>
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.cap {
  margin: 0 0 0.25rem;
  color: #6b7488;
}
.filler {
  margin: 0;
  padding: 0.5rem 0.75rem;
  color: #97a0b4;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.target {
  margin: 0;
  padding: 0.75rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
  /* The whole point of the card: a stylesheet rule, not an inline style. */
  scroll-margin-top: 40px;
}
.readout-native,
.readout-container {
  margin: 0.35rem 0 0;
}
</style>
