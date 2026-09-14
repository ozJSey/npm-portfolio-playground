<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

// 200 rows of exactly 40px in a 200px window — five visible at a time. The
// list has to be long enough that arrowing scrolls it, because the scroll is
// what makes hover hard.
const rows = Array.from({ length: 200 }, (_, i) => `Row ${i + 1}`)

const hover = ref(true)
const lastReason = ref('—')
const lastMove = ref('—')
const hoverMoves = ref(0)
const keyMoves = ref(0)
const pane = useTemplateRef<HTMLElement>('pane')

const options = computed(() => ({ hover: hover.value }))

function onMove(event: Event) {
  if (!(event instanceof CustomEvent)) return
  const detail = event.detail
  lastReason.value = detail.reason
  lastMove.value = `${detail.previousItem ? detail.previousItem.textContent.trim() : '—'} → ${detail.item.textContent.trim()}`
  if (detail.reason === 'hover') hoverMoves.value += 1
  else keyMoves.value += 1
}

function reset() {
  lastReason.value = '—'
  lastMove.value = '—'
  hoverMoves.value = 0
  keyMoves.value = 0
  if (pane.value) pane.value.scrollTop = 0
  const first = pane.value?.querySelector('li')
  if (first instanceof HTMLElement) first.focus()
}
</script>

<template>
  <p class="pg-muted">
    <strong>Arrow to row 3, move the mouse over row 7, press <kbd>↓</kbd> — you land on row 8.</strong>
    Opt-in with <code>hover: true</code>, because silently moving the active item is right for a
    menu and wrong for a toolbar.
  </p>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      <input type="checkbox" v-model="hover" />
      <code>hover: true</code>
    </label>
    <button class="pg-btn" @click="reset">Reset</button>
  </div>

  <div ref="pane" class="list-pane">
    <ul class="list" role="listbox" aria-label="Rows" v-keyboard-navigation="options"
      @keyboard-navigate="onMove">
      <li v-for="row in rows" :key="row" role="option" class="row" :aria-selected="false">
        {{ row }}
      </li>
    </ul>
  </div>

  <p class="pg-kv">last move: <code class="move">{{ lastMove }}</code></p>
  <p class="pg-kv">reason: <code class="reason">{{ lastReason }}</code></p>
  <p class="pg-kv">
    moves by hover: <code class="hover-count">{{ hoverMoves }}</code> ·
    by key: <code class="key-count">{{ keyMoves }}</code>
  </p>

  <p class="pg-muted">
    <strong>Now the part that makes this hard.</strong> Park the cursor over a row, take your hand
    off the mouse, and hold <kbd>↓</kbd>. The list scrolls, so the row under your stationary cursor
    keeps changing and the browser keeps firing pointer events for it — a handler written against
    <code>mouseover</code> yanks the highlight back to the mouse on every keystroke, and the user
    can never leave. This card reacts to the <em>cursor</em> moving instead: a pointer event whose
    coordinates have not changed is the document moving, not the mouse, and it is ignored. Belt to
    that brace, the cursor is deaf for 150ms after a key this group acted on, so a resting hand's
    one-pixel jitter cannot hijack a held arrow either.
  </p>
  <p class="pg-muted">
    <strong>Hover never scrolls</strong> — the hovered row is under the cursor, so it is already on
    screen, and scrolling would move the list out from under the mouse and fire another hover. And
    <strong>hover never moves focus into the group</strong>: it follows the cursor only when the
    keyboard is already standing on one of these rows. Card 17 is the case that rule exists for.
  </p>
</template>

<style scoped>
.list-pane {
  height: 200px;
  overflow-y: auto;
  box-shadow: inset 0 0 0 1px #dfe3ec;
  border-radius: 10px;
  background: #fff;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  box-sizing: border-box;
  height: 40px;
  padding: 0 0.75rem;
  line-height: 40px;
  font-size: 0.85rem;
  border-bottom: 1px solid #f1f3f9;
  cursor: pointer;
}
.row[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.row:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
.move,
.reason {
  font-size: 0.78rem;
  color: #3730a3;
}
</style>
