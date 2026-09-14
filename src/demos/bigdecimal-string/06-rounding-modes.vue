<script setup lang="ts">
import { ref } from 'vue'
import { RoundingMode, bd } from '@ozjsey/bigdecimal-string'

/**
 * The claim: `RoundingMode` is a typed enum and `setScale(n, mode)` honours it.
 *
 * JavaScript has one rounding rule and no way to choose another, so the native
 * column is built the way people actually do it — scale by 100, round, scale
 * back. That trick is itself a float operation: on `1.005` it answers `1`, and
 * on `2.675` it answers something `toFixed(2)` disagrees with. Both are
 * computed here rather than asserted, because guessing which way a double
 * lands is exactly the mistake this card is about.
 */
const value = ref('1.005')

const scaleBy100 = (x: number) => x * 100

/** The nearest thing plain JavaScript offers for each mode, or nothing. */
function nativeEquivalent(mode: RoundingMode, input: string): string {
  const x = Number(input)
  const cents = scaleBy100(x)
  switch (mode) {
    case RoundingMode.CEILING:
      return String(Math.ceil(cents) / 100)
    case RoundingMode.FLOOR:
      return String(Math.floor(cents) / 100)
    case RoundingMode.DOWN:
      return String(Math.trunc(cents) / 100)
    case RoundingMode.UP:
      return String((x < 0 ? Math.floor(cents) : Math.ceil(cents)) / 100)
    case RoundingMode.HALF_UP:
      return String(Math.round(cents) / 100)
    default:
      return 'no native equivalent'
  }
}

const MODES: RoundingMode[] = [
  RoundingMode.CEILING,
  RoundingMode.FLOOR,
  RoundingMode.DOWN,
  RoundingMode.UP,
  RoundingMode.HALF_UP,
  RoundingMode.HALF_DOWN,
  RoundingMode.HALF_EVEN,
]

function libraryFor(mode: RoundingMode, input: string): string {
  try {
    return bd(input).setScale(2, mode).toString()
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

function nativeToFixed(input: string): string {
  return Number(input).toFixed(2)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.9rem">
    <label class="pg-label">
      value
      <input v-model="value" class="pg-input" type="text" size="14" aria-label="value to round" />
    </label>
    <button class="pg-btn" @click="value = '1.005'">1.005</button>
    <button class="pg-btn" @click="value = '2.675'">2.675</button>
    <button class="pg-btn" @click="value = '10.555'">10.555</button>
    <button class="pg-btn" @click="value = '-2.675'">-2.675</button>
    <button class="pg-btn" @click="value = '2.5'">2.5</button>
  </div>

  <div class="pg-vs" data-claim="to-fixed">
    <code class="pg-vs__expr">Number(value).toFixed(2) &nbsp;vs&nbsp; setScale(2, HALF_UP)</code>
    <div class="pg-vs__cols">
      <div class="pg-vs__col pg-vs__col--native">
        <span class="pg-vs__head">plain JavaScript</span>
        <output class="pg-vs__out" data-role="native">{{ nativeToFixed(value) }}</output>
        <span class="pg-vs__note">toFixed rounds the double, not the decimal you wrote.</span>
      </div>
      <div class="pg-vs__col pg-vs__col--lib">
        <span class="pg-vs__head">bigdecimal-string</span>
        <output class="pg-vs__out" data-role="bigdecimal">
          {{ libraryFor(RoundingMode.HALF_UP, value) }}
        </output>
        <span class="pg-vs__note">Rounds the digits you typed.</span>
      </div>
    </div>
  </div>

  <p class="pg-kv" style="margin: 1rem 0 0.4rem">All seven modes, at scale 2:</p>

  <div
    v-for="mode in MODES"
    :key="mode"
    class="pg-vs"
    :data-claim="`mode-${mode}`"
  >
    <code class="pg-vs__expr">setScale(2, RoundingMode.{{ mode }})</code>
    <div class="pg-vs__cols">
      <div class="pg-vs__col pg-vs__col--native">
        <span class="pg-vs__head">plain JavaScript</span>
        <output class="pg-vs__out" data-role="native">{{ nativeEquivalent(mode, value) }}</output>
      </div>
      <div class="pg-vs__col pg-vs__col--lib">
        <span class="pg-vs__head">bigdecimal-string</span>
        <output class="pg-vs__out" data-role="bigdecimal">{{ libraryFor(mode, value) }}</output>
      </div>
    </div>
  </div>

  <p class="pg-muted">
    <code>1.005</code> is stored as <code>1.00499999999999989…</code>, so both native routes miss
    it: <code>toFixed(2)</code> gives <code>1.00</code> and the scale-by-100 trick gives
    <code>1</code>. The library rounds the digits you typed, so HALF_UP means half up.
  </p>
  <p class="pg-muted">
    Switch to <code>2.675</code> for the more unsettling version: there the two native routes
    disagree with <em>each other</em>. <code>toFixed(2)</code> answers <code>2.67</code>, because
    the stored double sits just under the tie — while <code>2.675 * 100</code> happens to land on
    exactly <code>267.5</code>, so <code>Math.round</code> answers <code>2.68</code>. Whichever one
    your codebase reached for, it was luck. <code>HALF_DOWN</code> and <code>HALF_EVEN</code> —
    banker's rounding, which several financial standards require — have no native equivalent at
    all.
  </p>
</template>
