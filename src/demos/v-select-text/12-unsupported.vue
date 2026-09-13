<script setup lang="ts">
import { ref } from 'vue'
import type { SelectTextEventDetail } from 'v-select-text'

const divEnabled = ref(false)
const hiddenEnabled = ref(false)
const numberEnabled = ref(false)
const events = ref<string[]>([])

// Every host below bubbles its `select-text` up here, so the log is proof that
// a selection really happened — even for the one you cannot see.
function onSelectText(e: Event) {
  const d = (e as CustomEvent<SelectTextEventDetail>).detail
  const flat = d.text.replace(/\s+/g, ' ').trim()
  const preview = flat.length > 38 ? `${flat.slice(0, 38)}…` : flat
  events.value.unshift(`kind=${d.kind} start=${d.start} end=${d.end} text="${preview}"`)
  events.value.length = Math.min(events.value.length, 5)
}

const flags = { div: divEnabled, hidden: hiddenEnabled, number: numberEnabled }

// 'edge' fires on false → true, so re-firing needs the round trip.
function fire(which: 'div' | 'hidden' | 'number') {
  const flag = flags[which]
  flag.value = false
  requestAnimationFrame(() => (flag.value = true))
}
</script>

<template>
  <div class="pg-col" @select-text="onSelectText">
    <div class="pg-row">
      <label class="pg-label"><input v-select-text type="checkbox" /> input[type=checkbox]</label>
      <label class="pg-label">
        <input v-select-text class="pg-input" type="color" style="width: 3rem" />
        input[type=color]
      </label>
      <img v-select-text class="ghost" alt="img — replaced content, no text node" />
      <select v-select-text class="pg-select">
        <option>select — option text is not selectable</option>
      </select>
    </div>

    <p class="pg-muted">
      Those four stand in for the whole no-op list: input types that cannot hold text
      (<code>hidden file image submit reset button checkbox radio color range</code>) and tags with
      no text node at all (<code>img br hr canvas video audio iframe embed object select progress
      meter svg</code>). Each one warns and returns —
      <code>[v-select-text] &lt;img&gt; holds no selectable text. Use an &lt;input&gt;, a
      &lt;textarea&gt;, or any element with text content.</code>
    </p>

    <div v-select-text="{ enabled: divEnabled }" class="box">
      A plain <strong>&lt;div&gt;</strong> with nested markup. In v1 this warned and did nothing —
      it is now <code>kind: 'text'</code> and selects through the Range API, which is the point of
      the package.
    </div>
    <div class="pg-row">
      <button class="pg-btn pg-btn--primary" @click="fire('div')">
        Select the &lt;div&gt; (used to warn)
      </button>
    </div>

    <p v-select-text="{ enabled: hiddenEnabled }" class="no-select">
      This paragraph resolves to <code>user-select: none</code>. Press the button: the Range is
      created and the event below fires — the browser simply refuses to paint the highlight.
    </p>
    <div class="pg-row">
      <button class="pg-btn" @click="fire('hidden')">
        Select the user-select: none paragraph
      </button>
    </div>

    <p class="pg-muted">
      That one is the second diagnostic, warned <em>once per element</em> however often you fire it:
      <code>[v-select-text] &lt;p&gt; resolves to `user-select: none`, so the selection is made but
      never painted. Remove that rule (or set `user-select: text`) to see it.</code> Nothing is
      broken — only the painting is suppressed. The log shows what the directive resolved and
      selected; read the live <code>window.getSelection().toString()</code> in the console to see
      that the document selection is genuinely empty here.
    </p>

    <div class="pg-row">
      <input
        v-select-text="{ enabled: numberEnabled, start: 1, end: 3 }"
        class="pg-input"
        type="number"
        value="1234567"
        style="width: 10rem"
      />
      <button class="pg-btn" @click="fire('number')">Select chars 1–3 (input[type=number])</button>
    </div>

    <pre class="pg-log">{{ events.join('\n') || '— no selection yet —' }}</pre>

    <p class="pg-muted">
      <code>input[type=number]</code> and <code>[type=email]</code> are supported, but
      <code>setSelectionRange</code> throws on them in real browsers, so the directive falls back to
      <code>select()</code> — the log reports <code>0–7</code>, not the <code>1–3</code> that was
      asked for. Open the console: nothing here throws, and the only output is one warning per
      unsupported host (repeated whenever Vue re-patches it, since the check re-runs in
      <code>updated</code>) plus the single <code>user-select</code> notice.
    </p>
  </div>
</template>

<style scoped>
.box {
  border: 1px dashed var(--stage-border);
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  font-size: 0.85rem;
  max-width: 34rem;
}
.no-select {
  user-select: none;
  -webkit-user-select: none;
  border: 1px dashed #c7d0ff;
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  margin: 0;
  font-size: 0.85rem;
  max-width: 34rem;
  background: #fbfcfe;
}
.ghost {
  display: inline-block;
  min-width: 12rem;
  border: 1px dashed var(--stage-border);
  border-radius: 6px;
  padding: 0.2rem 0.5rem;
  font-size: 0.78rem;
  color: #6b7488;
}
</style>
