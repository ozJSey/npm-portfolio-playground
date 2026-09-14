<script setup lang="ts">
import { bd } from '@ozjsey/bigdecimal-string'

/**
 * Two claims: "Chainable API — fluent method chaining for calculations" and
 * "Immutable — all operations return new instances".
 *
 * Immutability is invisible unless something is shown NOT changing, so the
 * left column runs the idiom it replaces: a mutable accumulator.
 */
const readme = bd('1000').subtract('100').multiply('1.5').divide(2).add('50')

const drifting = bd('0.1').multiply(3).subtract('0.2').add('0.05')

/** The library instance is never written to — these three lines prove it. */
const price = bd('19.99')
const withTax = price.multiply('1.08')
const priceAfterwards = price.toString()

/** The plain-JavaScript idiom for the same three lines. */
let mutable = 19.99
mutable *= 1.08
const mutableAfterwards = mutable

const rows = [
  {
    claim: 'chain',
    expr: 'bd("1000").subtract("100").multiply("1.5").divide(2).add("50")',
    native: String(((1000 - 100) * 1.5) / 2 + 50),
    library: readme.toFormat(),
    note: 'Five calls, one expression, no intermediate variables.',
  },
  {
    claim: 'chain-drift',
    expr: 'bd("0.1").multiply(3).subtract("0.2").add("0.05")',
    native: String(0.1 * 3 - 0.2 + 0.05),
    library: drifting.toString(),
    note: 'Every link is exact, so the error has nowhere to accumulate.',
  },
  {
    claim: 'immutable',
    expr: 'apply 8% tax, then read the original back',
    native: String(mutableAfterwards),
    library: priceAfterwards,
    note: 'The original instance is untouched — multiply() handed back a new one.',
  },
  {
    claim: 'new-instance',
    expr: 'did the operation return a new value, or overwrite the old one?',
    native: `overwrote it — the binding now holds ${String(mutableAfterwards)}`,
    library: `returned a new instance (${String(withTax !== price)}) worth ${withTax.toFormat()}, original still ${price.toString()}`,
    note: 'Both halves computed here, like every other row — nothing on this tab is typed in.',
  },
]
</script>

<template>
  <div v-for="row in rows" :key="row.claim" class="pg-vs" :data-claim="row.claim">
    <code class="pg-vs__expr">{{ row.expr }}</code>
    <div class="pg-vs__cols">
      <div class="pg-vs__col pg-vs__col--native">
        <span class="pg-vs__head">plain JavaScript</span>
        <output class="pg-vs__out" data-role="native">{{ row.native }}</output>
      </div>
      <div class="pg-vs__col pg-vs__col--lib">
        <span class="pg-vs__head">bigdecimal-string</span>
        <output class="pg-vs__out" data-role="bigdecimal">{{ row.library }}</output>
        <span v-if="row.note" class="pg-vs__note">{{ row.note }}</span>
      </div>
    </div>
  </div>

  <p class="pg-muted">
    The third row is the claim that matters in a codebase: <code>price</code> is a
    <code>const</code> holding an object, and the object stays put. Pass a
    <code>BigDecimal</code> to a function and it cannot come back changed — which is not true of the
    array of totals sitting next to it.
  </p>
</template>
