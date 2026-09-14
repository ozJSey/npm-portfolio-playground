<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useWriteBehind } from '@ozjsey/vue-write-behind'

/**
 * `keys` narrows what the source watcher picks up — an allow-list, or a
 * predicate for a key naming scheme.
 *
 * `set(key, value)` is the explicit path and ignores the filter entirely: it
 * writes local state *and* queues, unconditionally. That is what makes an
 * excluded key still sendable on purpose, without widening the filter for
 * everything.
 */
const form = reactive<Record<string, string>>({
  title: '',
  body: '',
  'ui:zoom': '100',
})

const sent = ref<string[]>([])
const stamp = () => new Date().toLocaleTimeString([], { hour12: false })

const outbox = useWriteBehind(form, {
  // Anything but the `ui:` prefix. An array of key names works the same way.
  keys: (key) => !key.startsWith('ui:'),
  write: (value, key) => {
    sent.value = [...sent.value.slice(-9), `${stamp()}  ${key} = ${JSON.stringify(value)}`]
  },
})

function onType(key: string, event: Event) {
  form[key] = (event.target as HTMLInputElement).value
}

/** The escape hatch: queue the excluded key anyway, this once. */
function sendZoomAnyway() {
  outbox.set('ui:zoom', form['ui:zoom'])
}

function reset() {
  for (const key of Object.keys(form)) outbox.discard(key)
  form.title = ''
  form.body = ''
  form['ui:zoom'] = '100'
  sent.value = []
}
</script>

<template>
  <p class="pg-muted">
    Three fields in one record. Two of them sync; <code>ui:zoom</code> is local-only, because the
    filter excludes it. Type in each and watch <code>pending</code>.
  </p>

  <div class="pg-row field">
    <label class="pg-label label" for="wb-keys-title">title <span class="tracked">tracked</span></label>
    <input
      id="wb-keys-title"
      class="pg-input"
      type="text"
      autocomplete="off"
      :value="form.title"
      @input="onType('title', $event)"
    />
  </div>

  <div class="pg-row field">
    <label class="pg-label label" for="wb-keys-body">body <span class="tracked">tracked</span></label>
    <input
      id="wb-keys-body"
      class="pg-input"
      type="text"
      autocomplete="off"
      :value="form.body"
      @input="onType('body', $event)"
    />
  </div>

  <div class="pg-row field">
    <label class="pg-label label" for="wb-keys-zoom">
      ui:zoom <span class="excluded">excluded</span>
    </label>
    <input
      id="wb-keys-zoom"
      class="pg-input"
      type="text"
      autocomplete="off"
      :value="form['ui:zoom']"
      @input="onType('ui:zoom', $event)"
    />
    <button class="pg-btn" @click="sendZoomAnyway">set('ui:zoom', …)</button>
  </div>

  <p class="pg-row">
    <span class="pg-chip">pending: {{ outbox.pending.join(', ') || 'none' }}</span>
    <button class="pg-btn" @click="reset">reset</button>
  </p>

  <pre class="pg-log">{{ sent.length ? sent.join('\n') : 'nothing sent yet' }}</pre>

  <p class="pg-muted">
    Typing in <code>ui:zoom</code> changes local state and nothing else — no request, no pending
    entry. Pressing <code>set('ui:zoom', …)</code> queues it anyway. The filter is about what the
    <em>watcher</em> follows; it was never a lock on the key.
  </p>
</template>

<style scoped>
.field {
  margin: 0.35rem 0;
}
.label {
  width: 12rem;
}
.tracked,
.excluded {
  font-size: 0.68rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  margin-left: 0.3rem;
}
.tracked {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.excluded {
  background: #f4f4f5;
  color: #52525b;
  border: 1px solid #e4e4e7;
}
</style>
