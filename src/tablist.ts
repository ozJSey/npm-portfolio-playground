/**
 * Keyboard behaviour for a `role="tablist"`, per the WAI-ARIA APG.
 *
 * `role="tablist"` is a promise about the keyboard, not a way to draw a row of
 * buttons: the strip is **one** tab stop, and once you are in it the arrow keys
 * move between tabs. This app made the first half of that claim on two strips
 * and kept neither — every tab was independently tabbable and no arrow key did
 * anything, so a keyboard user tabbed through eleven controls to reach the
 * content and a screen-reader user was told to press arrows that were dead.
 *
 * That is a worse defect here than it would be in most apps. The portfolio this
 * page exists to demonstrate ships `@ozjsey/v-keyboard-navigation`, whose whole
 * subject is roving tabindex and arrow-key movement.
 *
 * Deliberately *not* that directive. `src/libraries.ts` loads every package
 * through its own `import()` and a failure is scoped to that package's tab;
 * binding the app shell's own navigation to one of them would put the chrome —
 * including the error card that explains the failure — inside the blast radius.
 * A dozen lines of `switch` is the right amount of code for the app to own.
 *
 * Both strips here are horizontal, so there is no `orientation` option: the
 * second caller is the time to add one. `scripts/tabs.mjs` drives the result
 * with real key events, and its negative control strips the mechanism back out
 * to prove those checks can fail.
 */

export interface TablistMove {
  /** How many tabs the strip has. At least one — a strip renders per tab. */
  count: number
  /** Index of the currently selected tab. */
  index: number
}

/**
 * The index a keystroke moves to, or `null` when the key is not this widget's —
 * in which case the caller must NOT call `preventDefault`, or it eats Tab,
 * typing, and the browser's own shortcuts. Movement wraps, which is what the
 * APG specifies for a tablist.
 */
export function nextTabIndex(key: string, { count, index }: TablistMove): number | null {
  switch (key) {
    case 'ArrowLeft':
      return (index - 1 + count) % count
    case 'ArrowRight':
      return (index + 1) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
