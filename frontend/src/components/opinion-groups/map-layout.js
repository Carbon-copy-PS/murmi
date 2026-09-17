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
