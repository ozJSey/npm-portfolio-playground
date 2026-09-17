<script setup lang="ts">
/**
 * The Documentation half of a tab: the package's own `README.md`, rendered.
 *
 * Nothing is authored here. If the docs are wrong, the README is wrong, and
 * fixing the README fixes both the npm page and this view — which is the whole
 * point of `tickets/DOCS-1`.
 *
 * The source line under the heading says *which* copy of the README this is
 * (working tree or installed package) because DOCS-6 was ten tabs insisting a
 * README did not exist while every one of them had 20 KB of it on npm. The
 * reader could not tell a package with no docs from a build that looked in the
 * wrong place, and neither could we.
 *
 * ## The links that point back here
 *
 * `_STANDARDS.md` #4 makes a link to the live playground mandatory near the top
 * of every README, so every README rendered on this page opens by linking to
 * this page — *"See in action: npm portfolio playground"*, read on the npm
 * portfolio playground. `src/markdown.ts` renders those as in-page navigation
 * rather than as a new browser tab, and the note below says so in one line.
 *
 * That note is the honest answer to the prose being redundant. Rewriting *"See
 * in action"* is not available: the README is the single source and it is
 * correct for npm, which is the other half of its audience. What this view can
 * do is tell the reader what those links will do before they click one, and
 * then do it.
 */
import { computed, ref } from 'vue'
import type { Library } from '../registry'
import { readmeFor, readmePathsTried } from '../docs'
import { renderMarkdown } from '../markdown'

const props = defineProps<{ library: Library }>()

const readme = computed(() => readmeFor(props.library.id))
const html = computed(() => (readme.value === null ? '' : renderMarkdown(readme.value.text)))
/** Only read when `readme` is null: the two places that were looked in. */
const tried = computed(() => readmePathsTried(props.library.id))

/**
 * How many links in this README address this same page — counted off the
 * rendered HTML rather than re-deriving the rule, so the number cannot claim
 * something the markup does not do.
 */
const inAppLinkCount = computed(() => (html.value.match(/ data-in-app="/g) ?? []).length)

const article = ref<HTMLElement | null>(null)

/**
 * A `#section` link inside the README, followed without spending the hash.
 *
 * The hash is the router's (`#<library>/<card>`), so letting a table-of-contents
 * link write `#the-empty-host` into it would scroll correctly once and then lose
 * which tab and which view the reader is in — a reload, or a shared URL, lands
 * on the default tab. Scrolling directly costs one `preventDefault` and keeps
 * the address bar describing where the reader actually is.
 *
 * The lookup is scoped to the article, not `getElementById`, because these ids
 * are GitHub's heading slugs — the same strings npm resolves, deliberately —
 * and nothing guarantees a README heading will never slug to an id the app
 * shell already uses.
 */
function onArticleClick(event: MouseEvent) {
  // Let the browser have the click it is expecting: a modifier or a middle
  // click means "open this somewhere else", and this one is a real link.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

  const target = event.target
  if (!(target instanceof Element)) return
  const slug = target.closest('a[data-md-anchor]')?.getAttribute('data-md-anchor')
  if (!slug) return

  const heading = article.value?.querySelector(`[id="${CSS.escape(slug)}"]`)
  if (!heading) return

  event.preventDefault()
  heading.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
</script>

<template>
  <div class="docs">
    <p v-if="readme === null" class="demo__banner demo__banner--warn">
      No <code>README.md</code> for <code>{{ library.pkg }}</code> in either place this build looks:
      <code>{{ tried[0] }}</code> (the sibling working tree) or
      <code>{{ tried[1] }}</code> (the published tarball). Every published
      package owes a README — see <code>tickets/_STANDARDS.md</code>.
    </p>

    <template v-else>
      <p class="docs__source">
        Rendered from <code>{{ readme.path }}</code> —
        <template v-if="readme.local">the working copy, which is what the next
          <code>{{ library.pkg }}</code> release will ship.</template>
        <template v-else>the README published on <code>{{ library.pkg }}</code>, byte for byte the
          page npm shows.</template>
        Edit that file, not this view.
      </p>
      <p v-if="inAppLinkCount" class="docs__source docs__source--links">
        It is written for npm, so it links to this playground
        <strong>{{ inAppLinkCount }}</strong> time{{ inAppLinkCount === 1 ? '' : 's' }} — and you are
        already on it. Those <span class="docs__inapp-swatch">links</span> switch this page to the
        tab or card they name rather than opening a second copy of it, so “see it in action” below
        means <em>here</em>. Every other link still opens in a new tab.
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes every
           byte of the source and emits only the tags it generates itself. -->
      <article ref="article" class="md" v-html="html" @click="onArticleClick" />
    </template>
  </div>
</template>
