<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * `retry: false` — opting out of the automatic curve, side by side with the
 * default that keeps trying.
 *
 * Opting out does **not** opt in to losing the write. The key stays in
 * `pending`, stays listed in `failed`, and its `retryAt` is `undefined`, which
 * is the store's way of saying "nothing is scheduled — this one needs you".
 * An edit or an explicit `retry(key)` re-arms it.
 */
const parked = reactive<Record<string, string>>({ note: '' })
const persistent = reactive<Record<string, string>>({ note: '' })

const serverUp = ref(false)
const parkedAttempts = ref(0)
const persistentAttempts = ref(0)

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const parkedOutbox = useWriteBehind(parked, {
  retry: false,
  write: async () => {
    parkedAttempts.value += 1
    await sleep(150)
    if (!serverUp.value) throw new Error('503 Service Unavailable')
  },
})

const persistentOutbox = useWriteBehind(persistent, async () => {
  persistentAttempts.value += 1
  await sleep(150)
  if (!serverUp.value) throw new Error('503 Service Unavailable')
})

/** One field drives both, so the only difference between them is the option. */
function onType(event: Event) {
  const value = (event.target as HTMLInputElement).value
  parked.note = value
  persistent.note = value
}

const parkedFailure = computed(() => parkedOutbox.failed[0])
const persistentFailure = computed(() => persistentOutbox.failed[0])
const describeRetryAt = (at: number | undefined) =>
  at === undefined ? 'undefined — nothing scheduled' : new Date(at).toLocaleTimeString([], { hour12: false })

function reset() {
  parkedOutbox.discard('note')
  persistentOutbox.discard('note')
  parked.note = ''
  persistent.note = ''
  parkedAttempts.value = 0
  persistentAttempts.value = 0
  serverUp.value = false
}
</script>

<template>
  <p class="pg-muted">
    One input, two outboxes over the same failing server — identical except for
    <code>retry</code>. Type, wait a few seconds, and compare the attempt counts. Then press
    <strong>retry()</strong> on the parked one, or just type again.
  </p>

  <p class="pg-row">
    <label class="pg-label" for="wb-parked-note">note</label>
    <input
      id="wb-parked-note"
      class="pg-input note"
      type="text"
      autocomplete="off"
      spellcheck="false"
      :value="parked.note"
      @input="onType"
    />
    <button class="pg-btn" :class="serverUp ? '' : 'pg-btn--primary'" @click="serverUp = !serverUp">
      server: {{ serverUp ? 'up' : 'down' }}
    </button>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <div class="pair">
    <div class="pg-box">
      <p class="head"><code>retry: false</code></p>
      <p class="pg-kv">attempts made: {{ parkedAttempts }}</p>
      <p class="pg-kv">pending: {{ parkedOutbox.pending.join(', ') || 'none' }}</p>
      <p class="pg-kv">failed: {{ parkedOutbox.failed.length }}</p>
      <p class="pg-kv">
        failed[0].attempts: {{ parkedFailure ? parkedFailure.attempts : 0 }}
      </p>
      <p class="pg-kv">
        failed[0].retryAt: {{ parkedFailure ? describeRetryAt(parkedFailure.retryAt) : '—' }}
      </p>
      <p class="pg-row">
        <button class="pg-btn" @click="parkedOutbox.retry('note')">retry('note')</button>
      </p>
    </div>

    <div class="pg-box">
      <p class="head"><code>retry</code> left at its default</p>
      <p class="pg-kv">attempts made: {{ persistentAttempts }}</p>
      <p class="pg-kv">pending: {{ persistentOutbox.pending.join(', ') || 'none' }}</p>
      <p class="pg-kv">failed: {{ persistentOutbox.failed.length }}</p>
      <p class="pg-kv">
        failed[0].attempts: {{ persistentFailure ? persistentFailure.attempts : 0 }}
      </p>
      <p class="pg-kv">
        failed[0].retryAt:
        {{ persistentFailure ? describeRetryAt(persistentFailure.retryAt) : '—' }}
      </p>
      <p class="pg-muted">backing off 1 → 2 → 4 → 8 → 16 → 30 s, capped.</p>
    </div>
  </div>

  <p class="pg-muted">
    The reason retrying is the default rather than the option: dropping a user's edit is the one
    outcome the library treats as unacceptable, so the behaviour you get without reading the docs is
    the safe one. <code>retry: false</code> exists for an endpoint where a repeat is worse than a
    delay — and even then the write is kept, not discarded.
  </p>
</template>

<style scoped>
.note {
  min-width: 18rem;
  flex: 1;
}
.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  gap: 0.75rem;
  margin: 0.75rem 0;
}
.head {
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
}
</style>
