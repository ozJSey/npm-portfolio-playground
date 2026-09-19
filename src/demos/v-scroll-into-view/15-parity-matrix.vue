<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from '@ozjsey/v-scroll-into-view'

/**
 * The container path, swept against the browser's own scrollIntoView.
 *
 * Every other card demonstrates one behaviour. This one exists because SIV-4
 * found three divergences at once in the paths a previous audit had just
 * "fixed", and each of them was invisible to the card built to catch it: the
 * border error was 1px, inside a ±2px tolerance, on a pane whose readout was
 * measured from the same wrong origin.
 *
 * A sweep cannot be tuned to pass. Two identical panes, one moved by the
 * directive and one by the browser, every combination of the four things the
 * arithmetic depends on — and one number at the end.
 */
interface Row {
  border: number
  padding: number
  size: number
  gap: number
  block: ScrollLogicalPosition
  from: number
  lib: number
  nat: number
  /** The one documented divergence: `nearest` drops a gap it cannot fit. */
  byDesign: boolean
}

const border = ref(1)
const padding = ref(0)
const size = ref(40)
const gap = ref(0)
const block = ref<ScrollLogicalPosition>('start')
const go = ref(false)

const running = ref(false)
const progress = ref('—')
const summary = ref('—')
const failures = ref<Row[]>([])

const libPane = useTemplateRef<HTMLElement>('libPane')
const libTarget = useTemplateRef<HTMLElement>('libTarget')
const natPane = useTemplateRef<HTMLElement>('natPane')
const natTarget = useTemplateRef<HTMLElement>('natTarget')

const LEADING = 8
const TRAILING = 21

