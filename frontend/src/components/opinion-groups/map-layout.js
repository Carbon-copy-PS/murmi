export const mapPosition = (value) => 35 + value * 530

// Display-only separation of coincident dots. Never feed these offsets into analysis.
export function layoutOpinionDots(points, separate = true) {
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

export function groupCloud(group) {
  const {xx = 0, yy = 0, xy = 0} = group.spread || {}
  const root = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2))
  // The small base glow keeps early/single-position groups visible. It is not a confidence interval.
  return {
    x: mapPosition(group.position.x), y: mapPosition(group.position.y),
    rx: Math.min(230, 48 + 1.8 * Math.sqrt(Math.max(0, (xx + yy + root) / 2)) * 530),
    ry: Math.min(230, 48 + 1.8 * Math.sqrt(Math.max(0, (xx + yy - root) / 2)) * 530),
    rotation: 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI,
  }
}
