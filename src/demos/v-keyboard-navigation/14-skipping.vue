<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { ROLE_DEFAULTS } from '@ozjsey/v-keyboard-navigation'
import type {
  KeyboardNavigationEventDetail,
  KeyboardNavigationRole,
} from '@ozjsey/v-keyboard-navigation'

// Read out of the library, never retyped. A hand-copied defaults table is two
// writers for one fact, and the card is the one that goes stale in silence.
const roles: KeyboardNavigationRole[] = [
  'menu',
  'menubar',
  'toolbar',
  'tablist',
  'listbox',
  'radiogroup',
]

/** The item role each pattern expects. `toolbar` wants plain buttons. */
const ITEM_ROLE: Record<KeyboardNavigationRole, string | undefined> = {
  menu: 'menuitem',
  menubar: 'menuitem',
  toolbar: undefined,
  tablist: 'tab',
  listbox: 'option',
  radiogroup: 'radio',
}

const role = ref<KeyboardNavigationRole>('menu')
const override = ref<'default' | 'skip' | 'keep'>('default')
const skipAll = ref(false)

const itemRole = computed(() => ITEM_ROLE[role.value])
const horizontal = computed(() => ROLE_DEFAULTS[role.value].axis === 'inline')

const rows: { id: string; label: string; kind: 'live' | 'disabled' | 'opted-out' }[] = [
  { id: 'new', label: 'New file', kind: 'live' },
  { id: 'open', label: 'Open…', kind: 'live' },
  { id: 'paste', label: 'Paste', kind: 'disabled' },
  { id: 'rename', label: 'Rename', kind: 'live' },
  { id: 'more', label: 'Load more…', kind: 'opted-out' },
]

/** What the card *writes*, as opposed to what it reads back below. */
function isDisabled(kind: string): boolean {
  return kind === 'disabled' || (skipAll.value && kind !== 'opted-out')
}

const roleDefault = computed(() => ROLE_DEFAULTS[role.value].skipDisabled)
const effective = computed(() =>
  override.value === 'default' ? roleDefault.value : override.value === 'skip',
)

const log = ref<string[]>([])
function onNavigate(detail: KeyboardNavigationEventDetail) {
  log.value = [...log.value, detail.item.getAttribute('data-label') || '?'].slice(-6)
}

// `undefined` leaves the role default in charge; the two booleans override it.
// The role itself is on the host as a real `role` attribute — the directive
// reads it there, which is the case worth demonstrating.
const options = computed(() => ({
  skipDisabled: override.value === 'default' ? undefined : override.value === 'skip',
  onNavigate,
}))

const host = useTemplateRef<HTMLElement>('host')
const readout = ref({ state: '—', items: 0, skipped: 0, tabbable: 0 })
function measure() {
  const el = host.value
  if (!el) return
  readout.value = {
    state: el.getAttribute('data-keyboard-navigation-state') || '—',
    items: el.querySelectorAll(
      '[data-keyboard-navigation-item="active"],[data-keyboard-navigation-item="inactive"]',
    ).length,
    skipped: el.querySelectorAll('[data-keyboard-navigation-item="skipped"]').length,
    tabbable: el.querySelectorAll('[tabindex="0"]').length,
  }
}
</script>

