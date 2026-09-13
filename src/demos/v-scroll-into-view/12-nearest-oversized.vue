<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from 'v-scroll-into-view'

const size = ref(400)
const offsetTop = ref(0)
const from = ref('above')
const go = ref(false)
const libraryOut = ref('—')
const nativeOut = ref('—')

const libPane = useTemplateRef<HTMLElement>('libPane')
const libTarget = useTemplateRef<HTMLElement>('libTarget')
const natPane = useTemplateRef<HTMLElement>('natPane')
const natTarget = useTemplateRef<HTMLElement>('natTarget')

function options(): VScrollIntoViewOptions {
  return {
    condition: go.value,
    container: libPane.value ?? undefined,
    block: 'nearest',
    behavior: 'instant',
    offset: offsetTop.value ? { top: offsetTop.value } : undefined,
  }
}

function describe(pane: HTMLElement | null, target: HTMLElement | null): string {
  if (!pane || !target) return '—'
  const top = Math.round(target.getBoundingClientRect().top - pane.getBoundingClientRect().top)
  return `scrollTop ${Math.round(pane.scrollTop)} · top ${top} · bottom ${top + size.value}`
}

function run(): void {
  const lib = libPane.value
  const nat = natPane.value
  if (!lib || !nat) return
  // Which edge `nearest` has to close matters: coming from above it aligns the
  // target's bottom, coming from below its top — and only the second one can
  // show the offset gap.
  lib.scrollTop = from.value === 'above' ? 0 : lib.scrollHeight
  nat.scrollTop = from.value === 'above' ? 0 : nat.scrollHeight
  go.value = false
  libraryOut.value = 'scrolling…'
  nativeOut.value = 'scrolling…'
  requestAnimationFrame(() => {
    go.value = true
    natTarget.value?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    window.setTimeout(() => {
      libraryOut.value = describe(libPane.value, libTarget.value)
      nativeOut.value = describe(natPane.value, natTarget.value)
    }, 500)
  })
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      target height
      <select v-model.number="size" class="pg-select">
        <option :value="120">120px (fits)</option>
        <option :value="200">200px (exactly the pane)</option>
        <option :value="400">400px (taller than the pane)</option>
      </select>
    </label>
    <label class="pg-label">
      approach from
      <select v-model="from" class="pg-select">
        <option value="above">above (pane at the top)</option>
        <option value="below">below (pane at the bottom)</option>
      </select>
    </label>
    <label class="pg-label">
      offset.top
      <select v-model.number="offsetTop" class="pg-select">
        <option :value="0">none</option>
        <option :value="40">40px</option>
      </select>
    </label>
    <button class="pg-btn pg-btn--primary" @click="run">Run both</button>
  </div>

  <div class="panes">
    <div>
      <p class="pg-kv cap">directive · block: 'nearest'</p>
      <div ref="libPane" class="pg-scroller">
        <p v-for="i in 6" :key="i" class="filler">filler line {{ i }}</p>
        <div ref="libTarget" class="target" :style="{ height: size + 'px' }" v-scroll-into-view="options()">
          🎯 {{ size }}px target
        </div>
        <p v-for="i in 6" :key="`b${i}`" class="filler">filler line {{ i + 6 }}</p>
      </div>
      <p class="pg-kv readout-library">{{ libraryOut }}</p>
    </div>

    <div>
      <p class="pg-kv cap">native · scrollIntoView({ block: 'nearest' })</p>
      <div ref="natPane" class="pg-scroller">
        <p v-for="i in 6" :key="i" class="filler">filler line {{ i }}</p>
        <div ref="natTarget" class="target" :style="{ height: size + 'px' }">🎯 {{ size }}px target</div>
        <p v-for="i in 6" :key="`b${i}`" class="filler">filler line {{ i + 6 }}</p>
      </div>
      <p class="pg-kv readout-native">{{ nativeOut }}</p>
    </div>
  </div>

  <p class="pg-muted">
    With no offset the two panes must land on the same pixel — that is what “native parity” means.
    A target taller than the pane gets its <strong>top</strong> aligned, not its bottom: showing the
    bottom of something you cannot see the start of is never the nearer edge. Add the offset and the
    directive diverges deliberately: the sticky-header gap is honoured while the target still fits
    underneath it, and dropped when honouring it would push the target's own far edge back out of
    view. Native has no <code>offset</code>, so its pane ignores that control.
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
  padding: 0.5rem 0.75rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
  box-sizing: border-box;
}
.readout-library,
.readout-native {
  margin: 0.35rem 0 0;
}
</style>
