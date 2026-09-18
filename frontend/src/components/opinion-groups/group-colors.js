export const GROUP_COLORS = ['#60876c', '#b4944c', '#7089ad', '#9a7da3', '#ba7860', '#539894', '#aa6e8b']
// Same hues with readable text contrast on light and dark surfaces.
const LIGHT_INK = ['#355d42', '#725612', '#435e83', '#6e4c78', '#82442f', '#236763', '#814361']
const DARK_INK = ['#acd2b7', '#e0c47c', '#afc8e8', '#d5b9df', '#e6b099', '#8fd2cc', '#e5aac5']

export function groupStyle(id) {
  const index = id % GROUP_COLORS.length
  return {
    '--group-color': GROUP_COLORS[index],
    '--group-ink-light': LIGHT_INK[index],
    '--group-ink-dark': DARK_INK[index],
  }
}
