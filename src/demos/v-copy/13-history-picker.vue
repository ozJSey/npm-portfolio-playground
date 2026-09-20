<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef, watch } from 'vue'
import type {
  CopyConfig,
  CopyController,
  CopyEntry,
  CopyResult,
  DedupeCompare,
  RichCopyEntry,
} from '@ozjsey/v-copy'

/**
 * The whole point of the package, in one card: copy something, open the
 * history in a teleported dropdown, pick an old entry and put it back on the
 * clipboard — a clipboard manager built out of one directive plus a bound ref.
 *
 * `sink: []` is where entries are written. `picker.history` is NOT an array on
 * the first render — the directive's `mounted` hook bridges the two, and Vue
 * runs directive mounted hooks after that render — so every read of it below
 * goes through `?? []`.
 */
const picker = reactive<CopyController>({ sink: [], rich: true, dedupe: true, max: 6 })

const open = ref(false)
const trigger = useTemplateRef<HTMLElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')

/** Values to copy from. Two are near-duplicates — that is what `compare` is for. */
const chips = [
  { key: 'email', text: 'ada@lovelace.dev' },
  { key: 'email', text: 'ADA@Lovelace.dev' },
  { key: 'commit', text: '9f2c1ab' },
  { key: 'token', text: 'sk-demo-4417' },
  { key: 'phone', text: '+1 555 0142' },
  { key: 'install', text: 'npm i @ozjsey/v-copy' },
]

/** Same address, trailing newline — the payload only `'trim'` / `'loose'` merge. */
const padded = 'ada@lovelace.dev\n'

const compareMode = ref<DedupeCompare>('exact')

/**
 * The knob reads AND writes `picker.dedupe`. Writing to a controller is enough
 * on its own since 1.1.1 — the directive subscribes to the controller's config
 * half, so the option re-resolves immediately whether or not anything
 * re-renders. (Before that it took effect only when some unrelated binding
 * happened to re-render the host, which is why this comment used to insist the
 * template had to read the flag.)
 */
const dedupeOn = computed<boolean>({
  get: () => picker.dedupe !== false,
  set: (on) => {
    picker.dedupe = on ? { compare: compareMode.value } : false
  },
})
watch(compareMode, (compare) => {
  if (dedupeOn.value) picker.dedupe = { compare }
})

/** One sink can hold both shapes; `rich: true` means every entry is the rich one. */
const isRich = (entry: CopyEntry): entry is RichCopyEntry => typeof entry !== 'string'

/**
 * Rows keyed by text + occurrence index, never by `at`: a promotion writes a
 * FRESH `at`, so an `at` key would destroy and recreate the row and the
 * `[data-copied]` flash would vanish with it. Occurrence index keeps the key
 * unique when `dedupe` is off and duplicates are the point.
 */
const rows = computed(() => {
  const seen = new Map<string, number>()
  return (picker.history ?? []).filter(isRich).map((entry, index) => {
    const nth = seen.get(entry.text) ?? 0
    seen.set(entry.text, nth + 1)
    return { entry, index, key: `${entry.text}#${nth}` }
  })
})

/**
 * Every row carries its OWN `v-copy` binding rather than calling
 * `picker.copy(entry.text)`: `ctrl.copy()` runs on the last-mounted driver, so
 * the `[data-copied]` flash would land on an unrelated chip. Writing into the
 * same sink is also what promotes the picked entry back to index 0 — and what
 * keeps `picker.last` current, since `last` mirrors the head of the array
 * rather than whoever copied.
 *
 * A plain object literal: config the directive only reads, never a controller.
 * Re-created on every render on purpose — that is what re-reads `picker.dedupe`
 * and `picker.max` after you move a control.
 */
function sinkBinding(text: string, key?: string): CopyConfig {
  return {
    source: text,
    key,
    sink: picker.history,
    rich: true,
    dedupe: picker.dedupe,
    max: picker.max,
  }
}

/** Every attempt, deduped or not — the other half of the divergence. */
const rawLog = ref<{ text: string; ok: boolean }[]>([])

