export const GROUP_COLORS = ['#60876c', '#b4944c', '#7089ad', '#9a7da3']
// Same hues with readable text contrast on light and dark surfaces.
const LIGHT_INK = ['#355d42', '#725612', '#435e83', '#6e4c78']
const DARK_INK = ['#acd2b7', '#e0c47c', '#afc8e8', '#d5b9df']

export function groupStyle(id) {
  const index = id % GROUP_COLORS.length
  return {
    '--group-color': GROUP_COLORS[index],
    '--group-ink-light': LIGHT_INK[index],
    '--group-ink-dark': DARK_INK[index],
  }
}
