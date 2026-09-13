<script setup lang="ts">
import { ref } from 'vue'

const token = ref('sk_live_51H9xQ2eZvKYlo2C…')
const masked = ref(true)
</script>

<template>
  <div class="pg-col">
    <div class="pg-row">
      <!-- String binding: copies the value, not the visible text. -->
      <button class="pg-btn" v-copy="token">
        Copy token ({{ masked ? 'sk_live_••••••' : token }})
      </button>
      <label class="pg-label">
        <input v-model="masked" type="checkbox" /> mask on screen
      </label>
    </div>

    <!-- Getter form: evaluated at click time, so it is never stale. -->
    <button class="pg-btn" v-copy="{ source: () => new Date().toISOString() }">
      Copy the current timestamp
    </button>

    <!-- Numbers are accepted and stringified. -->
    <button class="pg-btn" v-copy="42">Copy the number 42</button>

    <p class="pg-muted">Paste into any field to verify — the visible label is not what is copied.</p>
  </div>
</template>
