<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import type { TeleportToEventDetail } from '@ozjsey/v-teleport-to'

// The axis card 02 does not have. Card 02 varies where the reference sits,
// which varies the ROOM; this varies the CONTENT, which is the other half of
// the fit test and the input every measurement bug in this library has lived
// in. A tooltip is the shape that exposes it: text re-wraps, so its height in
// normal flow is not its height at the width the directive gives it.
const SENTENCE =
  'A tooltip that explains this control in a full sentence, which is what tooltips are for, and ' +
  'which takes rather more than one single line of text to say properly at the width a tooltip ' +
  'gets, so it wraps, and wrapping is the whole point of this card. Drag the slider far enough ' +
  'and the text outgrows the default two hundred and forty pixel cap as well, which is a ' +
  'different problem from not fitting on a side: no amount of flipping can help with a ceiling ' +
  'that applies to both sides equally, so the library stops trying to move the tooltip and tells ' +
  'you it is cut instead, which is the one thing it could not do while this bug was open.'

const words = ref(36)
const placement = ref<'top' | 'bottom' | 'auto'>('top')
const open = ref(true)
// The animation from the README's own `data-teleport-state` recipe. The
// collapsing variant is the one that used to poison the measurement: at the
// moment the directive measures, the host is still `closed`, and a closed
// state that sets `max-height: 0` means the box it measures is 18px of padding
// for a 127px tooltip.
const animation = ref<'opacity' | 'collapse'>('collapse')

const trigger = useTemplateRef<HTMLElement>('trigger')
const text = computed(() => SENTENCE.split(' ').slice(0, words.value).join(' '))

const options = computed(() => ({
  to: trigger.value,
  placement: placement.value,
  enabled: open.value,
  widthMultiplier: 1.5,
}))

const fit = ref('—')
const chosen = ref('—')
const maxHeight = ref(0)
const contentHeight = ref(0)
const truncated = ref(false)
const available = ref(0)
const opposite = ref(0)

function onPositioned(e: Event) {
  const d = (e as CustomEvent<TeleportToEventDetail>).detail
  fit.value = d.fit
  chosen.value = d.placement
  maxHeight.value = Math.round(d.maxHeight)
  contentHeight.value = d.contentHeight === null ? 0 : Math.round(d.contentHeight)
  truncated.value = d.truncated
  available.value = Math.round(d.availableSpace)
  opposite.value = Math.round(d.oppositeSpace)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.5rem">
    <label class="pg-label">
      content
      <input v-model.number="words" type="range" min="3" max="90" />
      {{ words }} words
    </label>
    <label class="pg-label">
      placement
      <select v-model="placement" class="pg-select">
        <option>top</option>
        <option>bottom</option>
        <option>auto</option>
      </select>
    </label>
    <label class="pg-label">
      closed state
      <select v-model="animation" class="pg-select">
        <option value="collapse">max-height: 0 (collapses the box)</option>
        <option value="opacity">opacity only</option>
      </select>
    </label>
    <label class="pg-label"><input v-model="open" type="checkbox" /> open</label>
  </div>

  <div class="pg-row" style="margin-bottom: 0.7rem">
    <span class="pg-chip is-chosen">chosen: {{ chosen }}</span>
    <span class="pg-chip">fit: {{ fit }}</span>
    <span class="pg-chip">content {{ contentHeight }}px</span>
    <span class="pg-chip">maxHeight {{ maxHeight }}px</span>
    <span class="pg-chip">{{ chosen }} has {{ available }}px</span>
    <span class="pg-chip">other side has {{ opposite }}px</span>
    <span v-if="truncated" class="pg-chip is-cut">data-teleport-truncated</span>
  </div>

  <div class="rail">
    <button ref="trigger" class="pg-btn pg-btn--primary">reference</button>
  </div>

  <div
    v-teleport-to="options"
    class="tip"
    :class="animation === 'collapse' ? 'tip--collapse' : 'tip--fade'"
    @teleport-positioned="onPositioned"
  >
    {{ text }}
  </div>

  <p class="pg-muted">
    Drag <strong>content</strong>. The room on each side never changes — only the tooltip's own
    height does — and the placement still moves, because the fit test asks about the
    <em>content</em>, not about the box the host happened to have when the directive looked at it.
    <code>detail.contentHeight</code> is that measurement, taken with the closed state, our own
    <code>max-height</code> and the side coordinate all lifted for the duration of one synchronous
    read.
  </p>
  <p class="pg-muted">
    Switch <strong>closed state</strong> between the two animations and nothing about the verdict
    changes. That is the fix: a closed state that collapses the box
    (<code>max-height: 0</code>, <code>height: 0</code>, <code>transform: scaleY(0)</code>) used to
    be measured as the tooltip's real size, so a 127px tooltip reported 18px of padding, "fitted"
    on a side with 60px of room, and rendered thirteen of its thirty-six words with
    <code>fit</code> reading <code>fits</code>. Every attribute on the host said it was healthy.
  </p>
  <p class="pg-muted">
    Push <strong>content</strong> past what <code>maxHeight</code> allows (240px by default) and
    <code>data-teleport-truncated</code> appears while <code>fit</code> stays <code>fits</code>.
    Those two are answering different questions and both answers are correct:
    <em>the host, at the size it will render, fits on this side</em> — and <em>the content is
    taller than that size, so you are looking at a cut tooltip</em>. Flipping cannot help there,
    because the cap applies to both sides equally; raising <code>maxHeight</code>, scrolling the
    host or shortening the text can.
  </p>
</template>

<style scoped>
.rail {
  display: grid;
  place-items: center;
  padding: 2.4rem 0;
}
/* A fixed reference width, because `widthMultiplier` derives the tooltip's
   width from it — and the tooltip's width is what decides how its text wraps,
   which is what decides its height, which is what the fit test is about. A
   reference that resized with its label would make every number on this card
   depend on the font. */
.rail .pg-btn {
  width: 160px;
}
.tip {
  background: #1f2437;
  color: #fff;
  border-radius: 8px;
  padding: 0.55rem 0.8rem;
  font-size: 0.82rem;
  line-height: 1.45;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  /* `overflow: hidden` is what makes the cut visible rather than spilling —
     the same thing a real tooltip does. */
  overflow: hidden;
}
.tip--fade {
  opacity: 0;
  transition: opacity 180ms ease;
}
.tip--fade[data-teleport-state='open'] {
  opacity: 1;
}
.tip--collapse {
  transition: max-height 180ms ease, opacity 180ms ease;
}
.tip--collapse[data-teleport-state='closed'] {
  /* The exact rule from the owner's report — `!important` and all, because an
     author important declaration is what the directive's inline important
     writes have to outrank while measuring. */
  max-height: 0 !important;
  opacity: 0;
}
.pg-chip.is-cut {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
</style>
