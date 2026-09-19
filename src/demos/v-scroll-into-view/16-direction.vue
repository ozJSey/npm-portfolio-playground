<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from '@ozjsey/v-scroll-into-view'

/**
 * The horizontal axis, swept against the browser — SIV-6 finding 1.
 *
 * Card 15 sweeps the vertical axis with `inline` pinned to `'nearest'`, so it
 * could not see the defect this card exists for: 1.3.0 read ONE `direction`
 * flag off the target and used it for two unrelated jobs. Which physical edge
 * `inline: 'start'` names really is the target's business — Chrome aligns the
 * right edge of a `dir="rtl"` card even inside an LTR rail. The SIGN of the
 * container's `scrollLeft` is the container's: an LTR scroller runs `0 … +max`
 * whatever language is written inside it. Mixing them clamped every positive
 * destination into a negative range, which is `scrollLeft 0`, every time.
 *
 * The realistic shape is right here in the first row: an LTR card rail whose
 * items carry `dir="auto"` for user-generated text. Chrome resolves `dir="auto"`
 * + Arabic to `direction: rtl`, and 1.3.0 snapped the rail to the start and left
 * the selected card off-screen.
 */
type Dir = 'ltr' | 'rtl'

interface Row {
  pane: Dir
  target: Dir
  align: ScrollLogicalPosition
  axis: 'inline' | 'vertical-only'
  from: number
  lib: number
  nat: number
}

const paneDir = ref<Dir>('ltr')
const targetDir = ref<Dir>('rtl')
const inline = ref<ScrollLogicalPosition>('start')
const block = ref<ScrollLogicalPosition>('nearest')
const go = ref(false)

const running = ref(false)
const progress = ref('—')
const summary = ref('—')
const failures = ref<Row[]>([])
const live = ref('—')

const libPane = useTemplateRef<HTMLElement>('libPane')
const libTarget = useTemplateRef<HTMLElement>('libTarget')
const natPane = useTemplateRef<HTMLElement>('natPane')
const natTarget = useTemplateRef<HTMLElement>('natTarget')

const COLS = 8
const ROWS = 6
/**
 * Which cell is the target: row 4, column 6 of an 8 x 6 grid, which is off
 * screen on BOTH axes from a pane parked at the origin. The cells before and
 * after it are rendered as two separate `v-for`s so the target itself is not
 * inside one — a `ref` inside `v-for` collects into an array, and this card
 * needs one element to hand to `scrollIntoView()`.
 */
const AT = 30
const BEFORE = AT - 1
const AFTER = COLS * ROWS - AT

