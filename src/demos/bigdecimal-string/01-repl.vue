<script setup lang="ts">
import { computed, ref } from 'vue'
import { bd } from '@ozjsey/bigdecimal-string'

type Op = 'add' | 'subtract' | 'multiply' | 'divide' | 'mod'

const a = ref('0.1')
const b = ref('0.2')
const op = ref<Op>('add')

const SYMBOL: Record<Op, string> = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  mod: '%',
}

const PRESETS: { label: string; a: string; b: string; op: Op }[] = [
  { label: '0.1 + 0.2', a: '0.1', b: '0.2', op: 'add' },
  { label: '0.3 - 0.1', a: '0.3', b: '0.1', op: 'subtract' },
  { label: '0.07 * 100', a: '0.07', b: '100', op: 'multiply' },
  { label: '2899.94 / 3', a: '2899.94', b: '3', op: 'divide' },
  { label: '1 / 0', a: '1', b: '0', op: 'divide' },
]

const expression = computed(() => `${a.value || '?'} ${SYMBOL[op.value]} ${b.value || '?'}`)

/**
 * Plain JavaScript, evaluated in the page every keystroke.
 *
 * Nothing on this card is a literal. `0.30000000000000004` typed into a demo
 * file is a claim ABOUT JavaScript; this is JavaScript answering.
 */
const native = computed(() => {
  const x = Number(a.value)
  const y = Number(b.value)
  switch (op.value) {
    case 'add':
      return String(x + y)
    case 'subtract':
      return String(x - y)
    case 'multiply':
      return String(x * y)
    case 'divide':
      return String(x / y)
    case 'mod':
      return String(x % y)
  }
  return ''
})

/** The same expression through the library. It throws on input it cannot parse. */
const library = computed(() => {
  try {
    const x = bd(a.value)
    switch (op.value) {
      case 'add':
        return x.add(b.value).toString()
      case 'subtract':
        return x.subtract(b.value).toString()
      case 'multiply':
        return x.multiply(b.value).toString()
      case 'divide':
        return x.divide(b.value).toString()
      case 'mod':
        return x.mod(b.value).toString()
    }
    return ''
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
})

const agree = computed(() => Number(native.value) === Number(library.value))

function usePreset(preset: { a: string; b: string; op: Op }) {
  a.value = preset.a
  b.value = preset.b
  op.value = preset.op
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.8rem">
    <label class="pg-label">
      a
      <input v-model="a" class="pg-input" type="text" size="14" aria-label="left operand" />
    </label>
    <select v-model="op" class="pg-select" aria-label="operation">
      <option value="add">add ( + )</option>
      <option value="subtract">subtract ( - )</option>
      <option value="multiply">multiply ( * )</option>
      <option value="divide">divide ( / )</option>
      <option value="mod">mod ( % )</option>
    </select>
    <label class="pg-label">
      b
      <input v-model="b" class="pg-input" type="text" size="14" aria-label="right operand" />
    </label>
  </div>

  <div class="pg-row" style="margin-bottom: 0.9rem">
    <span class="pg-label">try</span>
    <button
      v-for="preset in PRESETS"
      :key="preset.label"
      class="pg-btn"
      @click="usePreset(preset)"
    >
      {{ preset.label }}
    </button>
  </div>

  <div class="pg-vs" data-claim="repl">
    <code class="pg-vs__expr">{{ expression }}</code>
    <div class="pg-vs__cols">
      <div class="pg-vs__col pg-vs__col--native">
        <span class="pg-vs__head">plain JavaScript</span>
        <output class="pg-vs__out" data-role="native">{{ native }}</output>
        <span class="pg-vs__note">Number(a) {{ SYMBOL[op] }} Number(b), stringified</span>
      </div>
      <div class="pg-vs__col pg-vs__col--lib">
        <span class="pg-vs__head">bigdecimal-string</span>
        <output class="pg-vs__out" data-role="bigdecimal">{{ library }}</output>
        <span class="pg-vs__note">bd(a).{{ op }}(b).toString()</span>
      </div>
    </div>
  </div>

  <p class="pg-kv" data-role="verdict">
    {{ agree ? 'Both answers agree here.' : 'The two answers DISAGREE — that gap is the library.' }}
  </p>

  <p class="pg-muted">
    Type anything into <code>a</code> and <code>b</code>. Both columns recompute on every keystroke,
    so the left one is whatever this browser's IEEE-754 doubles actually do — not a number written
    into the demo. <code>1 / 0</code> is worth trying: JavaScript answers
    <code>Infinity</code> and the library refuses.
  </p>
  <p class="pg-muted">
    <strong>Feed it strings.</strong> <code>bd(0.1 + 0.2)</code> is already
    <code>0.30000000000000004</code> before the library sees it — the exactness starts at the
    literal, which is why every example here quotes its operands.
  </p>
</template>
