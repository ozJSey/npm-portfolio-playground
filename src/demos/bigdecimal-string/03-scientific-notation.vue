<script setup lang="ts">
import { bd } from '@ozjsey/bigdecimal-string'

/**
 * The claim: "Display really large numbers on screen without scientific
 * notation", and "Why not just use toLocaleString()".
 *
 * Computing the left column instead of printing it is the entire reason this
 * card is worth having. Two of the README's sentences about JavaScript do not
 * survive it, and the rows below say which.
 */
const rows = [
  {
    claim: 'tiny',
    expr: 'String(0.00000001)',
    native: String(0.00000001),
    library: bd('0.00000001').toString(),
    note: 'A satoshi. Doubles go exponential below 1e-6, so this one is real.',
  },
  {
    claim: 'huge',
    expr: 'String(1e21)',
    native: String(1e21),
    library: bd('1e21').toFormat(),
    note: 'And this is where they go exponential going up: at 1e21, not before.',
  },
  {
    claim: 'e15-readme',
    expr: 'String(1e15)',
    native: String(1e15),
    library: bd('1e15').toFormat(),
    warn:
      'README says this prints 1e+15. It does not — see the left column. What the library actually adds at this size is grouping and a fixed 2-decimal scale.',
  },
  {
    claim: 'locale-readme',
    expr: '(1e21).toLocaleString()',
    native: (1e21).toLocaleString(),
    library: bd('1e21').toFormat(),
    warn:
      'README says toLocaleString returns "1e+21". On any engine with ICU — every browser you will meet — it groups the digits. The difference left is the scale.',
  },
  {
    claim: 'api-value',
    expr: 'String(2.5e12)  // a value straight off an API',
    native: String(2.5e12),
    library: bd('2.5e12').toFormat(),
  },
  {
    claim: 'wei',
    expr: 'String(1.5e18)  // wei',
    native: String(1.5e18),
    library: bd('1.5e18').toFormat(),
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
    <p v-if="row.warn" class="claim-warn" data-role="claim-warning">{{ row.warn }}</p>
  </div>

  <p class="pg-muted">
    <code>bd()</code> accepts scientific notation on input and never emits it on output — that part
    holds at every magnitude. The two flagged rows are places where the README describes JavaScript
    wrongly, which is why this tab computes the left column rather than quoting it.
  </p>
</template>

<style scoped>
/* Part of what this card demonstrates: a claim the live values contradict is
   marked on the card itself rather than quietly left standing. */
.claim-warn {
  margin: 0.35rem 0 0;
  padding: 0.35rem 0.55rem;
  border-left: 3px solid #d97706;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.76rem;
  border-radius: 0 6px 6px 0;
}
</style>
