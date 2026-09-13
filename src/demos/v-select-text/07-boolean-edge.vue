<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SelectTextBinding } from '@ozjsey/v-select-text'

const enabled = ref(false)
const useAlias = ref(false)
const showSecond = ref(false)
const renders = ref(0)
const fires = ref({ first: 0, second: 0 })

// Both hosts share this one binding: a bare reactive boolean, or the same
// boolean under the deprecated 1.0 `condition` key.
const binding = computed<SelectTextBinding>(() =>
  useAlias.value ? { condition: enabled.value } : enabled.value,
)

function onFirst() {
  fires.value.first++
}

function onSecond() {
  fires.value.second++
}
</script>

<template>
  <div class="pg-col">
    <p v-select-text="binding" class="host" @select-text="onFirst">
      Host 1 is a plain paragraph, which is the default kind. Nothing here is focusable, so the
      highlight is painted by the document itself and stays put while you keep pressing buttons.
    </p>

    <p v-if="showSecond" v-select-text="binding" class="host" @select-text="onSecond">
      Host 2 mounts on the same ref, with that ref already true — so it fires its own first edge
      while host 1 does not move.
    </p>

    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @click="enabled = true">
        Set enabled = true (selects)
      </button>
      <button class="pg-btn" :disabled="!enabled" @click="enabled = false">
        Set enabled = false (no-op)
      </button>
      <button class="pg-btn" @click="renders++">Force a re-render — {{ renders }}</button>
    </div>

    <div class="pg-row">
      <label class="pg-label">
        <input v-model="showSecond" type="checkbox" /> mount a second host on the same ref
      </label>
      <label class="pg-label">
        <input v-model="useAlias" type="checkbox" /> bind via deprecated <code>condition</code>
      </label>
      <span class="pg-chip">host 1: {{ fires.first }} fires</span>
      <span v-if="showSecond" class="pg-chip">host 2: {{ fires.second }} fires</span>
      <span class="pg-muted">one document selection at a time — the counters are the proof</span>
    </div>

    <p class="pg-muted">
      Press <em>enabled = true</em>: the paragraph selects with no focus involved, which is why the
      highlight survives a click on these buttons. Only a <code>false → true</code> edge fires, so
      <em>Force a re-render</em> re-runs the directive and selects nothing — the previous value is
      kept in a <code>WeakMap</code> keyed by the element, so mounting host 2 while the shared ref
      is already <code>true</code> gives it its own first edge and leaves host 1 silent. The v1.0
      <code>condition</code> key still works as a deprecated alias — when both are present,
      <code>enabled</code> wins.
    </p>
  </div>
</template>

<style scoped>
.host {
  border: 1px solid var(--stage-border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  margin: 0;
  max-width: 36rem;
  background: #fff;
}
</style>
