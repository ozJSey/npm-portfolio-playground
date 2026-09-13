<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextCopyDetail } from '@ozjsey/v-select-text'

// SEL-5. `trigger: 'always'` + `copy: true` + a handler that writes state is a
// cycle: the copy settles in a promise, the handler re-renders, `'always'`
// re-selects, and the copy starts again. It crosses a promise boundary, so
// Vue's recursive-update guard never sees it — measured on this very card at
// ~8,600 real clipboard writes per second, indefinitely, on a page that still
// looks fine.
//
// The handler below is the README's own `select-text-copy` example: it writes
// state. What stops the cycle is the library, not the demo — under
// `trigger: 'always'` a copy whose text is unchanged since the last attempt on
// that host is skipped entirely: no write, no event, no state attribute.
//
// So: press "Re-render" as many times as you like and the attempt count stays
// put. Change the text and exactly one more attempt happens. The copy follows
// the text, which is the only thing `'always'` was ever about.
//
// It mounts disarmed for the same reason card 08 does: a document holds one
// selection, and a host that re-selects itself on every render would take it
// away from every other card on this tab the moment the page loaded.
const quotes = [
  'AAPL 241.18 +0.94%',
  'MSFT 508.02 -0.31%',
  'NVDA 183.77 +2.15%',
  'AMZN 231.40 +0.08%',
]
const quoteIndex = ref(0)
const renders = ref(0)
const armed = ref(false)

interface Attempt {
  text: string
  ok: boolean
  reason: string
}
const attempts = ref<Attempt[]>([])

// The state write. This is the shape that used to loop.
function onCopy(e: Event) {
  const d = (e as CustomEvent<SelectTextCopyDetail>).detail
  attempts.value.unshift({ text: d.text, ok: d.ok, reason: d.reason ?? '' })
  if (attempts.value.length > 6) attempts.value.pop()
}

function arm() {
  armed.value = true
  renders.value += 1
}

function rerender() {
  renders.value += 1
}

function nextQuote() {
  quoteIndex.value = (quoteIndex.value + 1) % quotes.length
  renders.value += 1
}
</script>

<template>
  <div class="pg-col">
    <p
      class="ticker"
      v-select-text="{ enabled: armed, trigger: 'always', copy: true }"
      @select-text-copy="onCopy"
    >{{ quotes[quoteIndex] }}</p>

    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" :disabled="armed" @click="arm">
        {{ armed ? 'Armed' : 'Arm it' }}
      </button>
      <button class="pg-btn" :disabled="!armed" @click="rerender">Re-render, same text</button>
      <button class="pg-btn" :disabled="!armed" @click="nextQuote">Change the text</button>
    </div>

    <p class="pg-kv">
      renders = <strong>{{ renders }}</strong> · copy attempts =
      <strong class="count">{{ attempts.length }}</strong>
    </p>

    <ul class="log">
      <li v-if="!attempts.length" class="pg-muted">No attempt yet.</li>
      <li v-for="(a, i) in attempts" :key="i" :class="a.ok ? 'ok' : 'bad'">
        <code>{{ a.text }}</code> → {{ a.ok ? 'copied' : `refused (${a.reason})` }}
      </li>
    </ul>

    <p class="pg-muted">
      <strong>The write follows the text, not the render.</strong> Under
      <code>trigger: 'always'</code> the selection genuinely re-runs on every update — that is what
      the trigger is for — but a clipboard write whose text is identical to this host's last attempt
      is skipped: no <code>writeText</code>, no <code>select-text-copy</code>, no
      <code>data-select-text-copy</code> churn. Press <em>Arm it</em> — one attempt. Then press
      <em>Re-render, same text</em> ten times and the attempt count does not move; press
      <em>Change the text</em> and it goes up by exactly one.
    </p>

    <p class="pg-muted">
      Without that guard this card is an <strong>unbounded clipboard loop</strong>. The handler
      above writes state, which re-renders, which makes <code>'always'</code> select again, which
      starts another write, which settles in a promise and calls the handler again. The promise
      boundary is why Vue's <em>Maximum recursive updates exceeded</em> guard never fires — it only
      sees synchronous re-entry. The same handler on <code>@select-text</code> with no
      <code>copy</code> stops at 100; this card, before the guard, was measured at ~8,600 real
      clipboard writes per second — 41,461 in five seconds — and never terminated.
    </p>

    <p class="pg-muted">
      Only <code>'always'</code> is guarded, and only on the render path.
      <code>trigger: 'edge'</code> needs an explicit <code>false → true</code> re-arm (card 15
      presses it repeatedly and copies every time) and <code>trigger: 'click'</code> is one gesture
      per attempt, so both still write the same text as often as you ask. This host also prints the
      <code>copy</code>-without-a-click warning once, because <code>'always'</code> has no gesture
      behind it — headless, with no <code>clipboard-write</code> grant, the attempt you see logged
      here is a refusal, and it is still counted as an attempt.
    </p>
  </div>
</template>

<style scoped>
.ticker {
  margin: 0;
  align-self: flex-start;
  font-family: var(--mono);
  font-size: 0.9rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  background: #fbfcfe;
}
.ticker[data-select-text-copy='copied'] {
  border-color: #86efac;
  background: #f0fdf4;
}
.ticker[data-select-text-copy='error'] {
  border-color: #fca5a5;
  background: #fef2f2;
}
.count {
  font-variant-numeric: tabular-nums;
}
.log {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.82rem;
  line-height: 1.7;
}
.log .ok {
  color: #15803d;
}
.log .bad {
  color: #b91c1c;
}
</style>