<template>
  <p class="pg-muted">
    Three piles, not two. <strong>Items</strong> are the arrow stops.
    <strong>Skipped</strong> matched the selector and is focusable, but the arrows step over it —
    held at <code>tabindex="-1"</code> so it cannot become a second tab stop.
    <strong>Not ours</strong> (<code>focusgroup="none"</code>) is never touched at all and keeps its
    own place in the tab order.
  </p>

  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      role
      <select v-model="role" class="pg-select">
        <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
      </select>
    </label>
    <label class="pg-label">
      skipDisabled
      <select v-model="override" class="pg-select">
        <option value="default">(role default)</option>
        <option value="skip">true — step over</option>
        <option value="keep">false — stop on it</option>
      </select>
    </label>
    <label class="pg-label">
      <input type="checkbox" v-model="skipAll" />
      disable <em>every</em> row
    </label>
    <button class="pg-btn" @click="measure">Measure</button>
  </div>

  <div ref="host" class="menu" :class="{ horizontal }" :role="role" :aria-label="role"
    v-keyboard-navigation="options">
    <button v-for="row in rows" :key="row.id" class="row" :role="itemRole" :data-label="row.label"
      :aria-disabled="isDisabled(row.kind) ? 'true' : undefined"
      :focusgroup="row.kind === 'opted-out' ? 'none' : undefined">
      {{ row.label }}
      <span v-if="isDisabled(row.kind)" class="tag">aria-disabled</span>
      <span v-if="row.kind === 'opted-out'" class="tag out">focusgroup="none"</span>
    </button>
  </div>

  <p class="pg-kv">
    <code>{{ role }}</code> defaults to <code class="role-default">skipDisabled: {{ roleDefault }}</code>
    — in force here: <code class="effective">{{ effective }}</code>
  </p>
  <p class="pg-kv">
    state <code class="state">{{ readout.state }}</code> · items
    <code class="count-items">{{ readout.items }}</code> · skipped
    <code class="count-skipped">{{ readout.skipped }}</code> · tabbable
    <code class="count-tabbable">{{ readout.tabbable }}</code>
    <span class="pg-muted">&nbsp;(press Measure after changing anything)</span>
  </p>
  <p class="pg-kv">visited: <code class="visited">{{ log.length ? log.join(' → ') : '—' }}</code></p>

  <p class="pg-muted">
    <strong>Menus keep their unavailable options; toolbars and listboxes step over them.</strong>
    Where the set of options is itself information, a user who never lands on <em>Paste</em> never
    learns that pasting exists here — so <code>menu</code> and <code>menubar</code> default to
    <code>skipDisabled: false</code>, and every other pattern to <code>true</code>. Switch the role
    and arrow onto <em>Open…</em>: the next <kbd>↓</kbd> either stops on Paste or jumps past it.
    A natively <code>disabled</code> control is never an arrow stop under any setting, because the
    platform will not focus it at all.
  </p>
  <p class="pg-muted">
    <strong>Tick “disable every row”, press Measure, then Tab through this card.</strong> Items
    drops to 0 and the host says <code>empty</code> — but <em>tabbable stays at 1</em>: the first
    skipped row holds the stop, because a group that reaches zero tabbable elements has left the
    keyboard and nothing on screen says so. An arrow claims nothing, since there is nowhere to go.
    The <code>focusgroup="none"</code> row is unaffected either way — it was never the directive's.
  </p>
  <p class="pg-muted">
    <strong>The part this card cannot prove.</strong> A skipped row is still in the accessibility
    tree, so a screen reader in browse mode reaches something the arrows will not. That is why only
    <em>announced</em> states are skippable here — <code>aria-disabled</code> is read out as
    disabled — and why <code>focusgroup="none"</code> leaves the row in the tab order instead of
    hiding it. Card 13 is the manual walkthrough; until somebody runs it, this paragraph is
    reasoning rather than evidence.
  </p>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 280px;
  padding: 0.25rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
  background: #fff;
}
.menu.horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  width: auto;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid transparent;
  border-radius: 7px;
  background: none;
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}
.row[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
  font-weight: 600;
}
.row[data-keyboard-navigation-item='skipped'] {
  color: #9ca3af;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 5px,
    #f6f7fa 5px,
    #f6f7fa 10px
  );
}
.row:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}
.tag {
  font-size: 0.66rem;
  letter-spacing: 0.02em;
  color: #9ca3af;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0 0.4rem;
  font-weight: 400;
}
.tag.out {
  color: #b45309;
  border-color: #fde68a;
  background: #fffbeb;
}
</style>
