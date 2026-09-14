<script setup lang="ts">
import { BigDecimal, bd } from '@ozjsey/bigdecimal-string'

/**
 * The claim: "Precise decimals — solves the 0.1 + 0.2 problem using BigInt
 * internally."
 *
 * Both columns are evaluated here, in the page. The left one is not a string
 * copied out of a blog post — it is what this browser's doubles answer today.
 */
const rows = [
  {
    claim: 'add',
    expr: '0.1 + 0.2',
    native: String(0.1 + 0.2),
    library: bd('0.1').add('0.2').toString(),
  },
  {
    claim: 'subtract',
    expr: '0.3 - 0.1',
    native: String(0.3 - 0.1),
    library: bd('0.3').subtract('0.1').toString(),
  },
  {
    claim: 'multiply',
    expr: '0.07 * 100',
    native: String(0.07 * 100),
    library: bd('0.07').multiply('100').toString(),
  },
  {
    claim: 'divide',
    expr: '0.3 / 0.1',
    native: String(0.3 / 0.1),
    library: bd('0.3').divide('0.1').toString(),
  },
  {
    claim: 'sum',
    expr: '0.1 + 0.2 + 0.3',
    native: String(0.1 + 0.2 + 0.3),
    library: BigDecimal.sum('0.1', '0.2', '0.3').toString(),
  },
  {
    claim: 'equality',
    expr: '(0.1 + 0.2) equals 0.3',
    native: String(0.1 + 0.2 === 0.3),
    library: String(bd('0.1').add('0.2').eq('0.3')),
    note: 'The one that bites in a conditional, not in a log line.',
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
    A double stores <code>0.1</code> as the nearest binary fraction, which is not
    <code>0.1</code>. The library never converts to a double: it parses the digits you typed into a
    <code>BigInt</code> of unscaled units plus a scale, so <code>0.1 + 0.2</code> is
    <code>10 + 20</code> hundredths and the answer has nowhere to drift to.
  </p>
</template>
