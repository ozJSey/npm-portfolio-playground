<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * `discard(key)` is the only operation in the library that loses a write.
 *
 * The three buttons above it are the near misses — a failing endpoint, a key
 * deleted out of the source record, and a request still on the wire. None of
 * them drop the queued value; you have to say so.
 */
const draft = reactive<Record<string, string>>({ note: '', slow: '' })

const serverUp = ref(false)
const log = ref<string[]>([])

const stamp = () => new Date().toLocaleTimeString([], { hour12: false })
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const say = (line: string) => {
  log.value = [...log.value.slice(-11), `${stamp()}  ${line}`]
}

const outbox = useWriteBehind(draft, async (value, key) => {
  say(`PUT ${key}   ${JSON.stringify(value)}`)
  if (key === 'slow') {
    await sleep(3000)
    say('200  slow — answered three seconds later')
    return
  }
  await sleep(200)
  if (!serverUp.value) {
    say('503  note — kept')
    throw new Error('503 Service Unavailable')
  }
  say('200  note')
})

function onType(key: string, event: Event) {
  draft[key] = (event.target as HTMLInputElement).value
}

const keyInSource = computed(() => 'note' in draft)

/** Removing the key from the record stops the watcher — the queued write survives. */
function deleteKeyFromSource() {
  delete draft.note
  say("delete draft.note — the key left the record; look at `pending`")
}

function restoreKeyInSource() {
  draft.note = ''
  say('draft.note re-created')
}

function reset() {
  outbox.discard('note')
  outbox.discard('slow')
  draft.note = ''
  draft.slow = ''
  serverUp.value = false
  log.value = []
}
</script>

<template>
  <p class="pg-row">
    <span class="pg-chip">pending: {{ outbox.pending.join(', ') || 'none' }}</span>
    <span class="pg-chip">inFlight: {{ outbox.inFlight.join(', ') || 'none' }}</span>
    <span class="pg-chip">failed: {{ outbox.failed.map((f) => f.key).join(', ') || 'none' }}</span>
  </p>

  <div class="pg-box">
    <p class="head">1 — a failing endpoint does not drop it</p>
    <p class="pg-row">
      <label class="pg-label" for="wb-discard-note">note</label>
      <input
        id="wb-discard-note"
        class="pg-input note"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :disabled="!keyInSource"
        :value="draft.note"
        @input="onType('note', $event)"
      />
      <button class="pg-btn" :class="serverUp ? '' : 'pg-btn--primary'" @click="serverUp = !serverUp">
        server: {{ serverUp ? 'up' : 'down' }}
      </button>
    </p>
    <p class="pg-muted">Type with the server down. It retries forever; <code>note</code> never leaves <code>pending</code>.</p>
  </div>

  <div class="pg-box">
    <p class="head">2 — deleting the key out of the source does not drop it either</p>
    <p class="pg-row">
      <button class="pg-btn" :disabled="!keyInSource" @click="deleteKeyFromSource">
        delete draft.note
      </button>
      <button class="pg-btn" :disabled="keyInSource" @click="restoreKeyInSource">
        re-create draft.note
      </button>
      <span class="pg-chip">'note' in draft: {{ keyInSource }}</span>
    </p>
    <p class="pg-muted">
      The watcher stops following a key that is no longer in the record, but the write it already
      queued stays queued. Losing it silently is the outcome this library refuses.
    </p>
  </div>

  <div class="pg-box">
    <p class="head">3 — a request already on the wire cannot be recalled</p>
    <p class="pg-row">
      <label class="pg-label" for="wb-discard-slow">slow (3 s endpoint)</label>
      <input
        id="wb-discard-slow"
        class="pg-input note"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :value="draft.slow"
        @input="onType('slow', $event)"
      />
      <button class="pg-btn" @click="outbox.discard('slow')">discard('slow')</button>
    </p>
    <p class="pg-muted">
      Type, wait for <code>inFlight</code> to list <code>slow</code>, then discard it. The key leaves
      <code>pending</code> at once; the request is still out and its answer arrives in the log
      afterwards, belonging to nobody. Watch what a value typed straight after does — it waits for
      the orphan to answer rather than racing it.
    </p>
  </div>

  <div class="pg-box is-danger">
    <p class="head">and the one that does drop it</p>
    <p class="pg-row">
      <button class="pg-btn" @click="outbox.discard('note')">discard('note')</button>
      <button class="pg-btn" @click="reset">reset the card</button>
    </p>
    <p class="pg-muted">
      <code>note</code> leaves <code>pending</code> immediately and its value is never sent. Local
      state is untouched — the field still shows what you typed, because discarding a write is not
      a rollback.
    </p>
  </div>

  <pre class="pg-log">{{ log.length ? log.join('\n') : 'no requests yet' }}</pre>
</template>

<style scoped>
.pg-box {
  margin: 0.55rem 0;
}
.pg-box.is-danger {
  border-color: #fecaca;
  background: #fff7f7;
}
.head {
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 600;
}
.note {
  min-width: 16rem;
  flex: 1;
}
</style>
