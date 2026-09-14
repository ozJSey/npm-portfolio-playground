<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import type { VScrollIntoViewOptions } from '@ozjsey/v-scroll-into-view'

type Form = 'getter' | 'element' | 'selector' | 'scope' | 'none'
/** The three ways people write a template ref into the binding. Only one works. */
type RefForm = 'getter' | 'raw' | 'coalesced'

const form = ref<Form>('getter')
const refForm = ref<RefForm>('getter')
const go = ref(false)
const mounted = ref(true)
/**
 * The mount-time row does not fire on page load — only once the button below
 * has armed it. Otherwise every visit to this tab would scroll the pane (and,
 * on the `?? undefined` setting, the page) before anyone asked for anything.
 */
const armed = ref(false)
const readout = ref('—')
const paneRef = useTemplateRef<HTMLElement>('pane')
const outerRef = useTemplateRef<HTMLElement>('outer')

/**
 * The whole binding, because "no container" is spelled by leaving the KEY OUT.
 * Setting it to `undefined` reaches the same native path and is warned about
 * since 1.3.1 — not because it is wrong, but because it is what
 * `paneRef.value ?? undefined` collapses to, and that one is a bug.
 */
function options(): VScrollIntoViewOptions {
  const base: VScrollIntoViewOptions = { condition: go.value, block: 'end', behavior: 'smooth' }
  switch (form.value) {
    // The form to reach for: a function, called at scroll time, so it does not
    // matter that the parent assigns the ref after this element renders.
    case 'getter':
      return { ...base, container: () => paneRef.value }
    case 'element':
      return { ...base, container: paneRef.value }
    case 'selector':
      return { ...base, container: '#chat-pane' }
    // `:scope <sel>` resolves with el.closest() — the right form inside a v-for
    // where every row should walk up to its own scroller.
    case 'scope':
      return { ...base, container: ':scope .chat-pane' }
    case 'none':
      return base
  }
}

/**
 * The mount-time binding, in whichever spelling is selected.
 *
 * This is evaluated while the row RENDERS, which is before the parent has
 * assigned `ref="pane"` — so `paneRef.value` is `null` here on the first pass,
 * every time, and the three spellings then part company:
 *
 *   `() => paneRef.value`          resolved at scroll time  → the pane scrolls
 *   `paneRef.value`                `null`                   → nothing scrolls, warns
 *   `paneRef.value ?? undefined`   "no container"           → NATIVE, everything scrolls
 *
 * The last one is the trap, and until 1.3.1 the types insisted on it:
 * `ContainerRef` had no `null` arm, so `paneRef.value` did not compile and the
 * `?? undefined` that did compile silently scrolled the page.
 */
function mountBinding(): VScrollIntoViewOptions {
  const condition = armed.value
  // `instant`, because the readout beside the button is a measurement: a smooth
  // scroll read two frames later reports how far the animation has got, not
  // where it was going.
  const base = { condition, block: 'end', behavior: 'instant' } as const
  // `container: paneRef.value` is the line that would not COMPILE before
  // 1.3.1 — `paneRef.value` is `HTMLElement | null` and `ContainerRef` had no
  // `null` arm. `pnpm typecheck` is where that regression gets caught.
  if (refForm.value === 'getter') return { ...base, container: () => paneRef.value }
  if (refForm.value === 'raw') return { ...base, container: paneRef.value }
  return { ...base, container: paneRef.value ?? undefined }
}

