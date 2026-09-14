<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from '@ozjsey/v-scroll-into-view'

/** none → the CSS rule stands · 0 → override it away · 80 → override it up. */
const override = ref<'none' | 'zero' | 'eighty'>('none')
const go = ref(false)
const nativeOut = ref('—')
const containerOut = ref('—')
const verdict = ref('—')

const natPane = useTemplateRef<HTMLElement>('natPane')
const natTarget = useTemplateRef<HTMLElement>('natTarget')
const conPane = useTemplateRef<HTMLElement>('conPane')
const conTarget = useTemplateRef<HTMLElement>('conTarget')

function offset(): { top: number } | undefined {
  if (override.value === 'none') return undefined
  return { top: override.value === 'zero' ? 0 : 80 }
}

function nativeOptions(): VScrollIntoViewOptions {
  return { condition: go.value, block: 'start', behavior: 'instant', offset: offset() }
}

function containerOptions(): VScrollIntoViewOptions {
  return {
    condition: go.value,
    container: conPane.value ?? undefined,
    block: 'start',
    behavior: 'instant',
    offset: offset(),
  }
}

/** Scrollport coordinates — the pane's own border is not a gap. */
function gap(pane: HTMLElement | null, target: HTMLElement | null): number | null {
  if (!pane || !target) return null
  return Math.round(
    target.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientTop,
  )
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
  verdict.value = 'scrolling…'
  requestAnimationFrame(() => {
    go.value = true
    window.setTimeout(() => {
      const n = gap(natPane.value, natTarget.value)
      const c = gap(conPane.value, conTarget.value)
      nativeOut.value = `gap above target: ${n}px`
      containerOut.value = `gap above target: ${c}px`
      verdict.value = n === c ? `Δ 0px — both paths agree at ${n}px` : `Δ ${(c ?? 0) - (n ?? 0)}px — NOT parity`
    }, 500)
  })
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      offset
      <select v-model="override" class="pg-select">
        <option value="none">not set — the CSS rule stands</option>
        <option value="zero">{ top: 0 } — override the gap away</option>
        <option value="eighty">{ top: 80 } — override it to 80px</option>
      </select>
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

  <p class="pg-kv verdict">{{ verdict }}</p>

  <p class="pg-muted">
    Same markup, same <code>block: 'start'</code>, same stylesheet rule — and since 1.3.0 the same
    answer. The <code>container</code> path reads the target's computed
    <code>scroll-margin</code> and the pane's <code>scroll-padding</code> instead of pretending
    neither exists, so a global sticky-header rule keeps working the moment you add
    <code>container</code>. It used to stop dead, and the only clue was the gap quietly closing.
    <br /><br />
    <code>offset</code> is now the <em>override</em> for that CSS, per side, on both paths — which is
    why <code>{ top: 0 }</code> removes the gap rather than doing nothing, and why it removes it on
    the native pane too: there it is written as an inline <code>scroll-margin-top: 0</code> across
    the call and put back after. Being a leading-edge gap it lands where CSS puts one: fully on
    <code>start</code>, half on <code>center</code>, and not at all on <code>end</code>.
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
.verdict {
  margin: 0.5rem 0 0;
  font-weight: 600;
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
