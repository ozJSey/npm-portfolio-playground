<script setup lang="ts">
import { computed, ref } from 'vue'

const picked = ref<string[]>([])
const inner = ref(0)
const roleChip = ref(0)
const plainChip = ref(0)
const accept = ref('image/*')
const multiple = ref(true)
const clickToPick = ref(true)
const guardPlainChip = ref(true)

function onPicked(files: File[]) {
  picked.value = files.map((f) => f.name)
}

// `clickToPick` defaults to ON — `v-dropzone="onPicked"` is already clickable.
// It is passed here only so the checkbox can withdraw it in front of you.
// Everything else on this card is about what that default has to survive:
// real controls inside the zone, a custom clickable the built-in list cannot
// see, and a text selection that ends on a click.
//
// `clickIgnore` is read from the live options on every click, so toggling it
// takes effect without re-binding the zone.
const options = computed(() => ({
  clickToPick: clickToPick.value,
  clickIgnore: guardPlainChip.value ? '.chip-plain' : undefined,
  accept: accept.value || undefined,
  multiple: multiple.value,
  on: onPicked,
}))
</script>

<template>
  <div class="pg-row" style="margin-bottom: 0.6rem">
    <label class="pg-label">
      accept
      <select v-model="accept" class="pg-select">
        <option value="image/*">image/*</option>
        <option value=".pdf,.docx">.pdf,.docx</option>
        <option value="">anything</option>
      </select>
    </label>
    <label class="pg-label"><input v-model="multiple" type="checkbox" /> multiple</label>
    <label class="pg-label"><input v-model="clickToPick" type="checkbox" /> clickToPick</label>
    <label class="pg-label">
      <input v-model="guardPlainChip" type="checkbox" /> clickIgnore: '.chip-plain'
    </label>
  </div>

  <div class="dz" v-dropzone="options">
    <strong>Click anywhere here to browse</strong>
    <span class="pg-muted">…or drop images in, or press <kbd>Tab</kbd> then <kbd>Enter</kbd></span>

    <p class="prose">
      Select this text and let go — no dialog. A mouse-up that ends a selection inside the zone is
      followed by a real <code>click</code> event, so without a guard every reader who highlights a
      line of instructions gets an OS file picker instead.
    </p>

    <div class="row">
      <button class="pg-btn" @click="inner++">
        a real button — clicked {{ inner }}× (no picker)
      </button>
      <a class="pg-btn" href="#" @click.prevent="inner++">a link</a>
      <label class="pg-label"><input type="checkbox" /> a checkbox</label>
      <span
        class="chip chip-role"
        role="button"
        tabindex="0"
        @click="roleChip++"
        @keydown.enter="roleChip++"
        @keydown.space.prevent="roleChip++"
      >
        role="button" chip — {{ roleChip }}× (built in)
      </span>
      <span class="chip chip-plain" @click="plainChip++">
        a bare span — {{ plainChip }}× (needs clickIgnore)
      </span>
    </div>
  </div>

  <p v-if="picked.length" class="pg-kv" style="margin-top: 0.6rem">picked: {{ picked.join(', ') }}</p>

  <p class="pg-muted">
    <strong>Click-to-pick is on by default.</strong> A bare <code>v-dropzone="onPicked"</code>
    already opens the picker on click, so this card is not about switching it on — it is about
    everything the default has to survive once every zone on the page is a click target.
  </p>

  <p class="pg-muted">
    <strong>Descendants that are already interactive keep their own semantics.</strong> The built-in
    list is <code>button</code>, <code>a</code>, <code>input</code>, <code>select</code>,
    <code>textarea</code>, <code>label</code>, <code>[contenteditable]</code>,
    <code>[tabindex]</code> other than <code>-1</code>, <code>[role="button"]</code>,
    <code>summary</code> and <code>audio</code>/<code>video[controls]</code>. It is matched with
    <code>closest()</code>, so an icon nested inside one of them is covered too. The
    <code>&lt;span role="button" tabindex="0"&gt;</code> chip above needs no configuration at all:
    anything the author made a tab stop is, by definition, something the user is meant to activate.
  </p>

  <p class="pg-muted">
    <strong><code>clickIgnore</code> is for the clickables that list cannot see.</strong> The bare
    <code>&lt;span&gt;</code> beside it carries no role and no tabindex — nothing in the DOM says
    &ldquo;activate me&rdquo; — so the zone would shadow it. Untick the box above and click it: the
    picker takes it over. The selector is merged into the built-in one and re-read on every click,
    which is why the toggle works without the zone being re-bound. Matching the <em>host</em> has no
    effect; that is what <code>clickToPick: false</code> is for.
  </p>

  <p class="pg-muted">
    <strong>A selection that ends in the zone is not a click to pick.</strong> Drag across the
    paragraph inside the box and release — the host still receives a <code>click</code>, but the
    directive bails while the selection is non-collapsed and either end of it is inside the host. A
    double-click is suppressed for the same reason: its second <code>click</code>
    (<code>detail === 2</code>) would otherwise stack a second dialog on the first. Neither guard can
    be unit-tested — jsdom's <code>Selection</code> is inert and reports every selection as
    collapsed — so both are browser-verified only.
  </p>

  <p class="pg-muted">
    <strong>The keyboard route is the same control, not a parallel one.</strong> Press
    <kbd>Tab</kbd> until this zone shows its focus ring, then <kbd>Enter</kbd>. What you are focused
    on is the <code>&lt;input type="file"&gt;</code> the directive owns: it is clipped to 1px rather
    than <code>display: none</code>, and that is exactly what keeps it in the tab order and in the
    accessibility tree, opening the native dialog on <kbd>Enter</kbd>/<kbd>Space</kbd> with no key
    handling of our own. It is announced as &ldquo;Choose files&rdquo; (&ldquo;Choose file&rdquo;
    under <code>multiple: false</code>) unless you name it with <code>pickerLabel</code>. Because
    that input is invisible, the ring has to be painted by the <em>host</em> — see this card's
    stylesheet. The directive never paints.
  </p>

  <p class="pg-muted">
    <strong>Opting out takes the tab stop with it.</strong> Untick <code>clickToPick</code>: the
    host listener is removed, and the input leaves both the tab order and the accessibility tree, so
    Tab no longer lands on a control for an affordance you just withdrew. The input itself survives
    for <code>api.open()</code> (demo 7), and <code>accept</code> / <code>multiple</code> stay
    mirrored onto it either way — flip a control above, re-open the picker, and the native dialog's
    filter has followed. Picking the same file twice in a row works: the value is reset on every
    open. Demo 13 puts the two states side by side, and demo 12 is the real-world case for
    switching it off.
  </p>

  <p class="pg-muted">
    <strong>Clicking the zone focuses the picker input, without scrolling.</strong> A click on a
    real <code>&lt;button&gt;</code> leaves focus on it; this zone does the same, which is what
    lights the ring above for a mouse user and what gives <code>pasteOn: 'host'</code> (demo 4) a
    focus target instead of the collapsed text selection a click happens to leave behind. The
    input sits at the host's top-left — the directive sets <code>position: relative</code> on a
    host that has none, so those absolute offsets resolve against <em>this zone</em> rather than
    against the page, and focusing it never scrolls you somewhere else.
  </p>
</template>

<style scoped>
.dz {
  border: 2px dashed #b9c1d4;
  border-radius: 10px;
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  /* The zone is a button in all but name now, so it has to look like one. */
  cursor: pointer;
}
.dz[data-dropzone='active'] {
  border-color: #4f46e5;
  background: #eef2ff;
}

