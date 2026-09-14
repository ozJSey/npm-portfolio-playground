<script setup lang="ts">
/**
 * The Documentation half of a tab: the package's own `README.md`, rendered.
 *
 * Nothing is authored here. If the docs are wrong, the README is wrong, and
 * fixing the README fixes both the npm page and this view — which is the whole
 * point of `tickets/DOCS-1`.
 */
import { computed } from 'vue'
import type { Library } from '../registry'
import { readmeFor, readmePath } from '../docs'
import { renderMarkdown } from '../markdown'

const props = defineProps<{ library: Library }>()

const source = computed(() => readmeFor(props.library.id))
const html = computed(() => (source.value === null ? '' : renderMarkdown(source.value)))
</script>

<template>
  <div class="docs">
    <p v-if="source === null" class="demo__banner demo__banner--warn">
      <code>{{ readmePath(library.id) }}</code> does not exist, so there is nothing to render.
      Every published package owes a README — see <code>tickets/_STANDARDS.md</code>.
    </p>

    <template v-else>
      <p class="docs__source">
        Rendered from <code>{{ readmePath(library.id) }}</code> — the same file npm shows on
        <code>{{ library.pkg }}</code>. Edit that file, not this view.
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes every
           byte of the source and emits only the tags it generates itself. -->
      <article class="md" v-html="html" />
    </template>
  </div>
</template>
