// A shared, aggregate rendering grid. Each unshifted participant contributes one
// Gaussian kernel of the same width and weight; group centroids play no role.
export function opinionDensity(points, resolution = 51, bandwidth = 0.045) {
  const values = Array(resolution * resolution).fill(0);
  for (const point of points) {
    const radius = 4 * bandwidth;
    const left = Math.max(0, Math.floor((point.x - radius) * resolution));
    const right = Math.min(resolution - 1, Math.floor((point.x + radius) * resolution));
    const top = Math.max(0, Math.floor((point.y - radius) * resolution));
    const bottom = Math.min(resolution - 1, Math.floor((point.y + radius) * resolution));
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const dx = (col + .5) / resolution - point.x;
        const dy = (row + .5) / resolution - point.y;
        values[row * resolution + col] += Math.exp(-(dx * dx + dy * dy) / (2 * bandwidth ** 2));
      }
    }
  }
  return { resolution, bandwidth, values: values.map(value => Number(value.toFixed(4))) };
}
