<script setup lang="ts">
import { bd } from '@ozjsey/bigdecimal-string'

/**
 * The README's "Creating Instances" section: from a string, from scientific
 * notation, from a number, with an explicit precision — and then the separator
 * standard.
 *
 * The last four rows are the reason this card exists. Through 1.2.0 the parser
 * split on /[.,]/ and kept the first two segments, so `bd("1,234.56")` was
 * 1.234 and the library could not read its own `toFormat()` output back. 1.2.1
 * reads grouped input properly and REFUSES anything ambiguous rather than
 * guessing, which is the row plain JavaScript still gets silently wrong.
 */
const FORMATTED = bd('1234567.89').toFormat()

/** Rows that demonstrate a throw need the throw, not a blank cell. */
const attempt = (run: () => string) => {
  try {
    return run()
  } catch (error) {
    return `throws ${(error as Error).constructor.name}`
  }
}

/** The refusal in full — the message is the feature, not the throw. */
const AMBIGUOUS_MESSAGE = (() => {
  try {
    bd('1,23')
    return 'no error — the refusal has been lost'
  } catch (error) {
    return `${(error as Error).constructor.name}: ${(error as Error).message}`
  }
})()

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
    expr: 'bd("1,234.56")   // grouped input, default standard',
    native: String(parseFloat('1,234.56')),
    library: bd('1,234.56').toString(),
    warn:
      'The library reads the grouping; parseFloat stops at the comma and returns 1 without complaining. Through 1.2.0 the library answered 1.234 here, which was the same silent corruption from the other side.',
  },
  {
    claim: 'round-trip',
    expr: `bd(bd("1234567.89").toFormat())   // "${FORMATTED}" back in`,
    native: String(parseFloat(FORMATTED)),
    library: bd(FORMATTED).toString(),
  },
  {
    claim: 'ambiguous',
    expr: 'bd("1,23")   // 1.23, or malformed grouping?',
    native: String(parseFloat('1,23')),
    library: attempt(() => bd('1,23').toString()),
    warn: `Grouping is validated, never stripped: reading "1,23" as 123 would corrupt a European 1.23, so it is refused — ${AMBIGUOUS_MESSAGE}`,
  },
  {
    claim: 'eu-dialect',
    expr: 'bd("1.234,56", { decimal: ",", group: "." })',
    native: String(parseFloat('1.234,56')),
    library: bd('1.234,56', { decimal: ',', group: '.' }).toString(),
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
    <code>bd("123.456")</code> keeps three, <code>bd("100")</code> gets two, and a numeric second
    argument overrides both. An object second argument is a separator config instead —
    <code>{ decimal, group }</code>, defaulting to <code>"."</code> and <code>","</code>, settable
    app-wide with <code>BigDecimal.setConfig()</code>. The same pair is used on the way out, which is
    why the round-trip row works.
  </p>
</template>

<style scoped>
/* Part of what this card demonstrates: where one of the two columns is wrong,
   or where an input is refused on purpose, the card says so rather than
   leaving the reader to guess which number to believe. */
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
