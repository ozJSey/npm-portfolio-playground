<script setup lang="ts">
import { computed, ref } from 'vue'

type Role = 'toolbar' | 'tablist' | 'menu' | 'menubar' | 'listbox' | 'radiogroup' | 'none'

const role = ref<Role>('toolbar')
const wrapOverride = ref<'default' | 'wrap' | 'nowrap'>('default')
const rtl = ref(false)

const DEFAULTS: Record<Role, { axis: string; wrap: string }> = {
  toolbar: { axis: 'inline (horizontal)', wrap: 'clamp' },
  tablist: { axis: 'inline (horizontal)', wrap: 'wrap' },
  menubar: { axis: 'inline (horizontal)', wrap: 'wrap' },
  menu: { axis: 'block (vertical)', wrap: 'wrap' },
  listbox: { axis: 'block (vertical)', wrap: 'clamp' },
  radiogroup: { axis: 'both', wrap: 'wrap' },
  none: { axis: 'both', wrap: 'clamp' },
}

const shown = computed(() => DEFAULTS[role.value])
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

  <div :key="role" class="strip" :class="{ vertical: shown.axis.startsWith('block') }"
    :role="hostRole" :dir="rtl ? 'rtl' : 'ltr'" aria-label="Demo group"
    v-keyboard-navigation="options">
    <button v-for="n in 5" :key="n" class="cell">{{ n }}</button>
  </div>

  <p class="pg-kv">default axis: {{ shown.axis }}</p>
  <p class="pg-kv">default ends: {{ shown.wrap }}</p>

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
