<script setup lang="ts">
import { computed, ref } from 'vue'
import { NO_ROLE_DEFAULTS, ROLE_DEFAULTS } from '@ozjsey/v-keyboard-navigation'
import type { KeyboardNavigationRole } from '@ozjsey/v-keyboard-navigation'

type Role = KeyboardNavigationRole | 'none'

const role = ref<Role>('toolbar')
const wrapOverride = ref<'default' | 'wrap' | 'nowrap'>('default')
const rtl = ref(false)

// Read out of the library, never retyped. A hand-maintained copy of this table
// is two writers for one fact, in a file written to be copied — change a role
// default in roles.ts and the card would go on displaying the old one.
const AXIS_NAME = { inline: 'inline (horizontal)', block: 'block (vertical)', both: 'both' }

const defaults = computed(() =>
  role.value === 'none' ? NO_ROLE_DEFAULTS : ROLE_DEFAULTS[role.value],
)
const shown = computed(() => ({
  axis: AXIS_NAME[defaults.value.axis],
  wrap: defaults.value.wrap ? 'wrap' : 'clamp',
  skipDisabled: defaults.value.skipDisabled,
}))
const hostRole = computed(() => (role.value === 'none' ? undefined : role.value))
const options = computed(() => ({
  wrap: wrapOverride.value === 'default' ? undefined : wrapOverride.value,
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      role
      <select v-model="role" class="pg-select">
        <option value="toolbar">toolbar</option>
        <option value="tablist">tablist</option>
        <option value="menubar">menubar</option>
        <option value="menu">menu</option>
        <option value="listbox">listbox</option>
        <option value="radiogroup">radiogroup</option>
        <option value="none">no role</option>
      </select>
    </label>
    <label class="pg-label">
      wrap
      <select v-model="wrapOverride" class="pg-select">
        <option value="default">role default</option>
        <option value="wrap">'wrap'</option>
        <option value="nowrap">'nowrap'</option>
      </select>
    </label>
    <label class="pg-label"><input type="checkbox" v-model="rtl" /> RTL</label>
  </div>

  <div class="strip" :class="{ vertical: shown.axis.startsWith('block') }"
    :role="hostRole" :dir="rtl ? 'rtl' : 'ltr'" aria-label="Demo group"
    v-keyboard-navigation="options">
    <button v-for="n in 5" :key="n" class="cell">{{ n }}</button>
  </div>

  <p class="pg-kv">default axis: <code class="axis">{{ shown.axis }}</code></p>
  <p class="pg-kv">default ends: <code class="ends">{{ shown.wrap }}</code></p>
  <p class="pg-kv">
    default <code>skipDisabled</code>: <code class="skip">{{ shown.skipDisabled }}</code>
    <span class="pg-muted">— see card 14</span>
  </p>

  <p class="pg-muted">
    Defaults come from the role, following the APG: a toolbar and a listbox stop at the ends
    (the user needs to feel where the list finishes), while a menu, menubar, tablist and radio
    group cycle. With no role at all both axes are bound and the ends clamp — the same call the
    platform's <code>focusgroup</code> attribute makes.
  </p>
  <p class="pg-muted">
    Turn on RTL with a horizontal role: <kbd>←</kbd> becomes "next". Orientation is never inferred
    from the measured layout — only from <code>role</code>, <code>aria-orientation</code> or the
    option — because a rule that read the box would change the keyboard on a window resize.
  </p>
  <p class="pg-muted">
    Two things this card is careful about. The table above is
    <code>ROLE_DEFAULTS</code>/<code>NO_ROLE_DEFAULTS</code> imported from the library, not a copy
    — a second hand-maintained table would drift the moment a default changed. And the host is
    <em>not</em> keyed on the role, so switching it re-resolves the options on the mounted
    directive rather than tearing it down and building a new one: this card is the only live proof
    that changing <code>role</code> at runtime works without a remount.
  </p>
</template>

<style scoped>
.strip {
  display: flex;
  gap: 0.3rem;
  width: max-content;
  padding: 0.35rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
}
.strip.vertical {
  flex-direction: column;
}
.cell {
  width: 44px;
  height: 34px;
  border: 1px solid #e3e7f0;
  border-radius: 7px;
  background: #fbfcfe;
  font: inherit;
  cursor: pointer;
}
.cell[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
  font-weight: 700;
}
.cell:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 1px;
}
</style>
