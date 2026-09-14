<script setup lang="ts">
import { BigDecimal, bd } from '@ozjsey/bigdecimal-string'

/**
 * The README's E-Commerce, Shopping Cart and Dashboard sections, run for real.
 *
 * This is the case the package exists for, so the left column is written the
 * way a checkout normally is: numbers, multiplied and added.
 */
const CART = [
  { name: 'Laptop', price: '1299.99', qty: 2 },
  { name: 'Mouse', price: '49.99', qty: 3 },
  { name: 'Keyboard', price: '149.99', qty: 1 },
]

const nativeSubtotal = CART.reduce((total, item) => total + Number(item.price) * item.qty, 0)
const nativeTax = nativeSubtotal * 0.08

const subtotal = BigDecimal.sum(...CART.map((item) => bd(item.price).multiply(item.qty)))
const tax = subtotal.multiply('0.08')

/** The README's tax recipe: rate at precision 4, rounded back to 2 for money. */
const invoice = bd('999.99')
const rate = bd('0.0825', 4)
const invoiceTax = invoice.multiply(rate).setScale(2)

const rows = [
  {
    claim: 'line-total',
    expr: '1299.99 * 3',
    native: String(1299.99 * 3),
    library: bd('1299.99').multiply(3).toFormat(),
    note: 'One line item is enough to produce a price nobody would print.',
  },
  {
    claim: 'tax',
    expr: '999.99 * 0.0825   // 8.25% sales tax',
    native: String(999.99 * 0.0825),
    library: invoiceTax.toFormat(),
    note: 'Rate held at precision 4, then setScale(2) to land on a cent.',
  },
  {
    claim: 'grand-total',
    expr: '999.99 + tax',
    native: String(999.99 + 999.99 * 0.0825),
    library: invoice.add(invoiceTax).toFormat(),
  },
  {
    claim: 'cart-subtotal',
    expr: 'sum of 2 laptops, 3 mice, 1 keyboard',
    native: String(nativeSubtotal),
    library: subtotal.toFormat(),
  },
  {
    claim: 'cart-tax',
    expr: 'subtotal * 0.08',
    native: String(nativeTax),
    library: tax.toFormat(),
  },
  {
    claim: 'cart-total',
    expr: 'subtotal + tax',
    native: String(nativeSubtotal + nativeTax),
    library: subtotal.add(tax).toFormat(),
    note: 'The number the customer is charged.',
  },
]
</script>

<template>
  <table class="cart">
    <thead>
      <tr>
        <th>item</th>
        <th>price</th>
        <th>qty</th>
        <th>line</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="item in CART" :key="item.name">
        <td>{{ item.name }}</td>
        <td>{{ bd(item.price).toFormat() }}</td>
        <td>{{ item.qty }}</td>
        <td>{{ bd(item.price).multiply(item.qty).toFormat() }}</td>
      </tr>
    </tbody>
  </table>

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
    Every left-hand value here is what a checkout written with <code>Number</code> would put in
    front of a customer, and three of the six are not currency. Rounding at the end does not fix it:
    <code>toFixed(2)</code> on a drifted subtotal hides the drift, it does not undo it.
  </p>
</template>

<style scoped>
.cart {
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.82rem;
}
.cart th,
.cart td {
  border: 1px solid var(--stage-border);
  padding: 0.25rem 0.6rem;
  text-align: left;
}
.cart th {
  background: #f3f5fa;
  font-weight: 600;
}
.cart td:nth-child(2),
.cart td:nth-child(4) {
  font-family: var(--mono);
  text-align: right;
}
</style>
