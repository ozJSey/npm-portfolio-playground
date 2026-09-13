<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const width = ref(500)
const pinInput = ref(true)
const inputRef = useTemplateRef<HTMLElement>('tokenInput')

const token = ref('')

// Few enough that the EMPTY input still fits at the default width — otherwise
// the input starts hidden and the whole point (watching it vanish under the
// cursor as you type) never happens.
const tags = ['alpha', 'beta', 'gamma', 'delta']
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.7rem">
    <label class="pg-label">
      width
      <input v-model.number="width" type="range" min="240" max="700" />
      {{ width }}px
    </label>
    <label class="pg-label">
      <input v-model="pinInput" type="checkbox" /> pin the input via keepVisibleEl
    </label>
  </div>

  <div class="frame" :style="{ width: `${width}px` }">
    <div
      class="field"
      v-fit-children="{ offsetNeededInPx: 0, keepVisibleEl: pinInput ? inputRef : undefined }"
    >
      <span v-for="tag in tags" :key="tag" class="pg-chip">{{ tag }}</span>

      <!-- Option B: the attribute form needs no ref at all. -->
      <span class="pg-chip pinned" data-v-fit-keep>★ always here</span>

      <!-- keepVisibleEl may point at a DESCENDANT; the directive walks up to
           the matching immediate child. -->
      <div class="wrap">
        <!-- The input GROWS with what you type. A fixed `size` would have made
             this card static: the whole failure it exists to show only happens
             while the element you are typing into is the thing changing size. -->
        <input
          ref="tokenInput"
          v-model="token"
          class="pg-input"
          placeholder="type a tag…"
          :size="Math.max(8, token.length + 2)"
        />
      </div>
    </div>
  </div>

  <p class="pg-muted">
    <strong>Uncheck the box, then type.</strong> The input widens with every character until the row
    runs out of room — and then it vanishes underneath the cursor, mid-word. That is the whole bug:
    the element the user is interacting with is also the element pushing the row over, so a naive
    "hide whatever overflows" hides the thing being typed into.
    <br /><br />
    Tick the box and type the same thing: the input is pinned, so chips drop instead and it stays put
    no matter how long the token gets. Pinned children are never hidden wherever they sit — if they
    alone exceed the width they overflow rather than vanish, which is the honest failure for
    something the user is mid-interaction with.
  </p>
</template>

<style scoped>
.frame {
  border: 1px dashed #b9c1d4;
  border-radius: 8px;
  padding: 0.6rem;
}
.field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  overflow: hidden;
}
.pinned {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #b45309;
}
.wrap {
  flex-shrink: 0;
}
</style>
