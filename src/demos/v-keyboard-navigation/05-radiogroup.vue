<script setup lang="ts">
import { ref } from 'vue'

const sizes = ['Small', 'Medium', 'Large']
const aria = ref('Medium')
const native = ref('Medium')
</script>

<template>
  <p class="pg-muted">
    Two radio groups, and the directive treats them differently on purpose.
  </p>

  <div class="pg-row" style="align-items: flex-start; gap: 2rem">
    <div>
      <h5 class="head">role="radio" — driven</h5>
      <div class="group" role="radiogroup" aria-label="ARIA size" v-keyboard-navigation>
        <div v-for="size in sizes" :key="size" role="radio" class="radio"
          :aria-checked="aria === size" @click="aria = size" @keydown.space.prevent="aria = size">
          <span class="dot" />{{ size }}
        </div>
      </div>
      <p class="pg-kv">selected: {{ aria }}</p>
    </div>

    <div>
      <h5 class="head">native inputs — left alone</h5>
      <div class="group" v-keyboard-navigation="'radiogroup'">
        <label v-for="size in sizes" :key="size" class="radio">
          <input type="radio" name="native-size" :value="size" v-model="native" />
          {{ size }}
        </label>
      </div>
      <p class="pg-kv">selected: {{ native }}</p>
    </div>
  </div>

  <p class="pg-muted">
    On the left the arrows move focus and <em>nothing else</em> — selection is written by the click
    and the <kbd>Space</kbd> handler in this card, never by the directive. On the right the arrows
    are not claimed at all: a native radio group already implements roving tabindex <em>and</em>
    moves the selection, so intercepting the key would move focus while suppressing the check.
    <kbd>Home</kbd>, <kbd>End</kbd> and typeahead have no native behaviour there, so those still
    work.
  </p>
</template>

<style scoped>
.head {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  width: 190px;
  padding: 0.3rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
}
.radio {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.5rem;
  border-radius: 7px;
  font-size: 0.85rem;
  cursor: pointer;
}
.radio:focus-visible,
.radio:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #9aa3b8;
}
.radio[aria-checked='true'] .dot {
  border-color: #4f46e5;
  background: #4f46e5;
  box-shadow: inset 0 0 0 2px #fff;
}
.radio[data-keyboard-navigation-item='active'] {
  background: #f4f6fb;
}
</style>
