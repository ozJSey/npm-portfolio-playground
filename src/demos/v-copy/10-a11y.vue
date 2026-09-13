<script setup lang="ts">
/**
 * Tab into the stage and press Enter or Space on each item.
 *
 * A non-interactive host (span / li / div) gets `tabindex="0"` + `role="button"`
 * from the directive so it is operable without a mouse. Native buttons and
 * links are left alone — they already activate on Enter/Space.
 */
</script>

<template>
  <div class="pg-col">
    <span class="target" v-copy>Non-interactive span — inspect it: tabindex + role were added</span>

    <span class="target" v-copy="{ source: 'custom announcement', announce: 'Email address copied' }">
      Custom aria-live message
    </span>

    <span class="target" v-copy="{ source: 'silent', announce: false }">
      announce: false — nothing is read out
    </span>

    <button class="pg-btn" v-copy="'native button untouched'">
      Native button — no tabindex/role injected
    </button>

    <p class="pg-muted">
      One shared visually-hidden <code>aria-live="polite"</code> region is created for the whole
      page, not one per element.
    </p>
  </div>
</template>

<style scoped>
.target {
  display: inline-block;
  font-size: 0.85rem;
  border: 1px solid var(--stage-border);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  max-width: 40rem;
}
.target:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
.target[data-copied] {
  border-color: #16a34a;
  background: #f0fdf4;
}
</style>
