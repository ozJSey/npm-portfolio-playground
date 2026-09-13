/**
 * Local edits survive a reload so an ad-hoc experiment isn't lost to a stray
 * refresh. Everything lives under one prefix and is dropped by "Reset".
 */
const PREFIX = 'playground:edit:'

export function loadEdit(demoId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + demoId)
  } catch {
    return null
  }
}

export function saveEdit(demoId: string, source: string): void {
  try {
    localStorage.setItem(PREFIX + demoId, source)
  } catch {
    /* private mode / quota — edits simply don't persist */
  }
}

export function clearEdit(demoId: string): void {
  try {
    localStorage.removeItem(PREFIX + demoId)
  } catch {
    /* noop */
  }
}

export function clearAllEdits(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    /* noop */
  }
}

export function editedDemoIds(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length))
  } catch {
    return []
  }
}
