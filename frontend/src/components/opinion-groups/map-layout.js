export const mapPosition = (value) => 35 + value * 530

// Display-only separation of coincident dots. Never feed these offsets into analysis.
export function layoutOpinionDots(points, separate = false) {
  const buckets = new Map()
  for (const point of points) {
    const key = `${Math.round(mapPosition(point.x))}:${Math.round(mapPosition(point.y))}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(point)
  }
  const positions = new Map()
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    const spacing = Math.min(10, 68 / Math.sqrt(Math.max(1, bucket.length - 1)))
    const offsets = bucket.map((_, i) => {
      const angle = i * Math.PI * (3 - Math.sqrt(5))
      const radius = separate ? spacing * Math.sqrt(i) : 0
      return [Math.cos(angle) * radius, Math.sin(angle) * radius]
    })
    const mean = [0, 1].map((axis) => offsets.reduce((sum, point) => sum + point[axis], 0) / offsets.length)
    bucket.forEach((point, i) => positions.set(point.key, {
      ...point, plotX: mapPosition(point.x) + offsets[i][0] - mean[0],
      plotY: mapPosition(point.y) + offsets[i][1] - mean[1],
      overlapping: bucket.length,
    }))
  }
  return points.map((point) => positions.get(point.key))
}

// Render an aggregate grid as a small texture; SVG scales it smoothly without
// adding thousands of DOM cells. The same density scale is used for every group.
export function densityImage(density, color, peak) {
  if (!density || !peak) return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = density.resolution
  const context = canvas.getContext('2d')
  const pixels = context.createImageData(density.resolution, density.resolution)
  const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16))
  density.values.forEach((value, index) => {
    pixels.data.set([...rgb, Math.round(140 * value / peak)], index * 4)
  })
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL()
}

export function wrapThemeTitle(title, width = 23) {
  const lines = []
  let line = '', used = 0
  for (const word of title.trim().split(/\s+/)) {
    const size = [...word].reduce((n, c) => n + (c.charCodeAt(0) >= 0x2e80 ? 2 : 1), 0)
    if (line && used + 1 + size > width) { lines.push(line); line = ''; used = 0 }
    for (const character of (line ? ' ' : '') + word) {
      const amount = character.charCodeAt(0) >= 0x2e80 ? 2 : 1
      if (used + amount > width) { lines.push(line); line = ''; used = 0 }
      line += character; used += amount
    }
  }
  if (line) lines.push(line)
  return lines.length > 3 ? [...lines.slice(0, 2), lines[2].slice(0, -1) + '…'] : lines
}

// Move text only, never participants. Prefer the centre, avoiding other labels
// and the viewer marker; a leader line preserves the link when text is displaced.
export const MAX_VISIBLE_THEMES = 7

export function layoutThemeLabels(groups, points, fallback, compact = false, selectedGroup = null) {
  // Imported or future snapshots may exceed the supported simultaneous labels.
  // Preserve all data; show only the selected topic instead of crowding the map.
  if (groups.length > MAX_VISIBLE_THEMES) groups = groups.filter(group => group.id === selectedGroup)
  const placed = []
  for (const group of groups) {
    const lines = wrapThemeTitle(group.theme?.title || fallback, compact ? 18 : 23)
    const lineHeight = compact ? 25 : 19
    const halfWidth = compact ? 120 : 103
    const height = (compact ? 30 : 24) + lines.length * lineHeight
    const anchorX = mapPosition(group.position.x), anchorY = mapPosition(group.position.y)
    const offsets = [[0,0],[0,-65],[0,65],[-90,0],[90,0],[-75,-70],[75,-70],[-75,70],[75,70],[-160,-150],[160,-150],[-160,150],[160,150],[0,-190],[0,190],[-165,-200],[165,-200],[-165,200],[165,200]]
    const candidates = offsets.map(([dx,dy]) => {
      const x = Math.max(halfWidth+5, Math.min(595-halfWidth, anchorX + dx))
      const y = Math.max(height/2+15, Math.min(575-height/2, anchorY + dy))
      const collisions = placed.filter(other => Math.abs(other.x-x)<halfWidth+other.halfWidth+6 && Math.abs(other.y-y)<(other.height+height)/2+10).length
      const covered = points.filter(p => Math.abs(mapPosition(p.x)-x)<halfWidth && Math.abs(mapPosition(p.y)-y)<height/2+8)
      const cost = Math.hypot(x-anchorX,y-anchorY) + collisions*10000 + covered.reduce((n,p)=>n+(p.isYou?2000:80),0)
      return {x,y,cost}
    }).sort((a,b)=>a.cost-b.cost)
    placed.push({...candidates[0], anchorX, anchorY, height, halfWidth, lineHeight, lines, group})
  }
  const overlaps = placed.some((a, i) => placed.slice(i + 1).some(b =>
    Math.abs(a.x-b.x) < a.halfWidth+b.halfWidth+6 && Math.abs(a.y-b.y) < (a.height+b.height)/2+10))
  if (!overlaps) return placed

  // Dense maps can exhaust local label positions. Use spaced label slots only
  // when needed; leader lines preserve the link and participant dots never move.
  const rows = Math.ceil(placed.length / 2)
  const slots = Array.from({length: rows * 2}, (_, index) => ({
    x: index % 2 ? 450 : 150, y: 15 + (Math.floor(index / 2) + .5) * 560 / rows,
  }))
  return placed.map(label => {
    slots.sort((a,b) => Math.hypot(a.x-label.anchorX,a.y-label.anchorY) - Math.hypot(b.x-label.anchorX,b.y-label.anchorY))
    return {...label, ...slots.shift()}
  })
}
