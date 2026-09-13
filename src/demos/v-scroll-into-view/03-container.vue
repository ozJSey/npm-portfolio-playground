<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

type Form = 'element' | 'selector' | 'scope' | 'getter' | 'none'

const form = ref<Form>('element')
const go = ref(false)
const paneRef = useTemplateRef<HTMLElement>('pane')

function container() {
  switch (form.value) {
    case 'element':
      return paneRef.value ?? undefined
    case 'selector':
      return '#chat-pane'
    // `:scope <sel>` resolves with el.closest() — the right form inside a v-for
    // where every row should walk up to its own scroller.
    case 'scope':
      return ':scope .chat-pane'
    case 'getter':
      return () => document.querySelector<HTMLElement>('#chat-pane')
    case 'none':
      return undefined
  }
}

function jump() {
  go.value = false
  requestAnimationFrame(() => (go.value = true))
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      container form
      <select v-model="form" class="pg-select">
        <option value="element">HTMLElement ref</option>
        <option value="selector">'#chat-pane'</option>
        <option value="scope">':scope .chat-pane'</option>
        <option value="getter">() =&gt; element</option>
        <option value="none">omitted (native — scrolls the page!)</option>
      </select>
    </label>
    <button class="pg-btn pg-btn--primary" @click="jump">Scroll to the last message</button>
  </div>

  <div id="chat-pane" ref="pane" class="chat-pane pg-scroller">
    <div v-for="i in 30" :key="i" class="msg" :class="{ me: i % 3 === 0 }">
      message {{ i }}
    </div>
    <div
      class="msg target"
      v-scroll-into-view="{ condition: go, container: container(), block: 'end', behavior: 'smooth' }"
    >
      📌 last message
    </div>
  </div>

  <p class="pg-muted">
    Pick “omitted” to feel the problem this option fixes: the browser walks up the ancestor chain
    and scrolls <em>every</em> scrollable box on it — measured here, the pane goes 0 → 882 and the
    page goes 0 → 562. Pinning the container stops at the pane. If a container resolves to
    <code>null</code> or is detached, the directive is a silent no-op — it never falls back to
    native.
  </p>
</template>

<style scoped>
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
</style>
