<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

const open = ref(false)
const trigger = useTemplateRef<HTMLElement>('trigger')

const items = ['Profile', 'Billing', 'Team settings', 'Keyboard shortcuts', 'Sign out']
</script>

<template>
  <!-- The clipping parent that would normally eat a plain absolutely
       positioned dropdown. -->
  <div class="clipper">
    <span class="pg-muted">overflow: hidden; height: 70px</span>
    <button ref="trigger" class="pg-btn pg-btn--primary" @click="open = !open">
      {{ open ? 'Close' : 'Open' }} menu
    </button>
  </div>

  <div v-show="open" v-teleport-to="{ to: trigger }" class="menu">
    <button v-for="item in items" :key="item" class="item" @click="open = false">{{ item }}</button>
  </div>

  <p class="pg-muted">
    <code>position: fixed</code> coordinates come from the reference's
    <code>getBoundingClientRect()</code> alone — no ancestor's overflow, clip-path or mask is ever
    read, so the menu escapes all of them. Scroll the page with it open: it tracks.
  </p>
</template>

<style scoped>
.clipper {
  height: 70px;
  overflow: hidden;
  border: 2px dashed #dc2626;
  border-radius: 8px;
  padding: 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 0.6rem;
}
.menu {
  background: #fff;
  border: 1px solid #dfe3ec;
  border-radius: 8px;
  box-shadow: 0 12px 34px rgba(15, 20, 35, 0.18);
  padding: 0.3rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.item {
  appearance: none;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: 0.85rem;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
}
.item:hover {
  background: #eef2ff;
}
</style>
