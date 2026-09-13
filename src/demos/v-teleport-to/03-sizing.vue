<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

const matchWidth = ref(false)
const multiplier = ref(1.5)
const maxWidthOn = ref(false)
const maxWidth = ref(280)
const maxHeight = ref(180)
const trigger = useTemplateRef<HTMLElement>('trigger')

const options = computed(() => ({
  to: trigger.value,
  matchWidth: matchWidth.value,
  widthMultiplier: multiplier.value,
  maxWidth: maxWidthOn.value ? maxWidth.value : undefined,
  maxHeight: maxHeight.value,
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label"><input v-model="matchWidth" type="checkbox" /> matchWidth</label>
    <label class="pg-label">
      widthMultiplier
      <input v-model.number="multiplier" type="range" min="0.5" max="3" step="0.1" />
      {{ multiplier.toFixed(1) }}
    </label>
    <label class="pg-label"><input v-model="maxWidthOn" type="checkbox" /> maxWidth</label>
    <input
      v-model.number="maxWidth"
      class="pg-input"
      type="number"
      step="20"
      :disabled="!maxWidthOn"
      style="width: 5.5rem"
    />
    <label class="pg-label">
      maxHeight
      <input v-model.number="maxHeight" type="range" min="60" max="320" step="20" />
      {{ maxHeight }}
    </label>
  </div>

  <button ref="trigger" class="pg-btn" style="width: 220px">220px reference</button>

  <div v-teleport-to="options" class="panel">
    <p v-for="i in 12" :key="i" class="line">line {{ i }} — the panel scrolls at maxHeight</p>
  </div>

  <p class="pg-muted">
    Precedence, in order: <code>matchWidth</code> beats <code>maxWidth</code>, which beats
    <code>parentWidth × widthMultiplier</code> and the mobile full-bleed branch. Narrow the browser
    below 768px with everything off to see full-bleed — it writes a real <code>width: 100vw</code>,
    not just a cap, so the host is a genuine full-width sheet rather than a narrow menu stranded at
    the screen's left edge. Setting <code>maxWidth</code> opts out of that branch entirely, anchor
    included.
  </p>
  <p class="pg-muted">
    Both narrowing knobs really narrow. The host also carries a
    <code>min-width</code> of the reference's own width, which used to be written unconditionally
    and therefore beat every ceiling: on this 220px reference,
    <code>widthMultiplier: 0.5</code> rendered 220px and <code>maxWidth: 0</code> rendered 220px.
    Drag the multiplier below <code>1.0</code>, or tick <code>maxWidth</code> and type a number
    under 220, and watch the panel actually get narrower. The floor yields to the ceiling.
  </p>
  <p class="pg-muted">
    Toggle <code>matchWidth</code> on and off again and the panel returns to its previous width:
    the pinned <code>width</code> is cleared, not left welded on.
  </p>
</template>

<style scoped>
.panel {
  background: #fff;
  border: 1px solid #dfe3ec;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 20, 35, 0.16);
  overflow: auto;
  padding: 0.4rem 0.6rem;
}
.line {
  margin: 0;
  font-size: 0.8rem;
  color: #40485c;
  white-space: nowrap;
}
</style>