function options(): VScrollIntoViewOptions {
  return {
    condition: go.value,
    // The getter form, resolved at scroll time. See card 03 for why this is the
    // one to reach for and `paneRef.value ?? undefined` is the one that bites.
    container: () => libPane.value,
    block: block.value,
    inline: inline.value,
    behavior: 'instant',
  }
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** Put the target dead centre horizontally, in whichever direction the pane runs. */
function centreHorizontally(pane: HTMLElement, target: HTMLElement): number {
  const p = pane.getBoundingClientRect()
  const t = target.getBoundingClientRect()
  return pane.scrollLeft + (t.left - p.left) - (p.width - t.width) / 2
}

/**
 * One cell: park both panes at the same starting offsets, then move one with
 * the directive and one with `Element.scrollIntoView()` and read both back.
 */
async function measure(axis: 'inline' | 'vertical-only', from: number): Promise<Row> {
  const lib = libPane.value!
  const nat = natPane.value!
  go.value = false
  await nextTick()

  if (axis === 'vertical-only') {
    // Already horizontally visible, so `inline: 'nearest'` has nothing to do —
    // and a vertical-only scroll must leave `scrollLeft` exactly alone. 1.3.0
    // re-clamped it anyway: measured against the published artifact, a pane at
    // 650 jumped to 0.
    lib.scrollTop = 0
    nat.scrollTop = 0
    await frame()
    lib.scrollLeft = centreHorizontally(lib, libTarget.value!)
    nat.scrollLeft = centreHorizontally(nat, natTarget.value!)
  } else {
    lib.scrollLeft = from
    nat.scrollLeft = from
    lib.scrollTop = 0
    nat.scrollTop = 0
  }
  await frame()
  const started = Math.round(lib.scrollLeft)

  go.value = true
  await nextTick()
  await frame()
  natTarget.value!.scrollIntoView({ block: block.value, inline: inline.value, behavior: 'instant' })
  await frame()

  return {
    pane: paneDir.value,
    target: targetDir.value,
    align: axis === 'vertical-only' ? block.value : inline.value,
    axis,
    from: started,
    lib: Math.round(lib.scrollLeft),
    nat: Math.round(nat.scrollLeft),
  }
}

/**
 * `requestAnimationFrame` does not fire in a hidden tab, so a sweep started and
 * then backgrounded parks forever inside `measure()`. Without a `finally` the
 * `running` flag stays true and every control on the card is disabled for good
 * — the card is dead until a reload, with no indication why. Observed, not
 * theorised: `document.visibilityState === 'hidden'` and rAF silent past 1.5s.
 */
async function runOne(axis: 'inline' | 'vertical-only'): Promise<void> {
  if (running.value) return
  running.value = true
  try {
    live.value = 'scrolling…'
    const row = await measure(axis, 0)
    // The vertical-only run parks the rail mid-way on purpose before it starts,
    // so the horizontal axis has somewhere to be wrongly moved FROM. Without
    // saying so, that setup jump is the most visible thing on the card and reads
    // as the directive scrolling sideways — which is the opposite of what the
    // row proves. State the before and after instead of only the delta.
    live.value =
      axis === 'vertical-only'
        ? `parked at ${row.from} · lib ${row.lib} · native ${row.nat} · moved ${row.lib - row.from}`
        : `from ${row.from} · lib ${row.lib} · native ${row.nat} · Δ ${row.lib - row.nat}`
  } finally {
    running.value = false
  }
}

async function run(): Promise<void> {
  if (running.value) return
  running.value = true
  try {
    failures.value = []
    const bad: Row[] = []
    let n = 0
    const dirs: Dir[] = ['ltr', 'rtl']
    const aligns: ScrollLogicalPosition[] = ['start', 'center', 'end', 'nearest']
    const total = 2 * 2 * (aligns.length * 2 + 1)

    for (const pd of dirs) {
      for (const td of dirs) {
        paneDir.value = pd
        targetDir.value = td
        // The inline axis, from both ends of the rail.
        block.value = 'nearest'
        for (const a of aligns) {
          for (const from of [0, pd === 'rtl' ? -9999 : 9999]) {
            inline.value = a
            await nextTick()
            const row = await measure('inline', from)
            n++
            if (row.lib !== row.nat) bad.push(row)
            progress.value = `${n}/${total}…`
          }
        }
        // And the row that carries the regression half.
        inline.value = 'nearest'
        block.value = 'start'
        await nextTick()
        const row = await measure('vertical-only', 0)
        n++
        if (row.lib !== row.nat || row.lib !== row.from) bad.push(row)
        progress.value = `${n}/${total}…`
      }
    }

    block.value = 'nearest'
    failures.value = bad
    progress.value = `${n}/${total} rows`
    summary.value = bad.length
      ? `${bad.length} of ${n} rows disagree with native`
      : `all ${n} rows land on native's pixel, both directions, both axes`
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      pane dir
      <select v-model="paneDir" class="pg-select">
        <option>ltr</option>
        <option>rtl</option>
      </select>
    </label>
    <label class="pg-label">
      target dir
      <select v-model="targetDir" class="pg-select">
        <option>ltr</option>
        <option>rtl</option>
      </select>
    </label>
    <label class="pg-label">
      inline
      <select v-model="inline" class="pg-select">
        <option>start</option>
        <option>center</option>
        <option>end</option>
        <option>nearest</option>
      </select>
    </label>
    <label class="pg-label">
      block
      <select v-model="block" class="pg-select">
        <option>nearest</option>
        <option>start</option>
        <option>center</option>
        <option>end</option>
      </select>
    </label>
  </div>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn" :disabled="running" @click="runOne('inline')">Scroll both</button>
    <button class="pg-btn" :disabled="running" @click="runOne('vertical-only')">
      Park sideways, then scroll vertically only
    </button>
    <span class="pg-kv live">{{ live }}</span>
  </div>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" :disabled="running" @click="run">
      {{ running ? 'sweeping…' : 'Run the direction sweep' }}
    </button>
    <span class="pg-kv progress">{{ progress }}</span>
  </div>

  <p class="pg-kv summary">{{ summary }}</p>

  <table v-if="failures.length" class="fails">
    <thead>
      <tr><th>pane</th><th>target</th><th>axis</th><th>align</th><th>from</th><th>lib</th><th>native</th><th>Δ</th></tr>
    </thead>
    <tbody>
      <tr v-for="(f, i) in failures" :key="i">
        <td>{{ f.pane }}</td><td>{{ f.target }}</td><td>{{ f.axis }}</td><td>{{ f.align }}</td>
        <td>{{ f.from }}</td><td>{{ f.lib }}</td><td>{{ f.nat }}</td><td>{{ f.lib - f.nat }}</td>
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
      <div ref="libPane" class="rail" :style="{ direction: paneDir }">
        <div v-for="i in BEFORE" :key="i" class="cell">{{ i }}</div>
        <div
          ref="libTarget"
          class="cell hit"
          :style="{ direction: targetDir }"
          v-scroll-into-view="options()"
        >
          {{ targetDir === 'rtl' ? 'مرحبا' : 'target' }}
        </div>
        <div v-for="i in AFTER" :key="`a${i}`" class="cell">{{ i + AT }}</div>
      </div>
    </div>

    <div>
      <p class="pg-kv cap">native · scrollIntoView</p>
      <div ref="natPane" class="rail" :style="{ direction: paneDir }">
        <div v-for="i in BEFORE" :key="i" class="cell">{{ i }}</div>
        <div ref="natTarget" class="cell hit" :style="{ direction: targetDir }">
          {{ targetDir === 'rtl' ? 'مرحبا' : 'target' }}
        </div>
        <div v-for="i in AFTER" :key="`a${i}`" class="cell">{{ i + AT }}</div>
      </div>
    </div>
    </div>
  </div>

  <p class="pg-muted">
    Two identical rails, one moved by the directive with <code>container</code> and one by
    <code>Element.scrollIntoView()</code>, across every combination of the pane's
    <code>direction</code>, the target's <code>direction</code>, the four <code>inline</code>
    alignments and both ends of the rail — plus one row per direction pair that scrolls
    <em>vertically only</em> and checks that <code>scrollLeft</code> did not move.
    <br /><br />
    Two different facts wear the same word. <strong>Which edge</strong> <code>inline: 'start'</code>
    names is the <em>target's</em>: Chrome aligns the right edge of a <code>dir="rtl"</code> card
    even in an LTR rail, so the four matched-direction rows and the mixed ones want different
    answers. <strong>The sign of <code>scrollLeft</code></strong> is the <em>container's</em>: an RTL
    scroller runs <code>0 … -max</code>, an LTR one <code>0 … +max</code>, and nothing inside them
    changes that. Through 1.3.0 one flag did both jobs, so an LTR rail holding a
    <code>dir="rtl"</code> card clamped a positive destination into a negative range and landed on
    <code>scrollLeft 0</code>, every alignment, every time — while the vertical-only row, which asks
    for nothing horizontal at all, was dragged back to 0 with it.
  </p>
</template>

<style scoped>
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
/*
  Not tidiness. A grid item's default `min-width: auto` is its content's
  min-content size, and this card's content is a 960px fixed-column grid — so
  without this the column grew to 960px, the rail's `overflow: auto` had nothing
  to clip, and `clientWidth === scrollWidth`. Both panes then measured a
  horizontal range of zero and agreed, perfectly, on `scrollLeft 0`: a parity
  card that proves parity by having nothing to compare.
*/
.panes > div {
  min-width: 0;
}
.rail {
  height: 160px;
  width: 100%;
  overflow: auto;
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  background: #fbfcfe;
  display: grid;
  grid-template-columns: repeat(8, 120px);
  grid-auto-rows: 70px;
}
.cell {
  display: grid;
  place-items: center;
  border-right: 1px solid #eef1f6;
  border-bottom: 1px solid #eef1f6;
  font-size: 0.75rem;
  color: #97a0b4;
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
.live,
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
