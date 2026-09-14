<script setup lang="ts">
import { BigDecimal, bd } from '@ozjsey/bigdecimal-string'

/**
 * The README's "Static Methods" and "Utility Methods" sections:
 * `sum`, `max`, `min`, `zero`, `one` — and `abs`, `negate`, `isZero`,
 * `isPositive`, `isNegative`.
 */
const CENTS = ['0.1', '0.2', '0.3']
const BIG = ['9007199254740993', '9007199254740992']

const rows = [
  {
    claim: 'sum',
    expr: `sum(${CENTS.join(', ')})`,
    native: String(CENTS.reduce((total, value) => total + Number(value), 0)),
    library: BigDecimal.sum(...CENTS).toString(),
  },
  {
    claim: 'max',
    expr: `max(${BIG.join(', ')})`,
    native: String(Math.max(...BIG.map(Number))),
    library: BigDecimal.max(...BIG).toFixed(0),
    note: 'Both candidates collapse to the same double before Math.max sees them.',
  },
  {
    claim: 'min',
    expr: 'min(5, 10, 3)',
    native: String(Math.min(5, 10, 3)),
    library: BigDecimal.min('5', '10', '3').toString(),
  },
  {
    claim: 'zero-one',
    expr: 'zero() and one()',
    native: `${String(0)} and ${String(1)}`,
    library: `${BigDecimal.zero().toString()} and ${BigDecimal.one().toString()}`,
    note: 'They arrive at the default scale of 2, ready to add to money.',
  },
  {
    claim: 'abs',
    expr: 'abs(-50)',
    native: String(Math.abs(-50)),
    library: bd('-50').abs().toString(),
  },
  {
    claim: 'negate',
    expr: 'negate(50)',
    native: String(-50),
    library: bd('50').negate().toString(),
  },
  {
    claim: 'predicates',
    expr: 'isZero("0.00") / isPositive("10") / isNegative("-10")',
    native: [Number('0.00') === 0, Number('10') > 0, Number('-10') < 0].join(' / '),
    library: [bd('0.00').isZero(), bd('10').isPositive(), bd('-10').isNegative()].join(' / '),
    note: 'Agreement, and worth showing as agreement.',
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
    <code>sum</code> is the one that earns its place: a <code>reduce</code> over prices accumulates
    a rounding error per item, and a hundred-line invoice accumulates a hundred of them.
    <code>max</code> and <code>min</code> only diverge past 2^53, and the card shows the case where
    they do rather than a case where they do not.
  </p>
</template>
