<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { FitChildrenEventDetail } from '@ozjsey/v-fit-children'

interface Person {
  id: number
  name: string
}

const width = ref(560)
const open = ref(false)
const trigger = useTemplateRef<HTMLElement>('trigger')

// Lengths vary, but nothing is so long that it swamps the row: one 300px name
// makes every width produce the same answer and the card demonstrates nothing.
const people = ref<Person[]>([
  { id: 1, name: 'Jo' },
  { id: 2, name: 'Ada Lovelace' },
  { id: 3, name: 'Al' },
  { id: 4, name: 'Grace Hopper' },
  { id: 5, name: 'Xu' },
  { id: 6, name: 'Edsger Dijkstra' },
  { id: 7, name: 'Mo' },
  { id: 8, name: 'Konstantin Tsiolkovsky' },
  { id: 9, name: 'Wen' },
  { id: 10, name: 'Annie Jump Cannon-Whitfield' },
])

const hidden = ref<Person[]>([])
const hiddenIndices = ref<number[]>([])
const selected = ref<Person | null>(null)

// hiddenData hands back the real objects, not just indices — so the menu can
// act on one directly. That is the whole reason the `data` option exists.
function select(person: Person) {
  selected.value = person
  open.value = false
}

/**
 * The name shown on the trigger: whichever you picked, falling back to the
 * first hidden one. Widen the row until your pick comes back into view and it
 * falls back on its own, rather than naming someone who is plainly visible.
 */
const label = computed(() => {
  const stillHidden = hidden.value.find((p) => p.id === selected.value?.id)
  return (stillHidden ?? hidden.value[0])?.name ?? ''
})

// The generic flows through: e.detail.hiddenData is Person[] | undefined.
function onUpdate(e: Event) {
  const detail = (e as CustomEvent<FitChildrenEventDetail<Person>>).detail
  hidden.value = detail.hiddenData ?? []
  hiddenIndices.value = detail.hiddenIndices
}
</script>

<template>
  <label class="pg-label" style="margin-bottom: 0.7rem">
    container width
    <input v-model.number="width" type="range" min="280" max="720" />
    {{ width }}px
  </label>

  <div class="frame" :style="{ width: `${width}px` }">
    <div
      class="avatars"
      v-fit-children="{ data: people, offsetNeededInPx: 0 }"
      @fit-children-updated="onUpdate"
    >
      <span v-for="p in people" :key="p.id" class="pg-chip">{{ p.name }}</span>
    </div>

    <!-- The trigger sits IN the row and is sized by its own label, which names
         whoever you picked from the menu. Pick "Mo" and the button collapses;
         pick "Annie Jump Cannon-Whitfield" and it stretches by ~150px — taken
         straight out of the row, so chips drop as you choose. Nothing external
         drives the width: you resize a sibling by clicking, and the row has to
         notice. It is also NOT monotonic (a short name frees room a long one
         had taken), which is the setup that oscillates if the loop is handled
         naively. -->
    <button ref="trigger" v-if="hidden.length" class="overflow-trigger" @click="open = !open">
      +{{ hidden.length }} · {{ label }}
    </button>
  </div>

  <!-- The panel is teleported, so opening it costs the row nothing. Only the
       trigger participates in the layout the directive is measuring. -->
  <div v-show="open && hidden.length" v-teleport-to="{ to: trigger }" class="overflow-menu">
    <button
      v-for="p in hidden"
      :key="p.id"
      class="overflow-item"
      :class="{ 'is-selected': selected?.id === p.id }"
      @click="select(p)"
    >
      {{ p.name }}
    </button>
  </div>

  <p class="pg-kv" style="margin-top: 0.6rem">
    hiddenIndices: [{{ hiddenIndices.join(', ') }}]<br />
    hiddenData: [{{ hidden.map((p) => p.name).join(', ') }}]<br />
    selected: {{ selected ? `${selected.name} (id ${selected.id})` : '—' }}
  </p>
  <p class="pg-muted">
    <code>data</code> must map 1:1 with the immediate children. <code>hiddenIndices</code> is always
    emitted, so you can map manually when your children are not a straight <code>v-for</code>.
    <br /><br />
    <strong>The overflow trigger is a sibling that resizes itself.</strong> When it grows, the row
    loses that width — but the host's own box and the frame's box are both unchanged, so an
    implementation watching the container sees nothing happen and keeps a stale answer. Every
    sibling is observed here, which is what makes the row notice.
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
}
/* Shrink-to-fit, so the trigger sits directly after the last visible chip
   rather than after an empty stretch of a flex-1 host. */
.avatars {
  display: flex;
  gap: 0.4rem;
  overflow: hidden;
}
.overflow-trigger {
  flex-shrink: 0;
  /* No max-width. Capping it would saturate the button at one size and the
     card would demonstrate nothing — the same reason a <select> is useless
     here. Naming a single person bounds it at the longest name instead. */
  white-space: nowrap;
  font-size: 0.78rem;
  cursor: pointer;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
}
.overflow-menu {
  background: #fff;
  border: 1px solid #dfe3ec;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 12%);
  padding: 0.3rem;
  min-width: 10rem;
}
.overflow-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.25rem 0.6rem;
  font-size: 0.82rem;
  border: 0;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.overflow-item:hover {
  background: #f1f5f9;
}
.overflow-item.is-selected {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
</style>
