<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { CopyController } from '@ozjsey/v-copy'

const canCopy = ref(false)
const programmatic = reactive<CopyController>({ trigger: false })
</script>

<template>
  <div class="pg-col">
    <label class="pg-label">
      <input v-model="canCopy" type="checkbox" /> allow copying
    </label>

    <!-- `false` detaches the listener entirely; flipping the checkbox re-attaches it. -->
    <button class="pg-btn" v-copy="canCopy ? 'secret payload' : false">
      {{ canCopy ? 'Enabled — click to copy' : 'Disabled (v-copy="false")' }}
    </button>

    <!-- Same thing through the config form. -->
    <button class="pg-btn" v-copy="{ source: 'via disabled flag', disabled: !canCopy }">
      Config form — disabled: {{ !canCopy }}
    </button>

    <!-- A different DOM event drives the copy. -->
    <span class="dbl" v-copy="{ source: 'double-clicked', trigger: 'dblclick' }">
      trigger: 'dblclick' — double-click me
    </span>

    <!-- A key-shaped trigger. Any key copies, so the Enter/Space handler the
         directive normally adds for a non-interactive host is deliberately
         skipped — the trigger listener is already on that key, and both would
         copy twice for one press. What is NOT skipped is `tabindex` +
         `role="button"`: an element that cannot take focus never receives a
         `keydown` at all, so without them this binding is unreachable from the
         one device it was configured for. Tab to it and press any key. -->
    <span class="dbl keyed" v-copy="{ source: 'key-triggered', trigger: 'keydown' }">
      trigger: 'keydown' — Tab here and press any key
    </span>

    <!-- trigger: false = no listener at all; only the controller can fire it. -->
    <div class="pg-row">
      <span class="dbl" v-copy="programmatic">trigger: false — clicking does nothing</span>
      <button class="pg-btn pg-btn--primary" @click="programmatic.copy?.()">
        Copy it programmatically
      </button>
    </div>
  </div>
</template>

<style scoped>
.dbl {
  display: inline-block;
  font-size: 0.85rem;
  border: 1px dashed var(--stage-border);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  user-select: none;
}
.dbl[data-copied] {
  border-style: solid;
  border-color: #16a34a;
  background: #f0fdf4;
}
</style>
