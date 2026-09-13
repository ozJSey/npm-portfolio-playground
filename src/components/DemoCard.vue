<script setup lang="ts">
/**
 * One demo: metadata header, live stage, and an editor that recompiles the
 * SFC as you type.
 *
 * Two rules make editing pleasant:
 *   - a failed compile keeps the last good component on stage (you get a red
 *     banner, not a blank card);
 *   - a runtime throw inside a demo is caught here, so one broken demo can't
 *     take the page down.
 */
import { computed, onBeforeUnmount, onErrorCaptured, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import type { Demo } from '../registry'
import { compileSfc, createStyleHandle, releaseStyles } from '../sfc-runtime'
import { loadEdit, saveEdit, clearEdit } from '../storage'
import CodeEditor from './CodeEditor.vue'

const props = defineProps<{ demo: Demo; initialEditorOpen?: boolean }>()
const emit = defineEmits<{ dirty: [demoId: string, dirty: boolean] }>()

const source = ref(loadEdit(props.demo.id) ?? props.demo.source)
const component = shallowRef<Component | null>(null)
const compileError = ref('')
const runtimeError = ref('')
const warnings = ref<string[]>([])
const editorOpen = ref(props.initialEditorOpen ?? false)
const compiling = ref(false)
const instanceKey = ref(0)

const styleHandle = createStyleHandle()
const isDirty = computed(() => source.value !== props.demo.source)

/**
 * Every package an import inside this card can resolve to: the tab's own
 * library, plus anything the manifest declares in `uses`. Hardcoding the tab
 * alone was simply false on a cross-library card.
 */
const importPaths = computed(() => [
  props.demo.id.slice(0, props.demo.id.indexOf('/')),
  ...(props.demo.uses ?? []),
])

let debounce: ReturnType<typeof setTimeout> | undefined
let generation = 0

async function compile() {
  const mine = ++generation
  compiling.value = true
  const result = await compileSfc(source.value, props.demo.id.replace(/[^\w-]/g, '_'), styleHandle)
  if (mine !== generation) return
  compiling.value = false
  warnings.value = result.warnings

  if (!result.ok) {
    compileError.value = result.error
    return
  }
  compileError.value = ''
  runtimeError.value = ''
  component.value = result.component
  instanceKey.value++
}

watch(
  source,
  (next) => {
    emit('dirty', props.demo.id, next !== props.demo.source)
    if (next === props.demo.source) clearEdit(props.demo.id)
    else saveEdit(props.demo.id, next)

    clearTimeout(debounce)
    debounce = setTimeout(compile, 350)
  },
  { immediate: false },
)

// Hot-reload: the file changed on disk. Adopt it unless the user has local edits.
watch(
  () => props.demo.source,
  (next) => {
    if (!isDirty.value) source.value = next
  },
)

onErrorCaptured((err) => {
  runtimeError.value = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return false
})

function reset() {
  source.value = props.demo.source
  clearEdit(props.demo.id)
}

function rerun() {
  runtimeError.value = ''
  instanceKey.value++
}

async function copySource() {
  await navigator.clipboard?.writeText(source.value)
}

onBeforeUnmount(() => {
  clearTimeout(debounce)
  generation++
  releaseStyles(styleHandle)
})

compile()
</script>

<template>
  <section :id="`demo-${demo.file}`" class="demo">
    <header class="demo__head">
      <div>
        <h3 class="demo__title">{{ demo.title }}</h3>
        <p class="demo__blurb">{{ demo.blurb }}</p>
        <div class="demo__tags">
          <span v-for="tag in demo.tags" :key="tag" class="demo__tag">{{ tag }}</span>
          <span v-for="lib in demo.uses ?? []" :key="lib" class="demo__tag demo__tag--uses"
            >+ {{ lib }}</span
          >
        </div>
      </div>
      <div class="demo__actions">
        <span v-if="isDirty" class="demo__dirty" title="Local edit, saved in this browser">
          edited
        </span>
        <button class="demo__btn" title="Remount the demo" @click="rerun">Re-run</button>
        <button class="demo__btn" :disabled="!isDirty" @click="reset">Reset</button>
        <button class="demo__btn" @click="copySource">Copy</button>
        <button
          class="demo__btn"
          :class="{ 'is-on': editorOpen }"
          :aria-expanded="editorOpen"
          @click="editorOpen = !editorOpen"
        >
          {{ editorOpen ? 'Hide code' : 'Edit code' }}
        </button>
      </div>
    </header>

    <p v-if="compileError" class="demo__banner demo__banner--error">
      Compile error — showing the last working version.<br />{{ compileError }}
    </p>
    <p v-else-if="runtimeError" class="demo__banner demo__banner--error">
      Runtime error: {{ runtimeError }} — fix the code or press Re-run.
    </p>
    <p v-else-if="warnings.length" class="demo__banner demo__banner--warn">
      {{ warnings.join('\n') }}
    </p>

    <div class="demo__stage">
      <component :is="component" v-if="component && !runtimeError" :key="instanceKey" />
      <p v-else-if="!component && !compileError" class="pg-muted">Compiling…</p>
    </div>

    <div v-if="editorOpen" class="demo__editor">
      <CodeEditor v-model="source" />
      <p class="editor-hint">
        Edits recompile after ~350&nbsp;ms and are kept in this browser until you press Reset.
        Imports resolve to the library sources in
        <template v-for="(lib, i) in importPaths" :key="lib"
          ><span v-if="i">, </span><code>../{{ lib }}/</code></template
        >.
      </p>
    </div>
  </section>
</template>
