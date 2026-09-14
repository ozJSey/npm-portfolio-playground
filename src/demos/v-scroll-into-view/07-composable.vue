<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useScrollIntoView } from '@ozjsey/v-scroll-into-view'

const sectionRef = useTemplateRef<HTMLElement>('section')
const paneRef = useTemplateRef<HTMLElement>('pane')
const readout = ref('—')

const scroller = useScrollIntoView({
  target: () => sectionRef.value,
  options: {
    behavior: 'smooth',
    block: 'start',
    container: '#composable-pane',
    offset: { top: 16 },
  },
})

function instant() {
  // update() MERGES — container and offset survive.
  scroller.update({ behavior: 'instant' })
  scroller.scroll()
}

/**
 * The card used to demonstrate `cancel()` with a button disabled on
 * `state.value === 'idle'` — and `state` is `'pending'` for exactly one frame,
 * so that button was disabled every time a human looked at it. A control
 * nobody can press is not a demonstration. This one presses both halves for
 * you and reports whether the pane stayed put, which is the thing `cancel()`
 * actually claims.
 */
function scrollThenCancel(): void {
  const pane = paneRef.value
  if (!pane) return
  pane.scrollTop = 0
  const before = Math.round(pane.scrollTop)
  scroller.scroll()
  const queued = scroller.state.value
  scroller.cancel()
  window.setTimeout(() => {
    const after = Math.round(pane.scrollTop)
    readout.value =
      `state was '${queued}' between the two calls · scrollTop ${before} → ${after}` +
      (after === before ? ' — the queued frame never ran' : ' — IT SCROLLED ANYWAY')
  }, 400)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" @click="scroller.scroll()">scroll()</button>
    <button class="pg-btn" @click="instant">update({ behavior: 'instant' }) + scroll()</button>
    <button class="pg-btn" @click="scrollThenCancel">scroll() then cancel()</button>
    <span class="pg-chip">state: {{ scroller.state.value }}</span>
  </div>

  <p class="pg-kv readout">{{ readout }}</p>

  <div id="composable-pane" ref="pane" class="pg-scroller">
    <p v-for="i in 16" :key="i" class="filler">filler {{ i }}</p>
    <section ref="section" class="target">📍 composable target</section>
    <p v-for="i in 16" :key="`t${i}`" class="filler">filler {{ i + 16 }}</p>
  </div>

  <p class="pg-muted">
    <code>state</code> is <code>'pending'</code> from the <code>scroll()</code> call until the next
    animation frame — one frame, by construction. It is a hook for code that needs to know a scroll
    is queued, not a control a person can catch, which is why <code>cancel()</code> is shown here
    driven from code rather than from a disabled button.
    <br /><br />
    The composable takes <code>UseScrollIntoViewOptions</code>: the directive's options minus
    <code>condition</code> and <code>always</code>. Both answer “did something change?”, and calling
    <code>scroll()</code> has already answered it — they used to be accepted and silently ignored,
    so <code>{ condition: false }</code> scrolled anyway with TypeScript's blessing. Gate the call
    site instead. <code>update()</code> merges, so the <code>container</code> and
    <code>offset</code> set above survive a <code>behavior</code>-only change.
  </p>
</template>

<style scoped>
.readout {
  margin: 0 0 0.5rem;
}
.filler {
  margin: 0;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: #97a0b4;
  border-bottom: 1px solid #eef1f6;
}
.target {
  padding: 0.7rem;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
</style>
