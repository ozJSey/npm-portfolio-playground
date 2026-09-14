<script setup lang="ts">
import { ref } from 'vue'

const checks = [
  {
    id: 'toolbar',
    what: 'Toolbar (NVDA/JAWS + Chrome, VoiceOver + Safari)',
    steps: [
      'Tab into the toolbar. You should hear the group name "Formatting, toolbar" and the first button.',
      'Press Right twice. Each button is announced as you land on it; the toolbar name is not repeated.',
      'Press Tab. Focus must leave the toolbar entirely — not walk to the second button.',
    ],
  },
  {
    id: 'listbox',
    what: 'Listbox, roving tabindex',
    steps: [
      'Tab into the list. Expect "Cities, list box" then the current option with its position, e.g. "Berlin, 3 of 6".',
      'Arrow down. Each option is announced. The position ("4 of 6") must keep counting.',
      'Click an option. It should announce as selected — that is this card writing aria-selected, not the directive.',
    ],
  },
  {
    id: 'activedescendant',
    what: 'Listbox, aria-activedescendant',
    steps: [
      'Tab into the list. Focus stays on the box itself; the reader should still announce the pointed-at option.',
      'Arrow down. The newly pointed option must be announced even though DOM focus never moved.',
      'If the reader goes silent here, aria-activedescendant is pointing at an id that is not a valid option — that is the failure this mode is prone to.',
    ],
  },
  {
    id: 'skipping',
    what: 'Skipped items — the two lists that must not diverge',
    steps: [
      'Tab into the "skipping" menu. Arrow down through it. The arrows stop on New, Open and Rename and step over Paste.',
      'Now read the same menu with the virtual cursor (NVDA/JAWS browse mode, or VO+Right on macOS). You WILL reach Paste — it is still in the accessibility tree. It must be announced as "dimmed" / "unavailable"; if it is announced as an ordinary item, the two lists have diverged and the aria-disabled is missing.',
      'Reach "Load more…" with Tab, not with the arrows. It carries focusgroup="none", so the arrows never stop there and it keeps its own tab stop — an item the arrows skip AND Tab cannot reach would be operable by nobody.',
      'Switch the group to role="menu" in card 14 and repeat: a menu keeps its unavailable options reachable by arrow, on the APG\'s argument that the set of options is itself information. Confirm the reader still says "dimmed" when you land on one.',
    ],
  },
  {
    id: 'browse',
    what: 'Browse / virtual cursor — the one keyboard testing cannot cover',
    steps: [
      'In NVDA or JAWS, leave forms mode (NVDA: Insert+Space toggles). The virtual cursor now owns the arrow keys.',
      'Arrow through this card. The directive never sees those keys — the reader reads the document instead. Nothing should break, and nothing should be skipped.',
      'Press Enter on a control to enter forms mode again, then confirm the arrows navigate the group as above.',
    ],
  },
]

const done = ref<string[]>([])
function toggle(id: string) {
  done.value = done.value.includes(id) ? done.value.filter((d) => d !== id) : [...done.value, id]
}

const cities = ['Amsterdam', 'Berlin', 'Copenhagen', 'Dublin', 'Edinburgh', 'Florence']
const selected = ref('Berlin')
</script>

