<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

const width = ref(560)
const host = useTemplateRef<HTMLElement>('host')

// Every chip is pinned, so the visible set is the same set at every width:
// four in, four out, nothing the directive is allowed to hide.
const tags = ['alpha', 'beta', 'gamma', 'delta']

const fromEvent = ref<boolean | null>(null)
const fromAttribute = ref('—')

function onUpdate(e: Event) {
  const detail = (e as CustomEvent<FitChildrenEventDetail>).detail
  fromEvent.value = detail.isOverflowing
  fromAttribute.value = host.value?.getAttribute('data-v-fit-state') ?? '—'
}
</script>

<template>
  <label class="pg-label" style="margin-bottom: 0.7rem">
    container width
    <input v-model.number="width" type="range" min="120" max="720" />
    {{ width }}px
  </label>

  <div class="frame" :style="{ width: `${width}px` }">
    <div ref="host" class="chips" v-fit-children="{ offsetNeededInPx: 0 }" @fit-children-updated="onUpdate">
      <span v-for="tag in tags" :key="tag" class="pg-chip pinned" data-v-fit-keep>★ {{ tag }}</span>
    </div>
  </div>

  <p class="pg-kv" style="margin-top: 0.6rem">
    detail.isOverflowing: <code>{{ fromEvent === null ? '—' : fromEvent }}</code
    ><br />
    data-v-fit-state: <code>{{ fromAttribute }}</code>
  </p>

  <p class="pg-muted">
    <strong>Drag the slider down and watch the two readouts.</strong> They are the directive's two
    outputs for the same pass and they have to agree. Through 2.2.0 they did not: the attribute was
    written before the dispatch gate, and the gate watched the <em>visible set</em> — which is the
    one thing a row of entirely pinned children can never change. So the border flipped, the
    attribute flipped, and every event-driven consumer was told <code>false</code> forever.
    <br /><br />
    <code>isOverflowing</code> answers "does the content exceed the room", not "did anything get
    hidden". A row that cannot hide anything and is visibly clipped is overflowing, and reporting
    otherwise is how a "+N more" badge ends up reading <code>+0</code>.
  </p>
</template>

<style scoped>
.frame {
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
  overflow: hidden;
  min-width: 120px;
}
/* The attribute, styled directly — the CSS half of the contract keeps working
   even when the event half is broken, which is what made this hard to spot. */
.chips {
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
  border: 2px solid #86efac;
  border-radius: 6px;
  padding: 0.3rem;
  transition: border-color 0.15s ease;
}
.chips[data-v-fit-state='overflowing'] {
  border-color: #f59e0b;
}
.pinned {
  background: #fef3c7;
  border-color: #fcd34d;
  white-space: nowrap;
}
</style>