/* The picker input is clipped to 1px, so the HOST has to render its focus or
   Tab lands somewhere invisible. Pure CSS — the directive paints nothing.

   `:focus-within` is the broad fallback and it is all a plain zone needs. This
   one has real controls inside, so on its own it would also light the whole box
   up for the button, the link, the checkbox and the chip. Where `:has()` is
   available we narrow it to the picker's own keyboard focus. */
.dz:focus-within {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
@supports selector(:has(*)) {
  .dz:focus-within {
    outline: none;
  }
  .dz:has(> input[type='file']:focus-visible) {
    outline: 2px solid #4f46e5;
    outline-offset: 2px;
  }
}

.prose {
  margin: 0.2rem 0;
  max-width: 34rem;
  text-align: center;
  font-size: 0.83rem;
  color: #40485c;
  /* Selectable prose inside a click target: the cursor should promise text,
     not a dialog. The guard is in the directive; this is only honest styling. */
  cursor: text;
  user-select: text;
}

.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 0.3rem;
  cursor: default;
}
.chip {
  border-radius: 999px;
  padding: 0.18rem 0.6rem;
  font-size: 0.75rem;
  font-family: var(--mono);
  border: 1px solid #b9c1d4;
  background: #fff;
  cursor: pointer;
}
.chip-role:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
}
.chip-plain {
  border-style: dashed;
}
</style>
