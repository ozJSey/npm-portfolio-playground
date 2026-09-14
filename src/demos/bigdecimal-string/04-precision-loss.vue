<script setup lang="ts">
import { bd } from '@ozjsey/bigdecimal-string'

/**
 * The claim underneath "human-readable large numbers": a double cannot hold
 * more than 2^53 - 1 as an exact integer, so formatting it prettily formats a
 * number that is already wrong. `Intl` groups the digits it was given; it
 * cannot recover the ones the parse threw away.
 */
const ORDER_ID = '9007199254740993'
const ACCOUNT = '123456789012345678901'
const grouped = new Intl.NumberFormat('en-US')

const rows = [
  {
    claim: 'max-safe',
    expr: `Number("${ORDER_ID}")   // 2^53 + 1`,
    native: String(Number(ORDER_ID)),
    library: bd(ORDER_ID).toString(),
    note: 'The last digit is not rounded, it is gone.',
  },
  {
    claim: 'round-trip',
    expr: `parse the id, print it again, is it the same string?`,
    native: String(String(Number(ORDER_ID)) === ORDER_ID),
    library: String(bd(ORDER_ID).toFixed(0) === ORDER_ID),
    note: 'The digits that went in are the digits that came out.',
  },
  {
    claim: 'grouped',
    expr: `Intl.NumberFormat().format(Number("${ACCOUNT}"))`,
    native: grouped.format(Number(ACCOUNT)),
    library: bd(ACCOUNT).toFormat(),
    note: 'Both are grouped. Only one is the number.',
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
    This is the version of the large-number claim that holds at every size:
    <code>Intl.NumberFormat</code> is a formatter, not a parser, and by the time it runs the value is
    already a double. Keep the id, the balance or the wei amount as a string and hand it to
    <code>bd()</code>, and every digit survives the round trip.
  </p>
</template>