/**
 * ONE listener, on the wrapper around both the values and the dropdown.
 *
 * This works because `v-teleport-to` never moves the host in the DOM — it only
 * writes `position: fixed` coordinates onto it. The dropdown is still a
 * descendant of this div, so `copy-result` bubbles here from a row exactly as
 * it does from a chip. A real `<Teleport>` would relocate the node into
 * `<body>` and this listener would never see the re-copies at all.
 */
function onCopyResult(e: Event) {
  const { text, success } = (e as CustomEvent<CopyResult>).detail
  rawLog.value.unshift({ text, ok: success })
  rawLog.value.length = Math.min(rawLog.value.length, 30)
  // The copy just promoted its entry to index 0. The list is short when the
  // trigger sits near the bottom of the viewport, so scroll it back up —
  // otherwise the jump you came to see happens off-screen.
  nextTick(() => menu.value?.scrollTo({ top: 0 }))
}

function clearAll() {
  picker.clear?.()
  rawLog.value = []
}

const mark = (text: string) => text.replace(/\n/g, '↵')

/** `last` mirrors the head of the sink, whichever binding wrote it. */
const lastText = computed(() => {
  const entry = picker.last
  return entry === undefined ? '—' : mark(typeof entry === 'string' ? entry : entry.text)
})
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour12: false })
</script>

<template>
  <div class="picker" @copy-result="onCopyResult">
    <p class="pg-muted" style="margin: 0 0 0.4rem">1 · copy a few values</p>
    <div class="pg-row">
      <!-- Controller binding: the element's own text is the payload, the
           argument labels the entry, and everything lands in picker.history. -->
      <code v-for="(c, i) in chips" :key="i" class="val" v-copy:[c.key]="picker">{{ c.text }}</code>
      <button class="pg-btn val-alt" v-copy="sinkBinding(padded, 'email')">
        ada@lovelace.dev<span class="ws">↵</span>
      </button>
    </div>

    <p class="pg-muted" style="margin: 0.9rem 0 0.4rem">2 · tune the history</p>
    <div class="pg-row">
      <label class="pg-label">
        <input v-model="dedupeOn" type="checkbox" />
        dedupe
      </label>
      <label class="pg-label">
        compare
        <select v-model="compareMode" class="pg-select" :disabled="!dedupeOn">
          <option value="exact">exact</option>
          <option value="trim">trim</option>
          <option value="loose">loose</option>
        </select>
      </label>
      <label class="pg-label">
        max
        <input
          v-model.number="picker.max"
          class="pg-input"
          type="number"
          min="1"
          max="12"
          style="width: 4.5rem"
        />
      </label>
      <button class="pg-btn" :disabled="!rawLog.length" @click="clearAll">Clear</button>
    </div>

    <div class="pg-row counters">
      <span class="pg-chip">copies made {{ rawLog.length }}</span>
      <span class="pg-chip">history {{ rows.length }} / {{ picker.max }}</span>
      <span class="pg-chip">dedupe {{ picker.dedupe === false ? 'off' : compareMode }}</span>
      <span class="pg-chip">
        oldest kept {{ rows.length ? mark(rows[rows.length - 1].entry.text) : '—' }}
      </span>
      <!-- `last` mirrors the HEAD of the history, whoever wrote it — the chips
           bind the controller, the dropdown rows bind a plain config object
           pointed at the same sink, and both keep this current. -->
      <span class="pg-chip last">last {{ lastText }}</span>
    </div>

    <p class="pg-muted" style="margin: 0.9rem 0 0.4rem">3 · every attempt, deduped or not</p>
    <div class="verify">
      <textarea
        class="pg-input paste"
        rows="4"
        placeholder="paste here to confirm what is really on the clipboard"
      ></textarea>
      <pre class="pg-log">{{
        rawLog.length
          ? rawLog.map((r) => `${r.ok ? 'ok  ' : 'FAIL'} ${mark(r.text)}`).join('\n')
          : '— every copy attempt lands here, deduped or not —'
      }}</pre>
    </div>

    <p class="pg-muted" style="margin: 0.9rem 0 0.4rem">4 · open the history and copy again</p>
    <div class="clipper">
      <span class="pg-muted">overflow: hidden</span>
      <button ref="trigger" class="pg-btn pg-btn--primary" @click="open = !open">
        {{ open ? 'Close' : 'Copy again' }} ▾
      </button>
    </div>

    <div
      ref="menu"
      v-show="open"
      v-teleport-to="{ to: trigger, placement: 'bottom', offsetY: 6, maxWidth: 400, maxHeight: 260 }"
      class="menu"
    >
      <p v-if="!rows.length" class="menu__empty">Nothing copied yet — click a value above.</p>
      <button
        v-for="row in rows"
        :key="row.key"
        class="row"
        v-copy="sinkBinding(row.entry.text, row.entry.key)"
      >
        <span class="row__n">{{ row.index + 1 }}</span>
        <span class="row__text">{{ mark(row.entry.text) }}</span>
        <span class="row__key">{{ row.entry.key }}</span>
        <time class="row__at">{{ clock(row.entry.at) }}</time>
      </button>
    </div>
  </div>

  <p class="pg-muted">
    The dropdown stays open after a pick, so you can watch the entry you clicked jump to
    <strong>1</strong>. Turn <code>dedupe</code> off and re-copy the same value: “copies made” and
    “history” diverge, duplicates stack up, and <code>max</code> starts evicting the oldest entry —
    a promotion never costs a slot, a duplicate does. <code>compare</code> decides what counts as
    the same payload: <code>exact</code> keeps the trailing-newline value separate,
    <code>trim</code> merges it with the plain address, <code>loose</code> merges the
    <code>ADA@</code> spelling too. The newly copied text is what stays — the match is removed, not
    rewritten.
  </p>

  <p class="pg-muted">
    One <code>@copy-result</code> listener on the wrapper collects every attempt — from the values
    <em>and</em> from the dropdown rows. That works because <code>v-teleport-to</code> never moves
    the host in the DOM; it only writes <code>position: fixed</code> coordinates onto it, so the
    menu is still a descendant here and the event bubbles. A real <code>&lt;Teleport&gt;</code>
    would relocate the node into <code>&lt;body&gt;</code> and this listener would never see a
    re-copy at all.
  </p>