function options(): VScrollIntoViewOptions {
  return {
    condition: go.value,
    container: libPane.value ?? undefined,
    block: block.value,
    inline: 'nearest',
    behavior: 'instant',
    offset: { top: gap.value },
  }
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** Run one cell of the sweep and report both panes' resting scrollTop. */
async function measure(from: number): Promise<Row> {
  const lib = libPane.value!
  const nat = natPane.value!
  go.value = false
  await nextTick()
  lib.scrollTop = from
  nat.scrollTop = from
  await frame()
  go.value = true
  await nextTick()
  await frame()
  natTarget.value!.scrollIntoView({ block: block.value, inline: 'nearest', behavior: 'instant' })
  await frame()
  return {
    border: border.value,
    padding: padding.value,
    size: size.value,
    gap: gap.value,
    block: block.value,
    from,
    lib: Math.round(lib.scrollTop),
    nat: Math.round(nat.scrollTop),
    // The scrollport, not the declared height: `clientHeight` includes padding.
    byDesign: gap.value > 0 && block.value === 'nearest' && size.value + gap.value > lib.clientHeight,
  }
}

/**
 * `requestAnimationFrame` does not fire in a hidden tab, so a sweep started and
 * then backgrounded parks forever inside `measure()`. Without a `finally` the
 * `running` flag stays true and every control on the card is disabled for good
 * — the card is dead until a reload, with no indication why. Observed, not
 * theorised: `document.visibilityState === 'hidden'` and rAF silent past 1.5s.
 */
async function run(): Promise<void> {
  if (running.value) return
  running.value = true
  try {
    failures.value = []
    const bad: Row[] = []
    let n = 0
    const blocks: ScrollLogicalPosition[] = ['start', 'center', 'end', 'nearest']
    const total = 3 * 2 * 2 * 2 * blocks.length * 2
    for (const b of [0, 1, 10]) {
      for (const p of [0, 20]) {
        for (const s of [40, 400]) {
          for (const g of [0, 60]) {
            for (const bl of blocks) {
              for (const f of [0, 3000]) {
                border.value = b
                padding.value = p
                size.value = s
                gap.value = g
                block.value = bl
                await nextTick()
                const row = await measure(f)
                n++
                if (row.lib !== row.nat && !row.byDesign) bad.push(row)
                if (n % 8 === 0) progress.value = `${n}/${total}…`
              }
            }
          }
        }
      }
    }
    failures.value = bad
    progress.value = `${n}/${total} rows`
    summary.value = bad.length
      ? `${bad.length} of ${n} rows disagree with native`
      : `all ${n} rows land on the same pixel as native`
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" :disabled="running" @click="run">
      {{ running ? 'sweeping…' : 'Run the sweep' }}
    </button>
    <span class="pg-kv progress">{{ progress }}</span>
  </div>

  <p class="pg-kv summary">{{ summary }}</p>

  <table v-if="failures.length" class="fails">
    <thead>
      <tr><th>border</th><th>padding</th><th>size</th><th>offset</th><th>block</th><th>from</th><th>lib</th><th>native</th><th>Δ</th></tr>
    </thead>
    <tbody>
      <tr v-for="(f, i) in failures" :key="i">
        <td>{{ f.border }}</td><td>{{ f.padding }}</td><td>{{ f.size }}</td><td>{{ f.gap }}</td>
        <td>{{ f.block }}</td><td>{{ f.from }}</td><td>{{ f.lib }}</td><td>{{ f.nat }}</td>
        <td>{{ f.lib - f.nat }}</td>
      </tr>
    </tbody>
  </table>

  <!--
    The sweep moves both rails once per row. Watching that happen is not the
    point of the card and it made the page unreadable: measured at 192 rows,
    the rails changed scroll position on 173 of 195 samples across 19.5
    seconds of continuous thrash. The numbers are the evidence, so the rails
    step aside while they are being collected. The controls above still drive
    one configuration at a time, at normal speed, fully visible.
  -->
  <div class="panes-wrap">
    <p v-if="running" class="veil-note">measuring {{ progress }}</p>
    <div class="panes" :class="{ measuring: running }">
    <div>
      <p class="pg-kv cap">directive · container</p>
      <div ref="libPane" class="sweep" :style="{ borderWidth: border + 'px', padding: padding + 'px' }">
        <div v-for="i in LEADING" :key="i" class="cell">{{ i - 1 }}</div>
        <div
          ref="libTarget"
          class="cell hit"
          :style="{ height: size + 'px' }"
          v-scroll-into-view="options()"
        >
          target
        </div>
        <div v-for="i in TRAILING" :key="`t${i}`" class="cell">{{ i + LEADING }}</div>
      </div>
    </div>

    <div>
      <p class="pg-kv cap">native · scrollIntoView</p>
      <div ref="natPane" class="sweep" :style="{ borderWidth: border + 'px', padding: padding + 'px' }">
        <div v-for="i in LEADING" :key="i" class="cell">{{ i - 1 }}</div>
        <div
          ref="natTarget"
          class="cell hit"
          :style="{ height: size + 'px', scrollMarginTop: gap + 'px' }"
        >
          target
        </div>
        <div v-for="i in TRAILING" :key="`t${i}`" class="cell">{{ i + LEADING }}</div>
      </div>
    </div>
    </div>
  </div>

  <p class="pg-muted">
    The library states the gap as <code>offset: { top: N }</code>; the native pane states the same
    gap as <code>scroll-margin-top: Npx</code>, because that is the vocabulary the browser has for
    it. Everything else about the two panes is identical, down to the border and the padding, and
    both are asked for the same <code>block</code> from the same starting scroll position.
    <br /><br />
    The border is the sweep's reason for existing. <code>getBoundingClientRect()</code> reports the
    <em>border</em> box while <code>scrollTop</code> and <code>clientHeight</code> are measured from
    the <em>padding</em> box, so a container path that forgets <code>clientTop</code> is wrong by the
    border width on every alignment, always — 1px on every pane in this playground, which is small
    enough to sit inside any tolerance anyone would write and big enough to clip the top of a row.
    Padding is the control: it was always handled correctly, and it stays green when the border
    column goes red.
    <br /><br />
    The one row shape allowed to disagree is <code>nearest</code> with a gap too big to leave room
    for the target. The browser honours it and clips; the directive drops it, on the grounds that a
    decoration which hides the thing it decorates has failed at its job. Those rows are excluded by
    name, not by tolerance.
  </p>
</template>

<style scoped>
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.sweep {
  height: 200px;
  width: 100%;
  overflow: auto;
  box-sizing: content-box;
  border-style: solid;
  border-color: #cfd6e4;
  border-radius: 8px;
  background: #fbfcfe;
}
.cell {
  height: 40px;
  box-sizing: border-box;
  padding: 0 0.5rem;
  font-size: 0.75rem;
  color: #97a0b4;
  border-bottom: 1px solid #eef1f6;
}
.cell.hit {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.cap {
  margin: 0 0 0.25rem;
  color: #6b7488;
}
.progress {
  color: #6b7488;
}
.summary {
  margin: 0;
  font-weight: 600;
}
.fails {
  margin: 0.5rem 0 0;
  border-collapse: collapse;
  font-family: var(--mono);
  font-size: 0.72rem;
}
.fails th,
.fails td {
  border: 1px solid #e3e8f0;
  padding: 0.15rem 0.4rem;
  text-align: right;
}

.panes-wrap {
  position: relative;
}
/*
  Not `visibility: hidden` and not `display: none`: this library reads layout,
  and one of its documented behaviours is what it does with a hidden target
  (card 11). Opacity changes nothing the geometry can see, so the sweep it is
  concealing still measures exactly what it would measure in full view.
*/
.panes.measuring {
  opacity: 0.06;
  pointer-events: none;
}
.veil-note {
  position: absolute;
  inset: 0;
  z-index: 1;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: #64748b;
}
</style>
