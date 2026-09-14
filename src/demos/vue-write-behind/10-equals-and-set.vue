<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * Change detection, and the precondition that comes with it.
 *
 * The default is `Object.is`, so an object value **mutated in place is not an
 * edit** — the watcher fires, but the value is the same reference it already
 * had. Replace the object, pass your own `equals`, or call `set(key, value)`,
 * which always queues.
 *
 * A custom `equals` is the *opposite* knob: it suppresses a write when a new
 * object is equivalent to the old one. It cannot see an in-place mutation
 * either, for the same reason — both sides of the comparison are the one
 * object that was mutated.
 */
interface Bio {
  text: string
}

const strict = reactive<Record<string, Bio>>({ bio: { text: 'hello' } })
const lenient = reactive<Record<string, Bio>>({ bio: { text: 'hello' } })

const strictSends = ref<string[]>([])
const lenientSends = ref<string[]>([])
const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const record = (target: typeof strictSends, value: Bio) => {
  target.value = [...target.value.slice(-7), `${stamp()}  ${JSON.stringify(value)}`]
}

const strictOutbox = useWriteBehind(strict, (value) => record(strictSends, value))

const lenientOutbox = useWriteBehind(lenient, {
  equals: (a, b) => a.text === b.text,
  write: (value) => record(lenientSends, value),
})

/** A new object, same content. Different reference — `Object.is` says changed. */
function replaceWithEquivalent() {
  strict.bio = { text: strict.bio.text }
  lenient.bio = { text: lenient.bio.text }
}

/** A new object with new content. Both agree this is a change. */
function replaceWithDifferent() {
  const text = `edited ${new Date().toLocaleTimeString([], { hour12: false })}`
  strict.bio = { text }
  lenient.bio = { text }
}

/** Mutating the object the record already holds. Neither comparator can see it. */
function mutateInPlace() {
  strict.bio.text += '!'
  lenient.bio.text += '!'
}

/** The escape hatch for exactly that case. */
function setExplicitly() {
  strictOutbox.set('bio', strict.bio)
  lenientOutbox.set('bio', lenient.bio)
}

function reset() {
  strictOutbox.discard('bio')
  lenientOutbox.discard('bio')
  strict.bio = { text: 'hello' }
  lenient.bio = { text: 'hello' }
  strictSends.value = []
  lenientSends.value = []
}
</script>

<template>
  <p class="pg-muted">
    Two outboxes over an object-valued record, differing only in <code>equals</code>. Press the
    buttons in order and read the two logs — the interesting rows are the ones where only one side
    fires, and the one where neither does.
  </p>

  <p class="pg-row">
    <button class="pg-btn" @click="mutateInPlace">mutate <code>.text</code> in place</button>
    <button class="pg-btn" @click="replaceWithEquivalent">replace with an equivalent object</button>
    <button class="pg-btn" @click="replaceWithDifferent">replace with a different object</button>
    <button class="pg-btn pg-btn--primary" @click="setExplicitly">set('bio', …)</button>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <p class="pg-kv">strict.bio.text: {{ strict.bio.text }}</p>
  <p class="pg-kv">lenient.bio.text: {{ lenient.bio.text }}</p>

  <div class="pair">
    <div class="pg-box">
      <p class="head">default — <code>equals: Object.is</code></p>
      <p class="pg-row">
        <span class="pg-chip">writes: {{ strictSends.length }}</span>
        <span class="pg-chip">pending: {{ strictOutbox.pending.join(', ') || 'none' }}</span>
      </p>
      <pre class="pg-log">{{ strictSends.length ? strictSends.join('\n') : 'nothing sent yet' }}</pre>
    </div>

    <div class="pg-box">
      <p class="head"><code>equals: (a, b) =&gt; a.text === b.text</code></p>
      <p class="pg-row">
        <span class="pg-chip">writes: {{ lenientSends.length }}</span>
        <span class="pg-chip">pending: {{ lenientOutbox.pending.join(', ') || 'none' }}</span>
      </p>
      <pre class="pg-log">{{ lenientSends.length ? lenientSends.join('\n') : 'nothing sent yet' }}</pre>
    </div>
  </div>

  <table class="matrix">
    <thead>
      <tr><th>action, pressed on a freshly reset card</th><th>default</th><th>custom <code>equals</code></th></tr>
    </thead>
    <tbody>
      <tr><td>mutate <code>.text</code> in place</td><td>silent</td><td>silent</td></tr>
      <tr><td>replace with an equivalent object</td><td>writes</td><td>silent</td></tr>
      <tr><td>replace with a different object</td><td>writes</td><td>writes</td></tr>
      <tr><td><code>set('bio', …)</code></td><td>writes</td><td>writes</td></tr>
    </tbody>
  </table>

  <p class="pg-muted">
    The first row is the one worth remembering, and it is a stated precondition rather than a bug:
    both comparators are handed the same mutated object on both sides, so neither can tell anything
    happened. If your state is mutated in place, <code>set()</code> is the API for it.
  </p>

  <p class="pg-muted">
    <strong>Press them out of order and the second column changes.</strong> When a
    comparator reports "unchanged", the value the library remembers for that key is <em>not</em>
    replaced; it is still the object from before. So a custom <code>equals</code> that has just
    suppressed a replacement is comparing the next edit against that older object, and an in-place
    mutation of the newer one then does go out. The default comparator never drifts, because the
    only thing <code>Object.is</code> calls unchanged is the identical reference.
  </p>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.head {
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
}
.matrix {
  border-collapse: collapse;
  font-size: 0.8rem;
  margin: 0.5rem 0;
}
.matrix th,
.matrix td {
  border: 1px solid var(--stage-border);
  padding: 0.25rem 0.6rem;
  text-align: left;
}
.matrix thead th {
  background: #f7f8fb;
}
</style>
