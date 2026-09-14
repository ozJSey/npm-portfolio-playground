<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const width = ref(60)
const alive = ref(true)

const chips = ref(['Vue', 'TypeScript', 'Vite', 'Vitest', 'Nuxt', 'Pinia', 'ESLint', 'Prettier', 'Rollup'])
let extra = 0

const events = ref(0)
const last = ref<FitChildrenEventDetail | null>(null)

function onUpdate(e: Event) {
  events.value += 1
  last.value = (e as CustomEvent<FitChildrenEventDetail>).detail
}

// A real unmount/mount of the host, so the next pass is a FIRST pass at
// whatever width the slider is on.
async function remount() {
  alive.value = false
  events.value = 0
  last.value = null
  await nextTick()
  alive.value = true
}

// push/pop on the SAME array — the dominant Vue idiom, and the one the old
// dispatch gate could not see: it compared the visible set (unchanged, the
// first three still fit) and the array's identity (unchanged, it was mutated
// in place), while every field of the payload is about the hidden set.
function addChip() {
  chips.value.push(`extra ${++extra}`)
}
function removeChip() {
  chips.value.pop()
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <label class="pg-label">
      container width
      <input v-model.number="width" type="range" min="60" max="720" />
      {{ width }}px
    </label>
    <button class="pg-btn pg-btn--primary" @click="remount">Remount the row</button>
    <button class="pg-btn" @click="addChip">Add chip</button>
    <button class="pg-btn" :disabled="!chips.length" @click="removeChip">Remove chip</button>
  </div>

  <!-- The badge renders from the EVENT and from nothing else, which is what
       makes this card the consumer's view of the contract: no event, no badge,
       however wrong the row looks.

       It sits BELOW the row rather than beside it, so the whole of the frame is
       the row's budget. A badge inside the frame takes its width out of the row
       (card 1 is that shape on purpose) — which would make "nothing fits" mean
       "the badge ate it" rather than "the container really is too narrow", and
       this card is about the event, not about the badge's layout. -->
  <div class="frame" :style="{ width: `${width}px` }">
    <!-- A BARE binding: no `data`, which is the default path and the one F1 was
         driven against. `hiddenIndices` and the count are what the event carries
         without it; cards 2, 6 and 8 are where `hiddenData` lives. -->
    <div v-if="alive" class="chips" v-fit-children="{ offsetNeededInPx: 0 }" @fit-children-updated="onUpdate">
      <span v-for="chip in chips" :key="chip" class="pg-chip">{{ chip }}</span>
    </div>
  </div>
  <p style="margin: 0.5rem 0 0">
    <span v-if="last && last.hiddenChildrenCount" class="more">+{{ last.hiddenChildrenCount }} more</span>
    <span v-else class="pg-muted">no badge — nothing is hidden</span>
  </p>

  <pre class="pg-log" style="margin-top: 0.6rem">{{
    last
      ? [
          `events dispatched:    ${events}`,
          `isOverflowing:        ${last.isOverflowing}`,
          `hiddenChildrenCount:  ${last.hiddenChildrenCount}`,
          `hiddenIndices:        [${last.hiddenIndices.join(', ')}]`,
          `hiddenData:           ${last.hiddenData ? `[${last.hiddenData.join(', ')}]` : 'undefined (no data option)'}`,
        ].join('\n')
      : '— no event has been dispatched —'
  }}</pre>

  <p class="pg-muted">
    The card starts at 60px, where <strong>nothing fits at all</strong> — the narrowest chip is
    wider than the whole container. Through 2.2.0 that first
    pass dispatched no event: the visible set began empty and the empty fit looked like "no change",
    so an over-full row rendered with no badge at exactly the widths where the badge is the only
    thing the user could act on. Press <strong>Remount the row</strong> at any width to re-run that
    first pass.
    <br /><br />
    <strong>Add chip</strong> and <strong>Remove chip</strong> mutate the same array with
    <code>push</code> / <code>pop</code>. Keep the width wide enough that the visible chips never
    move and the readout still has to follow the hidden ones — the gate compares the payload a
    listener would see, not a proxy for it. Through 2.2.0 it compared the visible set, which these
    two buttons cannot change, so the count froze while the row went on changing underneath it.
  </p>
</template>

<style scoped>
.frame {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
  overflow: hidden;
  min-width: 40px;
}
.chips {
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
}
.more {
  flex-shrink: 0;
  font-size: 0.78rem;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}
</style>
