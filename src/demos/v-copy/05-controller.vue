<script setup lang="ts">
import { onBeforeUnmount, reactive } from 'vue'
import type { CopyController } from '@ozjsey/v-copy'

/**
 * `reactive()` is the opt-in that makes this a CONTROLLER — an object the
 * directive owns and writes state into: copy() / clear() / copied / history /
 * last. This is the "scoped slot from a directive" form; no composable.
 */
const ctrl = reactive<CopyController>({ max: 5 })

/**
 * The other role, on the element below it. A config object belongs to YOU: the
 * directive reads it and writes nothing back, so freezing one — ordinary
 * defensive practice for a module-level constant — is an ordinary binding.
 * Before 1.1.1 every object binding was adopted as a controller, and this line
 * threw `Cannot add property history, object is not extensible` out of
 * `mounted`, taking the whole card down with it.
 */
const FROZEN_CONFIG = Object.freeze({ source: 'frozen-config-token' })

const snippet = 'npm install @ozjsey/v-copy'

/**
 * Revokes the token from a timer: no click, no re-render, and nothing in this
 * template reads `ctrl.disabled`. The controller's config half is live, so the
 * snippet stops copying at the moment the flag flips.
 *
 * Until 1.1.1 the options were a snapshot taken at the last render, so this
 * took effect only when some unrelated binding happened to re-render the card
 * — which is exactly what made "I disabled it and it still copies" look
 * intermittent.
 */
let timer: ReturnType<typeof setTimeout> | null = null
function revokeSoon() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    ctrl.disabled = true
  }, 1200)
}
function reinstate() {
  if (timer) clearTimeout(timer)
  timer = null
  ctrl.disabled = false
}
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <code class="snippet" v-copy="ctrl">{{ snippet }}</code>

  <div class="pg-row" style="margin-top: 0.75rem">
    <button class="pg-btn pg-btn--primary" @click="ctrl.copy?.()">ctrl.copy()</button>
    <button class="pg-btn" @click="ctrl.copy?.('overridden text')">copy('overridden text')</button>
    <button class="pg-btn" :disabled="!ctrl.history?.length" @click="ctrl.clear?.()">
      ctrl.clear()
    </button>
    <span v-if="ctrl.copied" class="pg-chip">copied ✓</span>
  </div>

  <dl class="kv">
    <dt>ctrl.copied</dt><dd>{{ ctrl.copied ?? false }}</dd>
    <dt>ctrl.last</dt><dd>{{ ctrl.last ?? '—' }}</dd>
    <dt>ctrl.history</dt><dd>{{ ctrl.history?.length ?? 0 }} / max {{ ctrl.max }}</dd>
  </dl>

  <p class="pg-muted" style="margin: 1rem 0 0.4rem">
    The config half is live — write to it from anywhere
  </p>
  <div class="pg-row">
    <button class="pg-btn" @click="revokeSoon">Revoke in 1.2s (from a timer)</button>
    <button class="pg-btn" @click="reinstate">Reinstate</button>
  </div>
  <p class="pg-muted">
    “Revoke” schedules <code>ctrl.disabled = true</code> on a timer. Nothing clicks, nothing
    re-renders, and nothing in this template reads <code>disabled</code> — yet the snippet stops
    copying the instant it fires. Click the snippet before and after to feel the difference, then
    press <strong>Reinstate</strong>.
  </p>

  <p class="pg-muted" style="margin: 1rem 0 0.4rem">The other role: config you own</p>
  <code class="snippet frozen" v-copy="FROZEN_CONFIG">Object.freeze({ source: … }) — click to copy</code>
  <p class="pg-muted">
    A frozen config object. The directive reads <code>source</code> and writes nothing back, so this
    is an ordinary binding — bind a <code>reactive()</code> object when you want state handed back
    instead. In 1.1.0 this threw a <code>TypeError</code> out of <code>mounted</code>.
  </p>
</template>

<style scoped>
.snippet {
  display: inline-block;
  font-family: var(--mono);
  background: #f4f6fb;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}
.snippet[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
.frozen {
  font-size: 0.82rem;
}
.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  font-family: var(--mono);
  font-size: 0.78rem;
  margin: 0.9rem 0 0;
}
.kv dt {
  color: #6b7488;
}
.kv dd {
  margin: 0;
}
</style>
