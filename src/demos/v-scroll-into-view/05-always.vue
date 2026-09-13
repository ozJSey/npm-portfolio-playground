<script setup lang="ts">
import { ref } from 'vue'

// A chat log: the condition ("this is the newest message") stays true while
// the element keeps moving down. Edge detection would only scroll once.
const messages = ref(['hello', 'how are you?'])
const always = ref(true)

function send() {
  messages.value.push(`message ${messages.value.length + 1} — ${new Date().toLocaleTimeString()}`)
}
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <button class="pg-btn pg-btn--primary" @click="send">Send a message</button>
    <label class="pg-label"><input v-model="always" type="checkbox" /> always: true</label>
    <span class="pg-muted">turn it off, send a few, and the view stops following</span>
  </div>

  <div id="always-pane" class="pg-scroller">
    <div v-for="(m, i) in messages" :key="i" class="msg">{{ m }}</div>
    <div
      class="tail"
      v-scroll-into-view="{
        condition: true,
        always,
        container: '#always-pane',
        block: 'end',
        behavior: 'smooth',
      }"
    />
  </div>
</template>

<style scoped>
.msg {
  padding: 0.4rem 0.7rem;
  font-size: 0.85rem;
  border-bottom: 1px solid #eef1f6;
}
.tail {
  height: 1px;
}
</style>