</template>

<style scoped>
.val,
.val-alt {
  font-family: var(--mono);
  font-size: 0.8rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  background: #f7f8fb;
  cursor: pointer;
}
.val[data-copied],
.val-alt[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
.ws {
  color: #9aa3b8;
}
.counters {
  margin-top: 0.55rem;
}
.clipper {
  height: 64px;
  overflow: hidden;
  border: 2px dashed #dc2626;
  border-radius: 8px;
  padding: 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.menu {
  min-width: 20rem;
  background: #fff;
  border: 1px solid #dfe3ec;
  border-radius: 8px;
  box-shadow: 0 12px 34px rgba(15, 20, 35, 0.18);
  padding: 0.25rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.menu__empty {
  margin: 0;
  padding: 0.5rem 0.6rem;
  color: #6b7488;
  font-size: 0.8rem;
}
.row {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  padding: 0.3rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  display: grid;
  grid-template-columns: 1.2rem 1fr auto auto;
  align-items: center;
  gap: 0.5rem;
}
.row:hover {
  background: #eef2ff;
}
.row[data-copied] {
  background: #f0fdf4;
  border-color: #16a34a;
}
.row__n {
  color: #9aa3b8;
  font-size: 0.7rem;
}
.row__text {
  font-family: var(--mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__key {
  font-size: 0.68rem;
  color: #3730a3;
  background: #eef2ff;
  border-radius: 999px;
  padding: 0.02rem 0.45rem;
}
.row__at {
  font-size: 0.68rem;
  color: #9aa3b8;
}
.verify {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: stretch;
}
.paste {
  flex: 1 1 15rem;
  min-width: 12rem;
}
.verify .pg-log {
  flex: 1 1 18rem;
  max-height: none;
}
</style>
