/** Geometry only. Email inputs do not expose selectionStart, so follow the last rendered character. */
export function emailEndPoint(field: HTMLInputElement, mirror: HTMLSpanElement) {
  if (field.type !== 'email') return null
  const box = field.getBoundingClientRect()
  const css = getComputedStyle(field)
  for (const property of [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-stretch',
    'font-kerning',
    'font-feature-settings',
    'font-variation-settings',
    'letter-spacing',
    'word-spacing',
    'text-transform',
  ]) {
    mirror.style.setProperty(property, css.getPropertyValue(property))
  }
  mirror.textContent = field.value
  const textBox = mirror.getBoundingClientRect()
  let characterX = 0
  if (mirror.firstChild && field.value.length) {
    const last = Array.from(field.value).at(-1) ?? ''
    const range = document.createRange()
    range.setStart(mirror.firstChild, field.value.length - last.length)
    range.setEnd(mirror.firstChild, field.value.length)
    const glyph = range.getBoundingClientRect()
    characterX = glyph.left - textBox.left + glyph.width / 2
  }
  const left = box.left + parseFloat(css.borderLeftWidth || '0') + parseFloat(css.paddingLeft || '0')
  const right = box.right - parseFloat(css.borderRightWidth || '0') - parseFloat(css.paddingRight || '0')
  const space = Math.max(0, right - left - textBox.width)
  const align = css.textAlign === 'center' ? space / 2 : ['right', 'end'].includes(css.textAlign) ? space : 0
  return {
    x: Math.max(left, Math.min(right, left + align + characterX - field.scrollLeft)),
    y: box.top + box.height / 2,
  }
}
