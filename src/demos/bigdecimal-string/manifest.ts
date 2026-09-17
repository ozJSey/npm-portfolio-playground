import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'bigdecimal-string',
  pkg: '@ozjsey/bigdecimal-string',
  tagline:
    'Exact decimal arithmetic on strings, backed by BigInt. Every card here is the same expression twice — plain JavaScript on the left, the library on the right — because "0.30" means nothing until it sits beside 0.30000000000000004.',
  notes: [
    'Both columns are computed by this browser. Nothing on this tab is a printed literal: a hardcoded 0.30000000000000004 would be a claim ABOUT JavaScript rather than a demonstration of one, and it could rot without anybody noticing.',
    'Two README sentences did not survive being computed live, and the cards that hit them say so on the card. 1e15 does not print as 1e+15 (doubles go exponential at 1e21, card 03). (1e21).toLocaleString() does not return "1e+21" on any engine with ICU (card 03). A third — bd("1,234.56") returning "1.234" — was a real defect rather than a wording problem, and 1.2.1 fixed it: grouped input is now read, validated rather than stripped, and toFormat() output reads back (card 11).',
    'Exactness starts at the literal. bd(0.1 + 0.2) is handed 0.30000000000000004 and keeps it faithfully, which is why every example here quotes its operands as strings.',
    'Two README claims are not demonstrable in a browser and have no card: "Native TypeScript" (a build-time property — the .d.ts ships in the tarball) and "Zero dependencies, 8.1 KB minified" (the 1.2.1 ESM build measures 8,109 bytes; 1.2.0 was 5,625).',
  ],
  demos: [
    {
      file: '01-repl.vue',
      title: 'The REPL — any expression, both answers, live',
      blurb:
        'Type two operands, pick an operation, watch IEEE-754 and BigInt disagree. Start with 0.1 + 0.2, then try 1 / 0.',
      tags: ['bd()', 'add', 'subtract', 'multiply', 'divide', 'mod'],
    },
    {
      file: '02-precise-decimals.vue',
      title: 'Precise decimals — the 0.1 + 0.2 family',
      blurb:
        'Six expressions a double gets wrong, each computed in both columns. The last one is the equality that decides a branch.',
      tags: ['add', 'subtract', 'multiply', 'divide', 'sum', 'eq'],
    },
    {
      file: '03-scientific-notation.vue',
      title: 'Scientific notation — where it actually starts',
      blurb:
        'Small numbers go exponential at 1e-7 and large ones at 1e21, not at 1e15. Two rows flag README lines the live values contradict.',
      tags: ['toString', 'toFormat', 'scientific input', 'README drift'],
    },
    {
      file: '04-precision-loss.vue',
      title: 'Past 2^53 — Intl formats the number it was given',
      blurb:
        'An order id one above MAX_SAFE_INTEGER, grouped by Intl and by the library. Only one of them still has the last digit.',
      tags: ['BigInt', 'Intl.NumberFormat', 'toFixed(0)', 'round trip'],
    },
    {
      file: '05-formatting.vue',
      title: 'toString / prettify / toFormat / toFixed',
      blurb:
        'The whole formatting surface, against Intl doing its best. They agree at dashboard sizes — the card says so — and part company past 2^53.',
      tags: ['toString({ prettify })', 'toFormat', 'toFixed', 'scale'],
    },
    {
      file: '06-rounding-modes.vue',
      title: 'All seven rounding modes — and the cent JavaScript loses',
      blurb:
        'Type a value; every RoundingMode is applied beside the nearest native trick. At 1.005 both native routes miss the cent; switch to 2.675 and they disagree with each other.',
      tags: ['RoundingMode', 'setScale', 'HALF_EVEN', 'HALF_DOWN'],
    },
    {
      file: '07-chainable-immutable.vue',
      title: 'Chainable and immutable',
      blurb:
        'A five-call chain, and the same instance read back after an operation to show it did not change.',
      tags: ['chaining', 'immutability', 'new instance'],
    },
    {
      file: '08-comparisons.vue',
      title: 'Comparisons — floats, trailing zeros, and sort()',
      blurb:
        'eq / gt / gte / lt / lte against ===, plus compareTo rescuing an array that .sort() puts in the wrong order.',
      tags: ['eq', 'gt', 'gte', 'lt', 'lte', 'compareTo'],
    },
    {
      file: '09-currency.vue',
      title: 'The checkout — line totals, tax, cart total',
      blurb:
        "The README's e-commerce and shopping-cart recipes, run for real. Three of the six left-hand values are not currency.",
      tags: ['multiply', 'setScale(2)', 'BigDecimal.sum', 'precision 4 rates'],
    },
    {
      file: '10-static-and-utility.vue',
      title: 'Static and utility methods',
      blurb:
        'sum / max / min / zero / one and abs / negate / isZero / isPositive / isNegative, each beside its native counterpart.',
      tags: ['BigDecimal.sum', 'max', 'min', 'zero', 'one', 'abs', 'negate'],
    },
    {
      file: '11-parsing.vue',
      title: 'Creating instances — and the separator standard',
      blurb:
        'String, scientific, number, explicit precision. Then grouped input, the round trip through toFormat(), the ambiguous string that is refused rather than guessed at, and the flipped dialect.',
      tags: ['bd(value, precision)', 'bd(value, config)', 'separators', 'round trip', 'validated grouping'],
    },
  ],
}

export default manifest
