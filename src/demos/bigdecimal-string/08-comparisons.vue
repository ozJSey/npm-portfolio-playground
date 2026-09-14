<script setup lang="ts">
import { bd } from '@ozjsey/bigdecimal-string'

/**
 * The claims: `gt`, `gte`, `lt`, `lte`, `eq` — plus `compareTo`, which the
 * README does not mention but which is what makes a sort work.
 *
 * The interesting rows are the two ways people compare money today: `===` on
 * floats, which is wrong by a rounding error, and `===` (or `.sort()`) on
 * strings, which is wrong by lexicography.
 */
const AMOUNTS = ['10', '9', '100', '9.50']

/**
 * Typed as `string` rather than left as literals so that `===` below is a real
 * runtime comparison. With literal types TypeScript answers the question at
 * compile time and refuses to emit the check at all — which is a neat
 * illustration of the problem, but not a demonstration of it.
 */
const withTrailingZero: string = '1.10'
const withoutTrailingZero: string = '1.1'

const nativeSorted = [...AMOUNTS].sort().join(', ')
const librarySorted = [...AMOUNTS]
  .sort((left, right) => bd(left).compareTo(right))
  .join(', ')

const rows = [
  {
    claim: 'eq-float',
    expr: '(0.1 + 0.2) === 0.3',
    native: String(0.1 + 0.2 === 0.3),
    library: String(bd('0.1').add('0.2').eq('0.3')),
  },
  {
    claim: 'gt-float',
    expr: '(0.1 + 0.2) > 0.3',
    native: String(0.1 + 0.2 > 0.3),
    library: String(bd('0.1').add('0.2').gt('0.3')),
    note: 'A balance check that fires on a rounding error is a support ticket.',
  },
  {
    claim: 'eq-trailing-zero',
    expr: '"1.10" equals "1.1"',
    native: String(withTrailingZero === withoutTrailingZero),
    library: String(bd(withTrailingZero).eq(withoutTrailingZero)),
    note: 'Scale is not value — eq() aligns them first.',
  },
  {
    claim: 'gte',
    expr: '10 >= 10',
    native: String(10 >= 10),
    library: String(bd('10').gte('10')),
  },
  {
    claim: 'lt',
    expr: '5 < 10',
    native: String(5 < 10),
    library: String(bd('5').lt('10')),
  },
  {
    claim: 'lte',
    expr: '5 <= 5',
    native: String(5 <= 5),
    library: String(bd('5').lte('5')),
  },
  {
    claim: 'sort',
    expr: `["${AMOUNTS.join('", "')}"].sort()`,
    native: nativeSorted,
    library: librarySorted,
    note: 'sort() with no comparator sorts strings. compareTo is the comparator.',
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
    Rows four to six agree, and the card says so rather than manufacturing a difference: once the
    values are exact, <code>gte</code> / <code>lt</code> / <code>lte</code> are ordinary
    comparisons. What they buy you is that they still work when the operands have different scales,
    which is the case the first and third rows fail.
  </p>
</template>
