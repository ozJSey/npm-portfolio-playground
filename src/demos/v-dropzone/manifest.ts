import type { LibraryManifest } from '../../registry'

const manifest: LibraryManifest = {
  id: 'v-dropzone',
  tagline:
    'The whole drag-drop pipeline in one binding: drop / paste / click-to-pick → validate → upload → state. No wrapper components, no enter/leave counter to write, no XHR plumbing.',
  status: 'v0.1.0 local — 330/330 tests, publish prep',
  notes: [
    'The playground dev server exposes three endpoints for the upload demos: POST /api/upload (200 after ~700ms), /api/upload-slow (200 after ~4s, long enough to cancel), /api/upload-fail (500 after ~400ms).',
    'Progress events need a body big enough to stream — drop a few MB to watch the bar move rather than jump.',
    'Folder drop (demo 12) is drop-only and needs a real browser: jsdom has no FileSystem Entry API, so the unit suite can only approximate it.',
    'clickToPick is ON by default: every zone on this tab opens the native file picker on click, and reaches it from the keyboard with Tab then Enter — the directive owns a clipped-but-focusable <input type="file"> inside the host. Demo 3 covers the guards, demo 13 is the opt-out side by side with the default, and demo 12 is the opt-out in its natural habitat (a folder needs webkitdirectory).',
    'The picker input is absolutely positioned at the host\'s top-left, and the directive gives the host `position: relative` when it has none so those offsets resolve against the zone. Without it they resolve against the initial containing block and Tab scrolls the page thousands of pixels away from the zone it just focused — measured, and green under smoke, until DZ-3.',
    'A click on a zone focuses its picker input (preventScroll), so :focus-within lights for mouse users and pasteOn: \'host\' has a deterministic focus target rather than relying on the collapsed text selection a click happens to leave behind.',
    'Opening the picker is input.click(), and that click used to bubble out to the host: a single real click on a zone fired the consumer\'s own @click twice (once untrusted, targeting the hidden input) and api.open() fired it with no click at all. It is stopped at the input now — the "host clicks seen" counter on demo 13 reads one per click, which is what it was always supposed to show.',
    'A zone that is a click target needs a pointer and a visible focus ring, and both are the consumer\'s CSS — the directive never paints. The picker input is 1px and clipped, so the ring goes on the HOST: .dz:focus-within, narrowed to .dz:has(> input[type="file"]:focus-visible) where a zone has other focusable children.',
  ],
  demos: [
    {
      file: '01-drop-basic.vue',
      title: 'Drop files (or click)',
      blurb:
        'The bare handler form. Four events, the dragleave-on-child bug, and preventDefault are all handled — and because clickToPick defaults to on, the same one-line binding also browses on click and on Tab + Enter.',
      tags: ['v-dropzone', 'data-dropzone', 'DropzoneHandler', 'clickToPick default'],
    },
    {
      file: '02-validation.vue',
      title: 'Validation and rejection reasons',
      blurb: 'accept / maxSize / maxCount / multiple, with cumulative reasons in canonical order.',
      tags: ['accept', 'maxSize', 'maxCount', 'onReject'],
    },
    {
      file: '03-click-to-pick.vue',
      title: 'Click-to-pick: guards, opt-out, keyboard',
      blurb:
        'Click-to-pick is ON by default, so this card is about what that has to survive: interactive descendants keep their own semantics, a text selection ending in the zone opens nothing, clickIgnore covers the custom clickables the built-in list cannot see, and Tab + Enter reaches the same picker. Untick clickToPick to watch the affordance and its tab stop leave together.',
      tags: ['clickToPick', 'clickIgnore', 'interactive descendants', 'selection guard', 'Tab + Enter'],
    },
    {
      file: '04-paste.vue',
      title: 'Paste from clipboard',
      blurb:
        'Screenshots pasted anywhere on the page flow through the same validation, rejection and upload path as a drop. Switch to pasteOn: \'host\' and the chip tells you whether the zone is focused — click it or Tab to it, both arm the paste.',
      tags: ['paste', "pasteOn: 'document'", "pasteOn: 'host'", 'focus-within', 'onReject', 'upload'],
    },
    {
      file: '05-url-upload.vue',
      title: 'URL upload with progress',
      blurb:
        'Real XHR + FormData against the dev server — per-file progress, batched, timeout, withCredentials, custom parseResponse.',
      tags: ['upload', 'onProgress', 'timeout', 'parseResponse', 'onError'],
    },
    {
      file: '06-fn-upload.vue',
      title: 'Function upload (custom transport)',
      blurb:
        'The S3-presigned shape: your async function, the directive owns state and cancellation. Cancel mid-flight to see the abort branch.',
      tags: ['UploadFn', 'AbortSignal', 'onProgress', 'cancel()'],
    },
    {
      file: '07-api.vue',
      title: 'Programmatic DropzoneApi',
      blurb:
        'open / upload / cancel / retry / dismissError in both their no-arg and per-file forms, plus the reactive file arrays.',
      tags: ['ref', 'DropzoneApi', 'cancel(file)', 'retry(file)', 'dismissError()'],
    },
    {
      file: '08-auto-upload-queue.vue',
      title: 'autoUpload: false — review before uploading',
      blurb: 'Files queue in api.pending until you flush them, one at a time or all at once.',
      tags: ['autoUpload', 'pending', 'upload(file)'],
    },
    {
      file: '09-css-progress.vue',
      title: 'CSS-only progress UI',
      blurb:
        '--dropzone-progress and --dropzone-files-pending build the bar without a JS mirror — including the failed-at-75% and rejected-touches-nothing cases. Also the best argument for clickIgnore: the bar and the counter are output living inside a click target.',
      tags: ['--dropzone-progress', '--dropzone-files-pending', 'error', 'rejected', 'clickIgnore'],
    },
    {
      file: '10-state-machine.vue',
      title: 'State lifecycle',
      blurb: 'idle → active → rejected / uploading → success / error, with the sticky-error rule.',
      tags: ['DropzoneState', 'rejectDuration', 'successDuration'],
    },
    {
      file: '11-enabled.vue',
      title: 'enabled toggle and v-for isolation',
      blurb: 'Detach every listener reactively; three zones on one page never interfere.',
      tags: ['enabled', 'WeakMap', 'v-for'],
    },
    {
      file: '12-folder-drop.vue',
      title: 'Folder drop (and the clickToPick opt-out)',
      blurb:
        'Drag a directory in: it is walked recursively and flattened, then validated per contained file. Sets clickToPick: false for the reason the option exists — a folder is drop-only, so the default would answer "drag a folder in" with a file dialog.',
      tags: ['webkitGetAsEntry', 'readEntries', 'recursive walk', 'clickToPick: false'],
    },
    {
      file: '13-click-opt-out.vue',
      title: 'clickToPick: false — click off, drop still on',
      blurb:
        'The opt-out as the subject, side by side with the default. Click the left zone and a dialog opens; click the right one and nothing happens — while both take the same drop. The counters are read out of the live DOM: the opted-out zone has no picker input, no tab stop, no pointer and no ring, until api.open() creates one that is tabindex="-1" and aria-hidden.',
      tags: ['clickToPick: false', 'api.open()', 'tabindex="-1"', 'aria-hidden', 'DropzoneApi'],
    },
  ],
}

export default manifest
