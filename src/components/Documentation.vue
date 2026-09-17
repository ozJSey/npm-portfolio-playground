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
 */
import { computed } from 'vue'
import type { Library } from '../registry'
import { readmeFor, readmePathsTried } from '../docs'
import { renderMarkdown } from '../markdown'

const props = defineProps<{ library: Library }>()

const readme = computed(() => readmeFor(props.library.id))
const html = computed(() => (readme.value === null ? '' : renderMarkdown(readme.value.text)))
/** Only read when `readme` is null: the two places that were looked in. */
const tried = computed(() => readmePathsTried(props.library.id))
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
      <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes every
           byte of the source and emits only the tags it generates itself. -->
      <article class="md" v-html="html" />
    </template>
  </div>
</template>
