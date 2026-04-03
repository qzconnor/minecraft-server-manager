/**
 * Converts Minecraft §-formatted text to safe HTML.
 * All plain text is HTML-escaped before insertion.
 */

const COLORS: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  'a': '#55FF55',
  'b': '#55FFFF',
  'c': '#FF5555',
  'd': '#FF55FF',
  'e': '#FFFF55',
  'f': '#FFFFFF',
}

interface State {
  color:         string | null
  bold:          boolean
  italic:        boolean
  underline:     boolean
  strikethrough: boolean
}

function resetState(): State {
  return { color: null, bold: false, italic: false, underline: false, strikethrough: false }
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stateToStyle(s: State): string {
  const parts: string[] = []
  if (s.color) parts.push(`color:${s.color}`)
  if (s.bold)          parts.push('font-weight:bold')
  if (s.italic)        parts.push('font-style:italic')
  const deco: string[] = []
  if (s.underline)     deco.push('underline')
  if (s.strikethrough) deco.push('line-through')
  if (deco.length)     parts.push(`text-decoration:${deco.join(' ')}`)
  return parts.join(';')
}

export function parseMinecraftColors(text: string): string {
  // §x hex colors come as §x§R§R§G§G§B§B — match the whole 13-char sequence first,
  // then fall back to standard single §X codes.
  const tokens = text.split(/(§x(?:§[0-9a-f]){6}|§[0-9a-fk-or])/i)
  const state  = resetState()
  let html     = ''

  for (const token of tokens) {
    // Hex color sequence: §x§h§h§h§h§h§h
    if (/^§x(?:§[0-9a-f]){6}$/i.test(token)) {
      const digits = (token.match(/§([0-9a-f])/gi) ?? []).map(m => m[1]).join('')
      state.color         = `#${digits}`
      state.bold          = false
      state.italic        = false
      state.underline     = false
      state.strikethrough = false
      continue
    }

    if (/^§[0-9a-fk-or]$/i.test(token)) {
      const code = token[1].toLowerCase()

      if (COLORS[code] !== undefined) {
        // Color code: set color, clear formatting
        state.color         = COLORS[code]
        state.bold          = false
        state.italic        = false
        state.underline     = false
        state.strikethrough = false
      } else if (code === 'r') {
        Object.assign(state, resetState())
      } else if (code === 'l') { state.bold          = true }
      else if   (code === 'o') { state.italic        = true }
      else if   (code === 'n') { state.underline     = true }
      else if   (code === 'm') { state.strikethrough = true }
      // §k (obfuscated) — ignored
      continue
    }

    if (!token) continue

    const style = stateToStyle(state)
    const safe  = escape(token)
    html += style ? `<span style="${style}">${safe}</span>` : safe
  }

  return html
}
