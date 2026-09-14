<script setup lang="ts">
import { bd } from '@ozjsey/bigdecimal-string'

/**
 * The claims: `toString()`, `toString({ prettify: true })`, `toFormat()`,
 * `toFixed(n)`, `toFixed(n, { prettify: true })`, and "prettify with commas —
 * toFormat() adds thousand separators automatically".
 *
 * Honest about where the win is. At dashboard sizes `Intl` already does this,
 * and the left column proves it rather than pretending otherwise. The second
 * value is past 2^53, which is where the two stop agreeing.
 */
const SMALL = '1234567.89'
const BIG = '9007199254740993.55'
const n = Number(SMALL)
const groupTwo = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const rows = [
  {
    claim: 'to-string',
    expr: `toString()`,
    native: n.toString(),
    library: bd(SMALL).toString(),
  },
  {
    claim: 'prettify',
    expr: `toString({ prettify: true })`,
    native: n.toLocaleString('en-US'),
    library: bd(SMALL).toString({ prettify: true }),
  },
  {
    claim: 'to-format',
    expr: `toFormat()`,
    native: groupTwo.format(n),
    library: bd(SMALL).toFormat(),
    note: 'Same answer as Intl here. Say so, rather than staging a fight.',
  },
  {
    claim: 'to-fixed',
    expr: `toFixed(4)`,
    native: n.toFixed(4),
    library: bd(SMALL).toFixed(4),
  },
  {
    claim: 'to-fixed-pretty',
    expr: `toFixed(2, { prettify: true })`,
    native: groupTwo.format(n),
    library: bd(SMALL).toFixed(2, { prettify: true }),
    note: 'Intl needs two options to do this; toFixed takes the digits and a flag.',
  },
  {
    claim: 'trailing-zero',
    expr: `toFormat()  //  9876543210.50, a dashboard revenue figure`,
    native: String(9876543210.5),
    library: bd('9876543210.50').toFormat(),
    note: 'The cent column survives. A double has no idea it was ever there.',
  },
  {
    claim: 'integer-scale',
    expr: `toFormat()  //  12345678, a whole count`,
    native: (12345678).toLocaleString('en-US'),
    library: bd('12345678').toFormat(),
    note: 'Default scale is 2, so a count formats as currency unless you say otherwise.',
  },
  {
    claim: 'beyond-double',
    expr: `toFormat()  //  ${BIG}`,
    native: groupTwo.format(Number(BIG)),
    library: bd(BIG).toFormat(),
    note: 'Past 2^53 the agreement ends — and the left side is the one that moved.',
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
    The scale is sticky: <code>bd("1234567.89")</code> keeps two decimals through every operation
    and prints them, where a double prints <code>9876543210.5</code> and drops the cent column
    the moment it happens to be a zero.
  </p>
</template>