<template>
  <p class="pg-muted">
    <strong>Keyboard testing alone cannot validate this package.</strong> In NVDA/JAWS browse mode
    the arrow keys are taken by the virtual cursor and never reach the handler at all, so a green
    keyboard run says nothing about the screen-reader experience. This card is the manual pass —
    the four widgets below plus what to listen for at each step. Until somebody runs it, the
    behaviour is <em>unproven</em>, not passing. The <em>skipping</em> walkthrough is the sharpest
    of the four: a skipped item is invisible to the arrows and still in the accessibility tree, so
    it is the one place where a sighted keyboard user and a browse-mode user can end up navigating
    two different lists.
  </p>

  <div class="pg-row" style="align-items: flex-start; gap: 1.5rem; margin-bottom: 0.8rem">
    <div>
      <h5 class="head">toolbar</h5>
      <div class="strip" role="toolbar" aria-label="Formatting" v-keyboard-navigation>
        <button class="cell">Bold</button>
        <button class="cell">Italic</button>
        <button class="cell">Underline</button>
      </div>
    </div>

    <div>
      <h5 class="head">listbox — roving</h5>
      <ul class="box" role="listbox" aria-label="Cities" v-keyboard-navigation>
        <li v-for="(city, i) in cities" :key="city" role="option" class="opt"
          :aria-selected="selected === city" :aria-setsize="cities.length" :aria-posinset="i + 1"
          @click="selected = city">
          {{ city }}
        </li>
      </ul>
    </div>

    <div>
      <h5 class="head">skipping</h5>
      <div class="strip vertical" role="toolbar" aria-label="Skipping" v-keyboard-navigation>
        <button class="cell">New</button>
        <button class="cell">Open…</button>
        <button class="cell" aria-disabled="true">Paste</button>
        <button class="cell">Rename</button>
        <button class="cell" focusgroup="none">Load more…</button>
      </div>
    </div>

    <div>
      <h5 class="head">listbox — activedescendant</h5>
      <ul class="box" role="listbox" aria-label="Cities, pointed"
        v-keyboard-navigation="{ activedescendant: true }">
        <li v-for="(city, i) in cities" :key="city" :id="`sr-${city}`" role="option" class="opt"
          :aria-setsize="cities.length" :aria-posinset="i + 1">
          {{ city }}
        </li>
      </ul>
    </div>
  </div>

  <div v-for="check in checks" :key="check.id" class="check">
    <label class="pg-label">
      <input type="checkbox" :checked="done.includes(check.id)" @change="toggle(check.id)" />
      <strong>{{ check.what }}</strong>
    </label>
    <ol>
      <li v-for="(step, i) in check.steps" :key="i">{{ step }}</li>
    </ol>
  </div>

  <p class="pg-muted">
    <strong><code>hover: true</code> (cards 16 and 17) is meaningless here, and that is the
    point.</strong> A browse-mode user has no cursor, so hover can only ever be an <em>additional</em>
    input on top of a keyboard path that is already complete. Everything hover can activate, the
    arrows already reach; hovering an item the arrows skip does nothing, so the two lists cannot
    disagree; and hover writes no ARIA of its own — it moves the same
    <code>aria-activedescendant</code> a key would have moved. If a walkthrough below ever needs
    the mouse to pass, the feature has been built wrong.
  </p>

  <p class="pg-muted">
    Note what the directive is <em>not</em> responsible for in any of these: the group's role and
    accessible name, <code>aria-setsize</code>/<code>aria-posinset</code>, and
    <code>aria-selected</code> are all written by this card. If a reader announces "list box" with
    no options, that is missing markup — the directive will never invent it, because a
    <code>role="listbox"</code> without <code>aria-selected</code> on every option is worse than
    plain markup.
  </p>
</template>

<style scoped>
.head {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.strip {
  display: flex;
  gap: 0.3rem;
  padding: 0.3rem;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
}
.strip.vertical {
  flex-direction: column;
  align-items: stretch;
}
.cell[data-keyboard-navigation-item='skipped'] {
  color: #9ca3af;
}
.cell[focusgroup='none'] {
  border-style: dashed;
  color: #b45309;
}
.cell {
  border: 1px solid #e3e7f0;
  border-radius: 7px;
  background: #fbfcfe;
  padding: 0.3rem 0.6rem;
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
.box {
  width: 180px;
  height: 130px;
  overflow-y: auto;
  margin: 0;
  padding: 0.2rem;
  list-style: none;
  border: 1px solid #dfe3ec;
  border-radius: 10px;
}
.opt {
  padding: 0.3rem 0.5rem;
  border-radius: 6px;
  font-size: 0.82rem;
  cursor: pointer;
}
.opt[data-keyboard-navigation-item='active'] {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.opt[aria-selected='true']::after {
  content: ' ✓';
  color: #4f46e5;
}
.cell[data-keyboard-navigation-item='active'] {
  border-color: #c7d2fe;
  background: #eef2ff;
}
.check {
  margin: 0.5rem 0;
  padding: 0.5rem 0.7rem;
  border-left: 3px solid #e3e7f0;
  background: #fbfcfe;
}
.check ol {
  margin: 0.3rem 0 0;
  padding-left: 1.2rem;
  font-size: 0.83rem;
  color: #4b5563;
}
.check li {
  margin: 0.15rem 0;
}
</style>
