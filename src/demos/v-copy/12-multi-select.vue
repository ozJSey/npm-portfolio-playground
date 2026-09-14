<script setup lang="ts">
import { computed, ref } from 'vue'

interface Person {
  id: number
  name: string
  email: string
  team: string
}

const rows: Person[] = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@lovelace.dev', team: 'Compilers' },
  { id: 2, name: 'Grace Hopper', email: 'grace@hopper.dev', team: 'Languages' },
  { id: 3, name: 'Alan Turing', email: 'alan@turing.dev', team: 'Crypto' },
  { id: 4, name: 'Barbara Liskov', email: 'barbara@liskov.dev', team: 'Types' },
  { id: 5, name: 'Donald Knuth', email: 'don@knuth.dev', team: 'Typesetting' },
]

const selected = ref<number[]>([2, 3])

function toggle(id: number) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id]
}

const allSelected = computed(() => selected.value.length === rows.length)

function toggleAll() {
  selected.value = allSelected.value ? [] : rows.map((r) => r.id)
}

// The copied context: a TSV block with a header row, ready to paste into a
// spreadsheet, an email, or a chat message. A string source is the value from
// the LAST RENDER — that is all a template expression can be — and it is live
// here because ticking a box re-renders. When the source depends on something
// the render does not track, pass the getter form instead:
// `v-copy="{ source: () => build() }"` is called at the moment of the copy.
const payload = computed(() => {
  const picked = rows.filter((r) => selected.value.includes(r.id))
  return ['name\temail\tteam', ...picked.map((r) => `${r.name}\t${r.email}\t${r.team}`)].join('\n')
})
</script>

<template>
  <table class="grid">
    <thead>
      <tr>
        <th><input type="checkbox" :checked="allSelected" @change="toggleAll" /></th>
        <th>name</th>
        <th>email</th>
        <th>team</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="r in rows"
        :key="r.id"
        :class="{ picked: selected.includes(r.id) }"
        @click="toggle(r.id)"
      >
        <td>
          <input
            type="checkbox"
            :checked="selected.includes(r.id)"
            @click.stop
            @change="toggle(r.id)"
          />
        </td>
        <td>{{ r.name }}</td>
        <td class="mono">{{ r.email }}</td>
        <td>{{ r.team }}</td>
      </tr>
    </tbody>
  </table>

  <div class="pg-row" style="margin-top: 0.7rem; align-items: flex-start">
    <!-- `false` disables the binding while nothing is selected — same idiom as demo 9. -->
    <button class="pg-btn pg-btn--primary copy-btn" v-copy="selected.length ? payload : false">
      Copy {{ selected.length }} selected as TSV
    </button>
    <textarea
      class="pg-input"
      rows="3"
      placeholder="paste here to verify — header row + one line per picked row"
      style="width: 100%; max-width: 26rem"
    ></textarea>
  </div>

  <p class="pg-muted">
    v-copy has no multi-select primitive — it does not need one. The selection is ordinary app
    state; the aggregated block is a <code>computed</code> passed as the binding, re-read on every
    render the selection causes. Swap the join for <code>JSON.stringify</code> or a markdown table and the same three lines
    become “copy as JSON” / “copy as markdown”.
  </p>
</template>

<style scoped>
.grid {
  border-collapse: collapse;
  font-size: 0.85rem;
}
.grid th {
  text-align: left;
  font-size: 0.72rem;
  color: #5b6478;
  padding: 0 0.6rem 0.3rem;
}
.grid td {
  border-top: 1px solid var(--stage-border);
  padding: 0.3rem 0.6rem;
  cursor: pointer;
}
.grid tr.picked td {
  background: #eef2ff;
}
.mono {
  font-family: var(--mono);
}
.copy-btn[data-copied] {
  background: #16a34a;
  border-color: #16a34a;
}
.copy-btn[data-copied]::after {
  content: ' ✓';
}
</style>