function jump() {
  go.value = false
  requestAnimationFrame(() => (go.value = true))
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** Remount the pane with the condition already true, and measure what moved. */
async function remount() {
  readout.value = 'scrolling…'
  armed.value = true
  mounted.value = false
  await nextTick()
  const outer = outerRef.value!
  outer.scrollTop = 0
  const pageBefore = Math.round(window.scrollY)
  await frame()
  mounted.value = true
  await nextTick()
  await frame()
  await frame()
  const pane = paneRef.value
  readout.value =
    `pane ${pane ? Math.round(pane.scrollTop) : 0} · ` +
    `outer ${Math.round(outer.scrollTop)} · page ${Math.round(window.scrollY) - pageBefore}`
  // Put the page back where it was. The number above is the measurement; a tab
  // that silently jumps under the next thing you click is not.
  window.scrollTo({ top: pageBefore, behavior: 'instant' })
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      container form
      <select v-model="form" class="pg-select">
        <option value="getter">() =&gt; paneRef.value</option>
        <option value="element">paneRef.value (HTMLElement)</option>
        <option value="selector">'#chat-pane'</option>
        <option value="scope">':scope .chat-pane'</option>
        <option value="none">omitted (native — scrolls the page!)</option>
      </select>
    </label>
    <button class="pg-btn pg-btn--primary" @click="jump">Scroll to the last message</button>
  </div>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      on mount
      <select v-model="refForm" class="pg-select">
        <option value="getter">container: () =&gt; paneRef.value</option>
        <option value="raw">container: paneRef.value</option>
        <option value="coalesced">container: paneRef.value ?? undefined</option>
      </select>
    </label>
    <button class="pg-btn" @click="remount">Remount, scrolling on mount</button>
    <span class="pg-kv readout">{{ readout }}</span>
  </div>

  <div ref="outer" class="outer">
    <div class="above">the scroller above the pane — stands in for the page</div>
    <div v-if="mounted" id="chat-pane" ref="pane" class="chat-pane pg-scroller">
      <div v-for="i in 30" :key="i" class="msg" :class="{ me: i % 3 === 0 }">
        message {{ i }}
      </div>
      <div
        class="msg target"
        v-scroll-into-view="options()"
      >
        📌 last message
      </div>
      <div class="msg mount-target" v-scroll-into-view="mountBinding()">
        ⤵️ mount-time target
      </div>
    </div>
    <div class="below">and the scroller below it</div>
  </div>

  <p class="pg-muted">
    Pick “omitted” to feel the problem this option fixes: the browser walks up the ancestor chain
    and scrolls <em>every</em> scrollable box on it — the pane, the box around it, and the page.
    Pinning the container stops at the pane. If a container resolves to <code>null</code> or is
    detached, the directive is a silent no-op — it never falls back to native.
  </p>
  <p class="pg-muted">
    The second row is the one that cost a certification finding.
    <code>container: paneRef.value ?? undefined</code> is what TypeScript used to force you to
    write, because <code>ContainerRef</code> had no <code>null</code> arm — and on the
    <strong>mount-time</strong> scroll it is <code>undefined</code>, which means “no container”, so
    the directive takes the native path and moves the outer scroller (and the page) after all. Try
    all three: the getter scrolls the pane and leaves <code>outer</code> at 0; the raw
    <code>null</code> scrolls nothing and says so in the console;
    <code>?? undefined</code> moves <code>outer</code> several hundred pixels. Since 1.3.1 the raw
    form type-checks and the <code>?? undefined</code> form warns instead of going quietly.
  </p>
</template>

<style scoped>
.outer {
  height: 280px;
  overflow: auto;
  border: 1px dashed var(--stage-border);
  border-radius: 8px;
  padding: 0.4rem;
}
.above,
.below {
  height: 220px;
  display: grid;
  place-items: center;
  font-size: 0.78rem;
  color: #97a0b4;
  background: repeating-linear-gradient(45deg, #f7f9fc, #f7f9fc 8px, #fbfcfe 8px, #fbfcfe 16px);
  border-radius: 6px;
}
.msg {
  padding: 0.4rem 0.7rem;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.msg.me {
  text-align: right;
  color: #3730a3;
}
.target {
  background: #eef2ff;
  font-weight: 600;
}
.mount-target {
  background: #fff7ed;
  font-weight: 600;
}
.readout {
  color: #6b7488;
}
</style>
