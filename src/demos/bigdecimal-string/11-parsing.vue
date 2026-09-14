<script setup lang="ts">
import { bd } from '@ozjsey/bigdecimal-string'

/**
 * The README's "Creating Instances" section: from a string, from scientific
 * notation, from a number, and with an explicit precision.
 *
 * The last two rows are the reason this card exists. The README says
 * `bd("1,234.56")` strips the comma. Computed live, it does not — and because
 * `toFormat()` produces exactly that shape, the library cannot read its own
 * output back.
 */
const FORMATTED = bd('1234567.89').toFormat()

const rows = [
  {
    claim: 'from-string',
    expr: 'bd("123.45")',
    native: String(Number('123.45')),
    library: bd('123.45').toString(),
  },
  {
    claim: 'from-scientific',
    expr: 'bd("2.5e12")',
    native: String(Number('2.5e12')),
    library: bd('2.5e12').toString(),
  },
  {
    claim: 'from-number',
    expr: 'bd(123.45)',
    native: String(123.45),
    library: bd(123.45).toString(),
  },
  {
    claim: 'precision-3',
    expr: 'bd("123.456", 3)',
    native: (123.456).toFixed(3),
    library: bd('123.456', 3).toString(),
  },
  {
    claim: 'precision-4',
    expr: 'bd("100", 4)',
    native: (100).toFixed(4),
    library: bd('100', 4).toString(),
  },
  {
    claim: 'commas',
    expr: 'bd("1,234.56")   // README: "Commas are stripped"',
    native: String(parseFloat('1,234.56')),
    library: bd('1,234.56').toString(),
    warn:
      'Neither side is 1234.56. parseFloat stops at the comma and returns 1; the library splits on it and returns 1.234. The comma is NOT stripped — this README line is wrong, and it is wrong in the direction that silently corrupts a value instead of throwing.',
  },
  {
    claim: 'round-trip',
    expr: `bd(bd("1234567.89").toFormat())   // "${FORMATTED}" back in`,
    native: String(parseFloat(FORMATTED)),
    library: bd(FORMATTED).toString(),
    warn:
      'Same defect, from the other end: toFormat() emits grouped digits and bd() cannot read them. Format on the way out only, and keep the unformatted string as the value.',
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
      </div>
    </div>
    <p v-if="row.warn" class="claim-warn" data-role="claim-warning">{{ row.warn }}</p>
  </div>

  <p class="pg-muted">
    The scale is inferred from the digits you write and never goes below 2:
    <code>bd("123.456")</code> keeps three, <code>bd("100")</code> gets two, and the second argument
    overrides both. Pass a precision smaller than the input and the extra digits are rounded away at
    construction, not kept in reserve.
  </p>
</template>

<style scoped>
/* Part of what this card demonstrates: a documented claim the live values
   contradict is flagged on the card rather than quietly left standing. */
.claim-warn {
  margin: 0.35rem 0 0;
  padding: 0.35rem 0.55rem;
  border-left: 3px solid #b91c1c;
  background: #fef2f2;
  color: #7f1d1d;
  font-size: 0.76rem;
  border-radius: 0 6px 6px 0;
}
</style>
