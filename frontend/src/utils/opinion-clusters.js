const VOTE_VALUE = { agree: 1, disagree: -1 }

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function matVec(M, v) {
  const out = new Array(M.length).fill(0)
  for (let i = 0; i < M.length; i++) out[i] = dot(M[i], v)
  return out
}

function normalize(v) {
  const n = Math.sqrt(dot(v, v)) || 1
  return v.map((x) => x / n)
}

function topEigenvector(C, iters = 120) {
  const d = C.length
  let v = normalize(Array.from({ length: d }, (_, i) => Math.sin(i + 1) + 0.5))
  for (let it = 0; it < iters; it++) v = normalize(matVec(C, v))
  const lambda = dot(v, matVec(C, v))
  return { vector: v, value: lambda }
}

function deflate(C, vec, value) {
  const d = C.length
  return C.map((row, i) => row.map((val, j) => val - value * vec[i] * vec[j]))
}

function pca2d(centered, dim) {
  const n = centered.length
  const C = Array.from({ length: dim }, () => new Array(dim).fill(0))
  for (let r = 0; r < n; r++) {
    const row = centered[r]
    for (let i = 0; i < dim; i++) {
      const ri = row[i]
      if (ri === 0) continue
      for (let j = i; j < dim; j++) {
        const v = ri * row[j]
        C[i][j] += v
        if (i !== j) C[j][i] += v
      }
    }
  }
  const e1 = topEigenvector(C)
  const C2 = deflate(C, e1.vector, e1.value)
  const e2 = topEigenvector(C2)
  return centered.map((row) => [dot(row, e1.vector), dot(row, e2.vector)])
}

function kmeans(points, k, restarts = 6, iters = 60) {
  const n = points.length
  let best = null
  for (let r = 0; r < restarts; r++) {
    const centers = kmeansppInit(points, k, r)
    let assign = new Array(n).fill(0)
    for (let it = 0; it < iters; it++) {
      let moved = false
      for (let i = 0; i < n; i++) {
        let bestC = 0
        let bestD = Infinity
        for (let c = 0; c < k; c++) {
          const d = sqDist(points[i], centers[c])
          if (d < bestD) { bestD = d; bestC = c }
        }
        if (assign[i] !== bestC) { assign[i] = bestC; moved = true }
      }
      for (let c = 0; c < k; c++) {
        const members = points.filter((_, i) => assign[i] === c)
        if (members.length) {
          centers[c] = [
            members.reduce((s, p) => s + p[0], 0) / members.length,
            members.reduce((s, p) => s + p[1], 0) / members.length,
          ]
        }
      }
      if (!moved) break
    }
    const inertia = points.reduce((s, p, i) => s + sqDist(p, centers[assign[i]]), 0)
    if (!best || inertia < best.inertia) best = { assign, centers, inertia }
  }
  return best
}

function kmeansppInit(points, k, seed) {
  const rand = mulberry32(seed + 1)
  const centers = [points[Math.floor(rand() * points.length)]]
  while (centers.length < k) {
    const dists = points.map((p) => Math.min(...centers.map((c) => sqDist(p, c))))
    const total = dists.reduce((a, b) => a + b, 0) || 1
    let t = rand() * total
    let idx = 0
    for (let i = 0; i < dists.length; i++) { t -= dists[i]; if (t <= 0) { idx = i; break } }
    centers.push(points[idx])
  }
  return centers.map((c) => [...c])
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sqDist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

function silhouette(points, assign, k) {
  const n = points.length
  if (k < 2 || n <= k) return -1
  let total = 0
  for (let i = 0; i < n; i++) {
    const own = assign[i]
    const groups = Array.from({ length: k }, () => [])
    for (let j = 0; j < n; j++) if (j !== i) groups[assign[j]].push(j)
    if (!groups[own].length) continue
    const a = groups[own].reduce((s, j) => s + Math.sqrt(sqDist(points[i], points[j])), 0) / groups[own].length
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c === own || !groups[c].length) continue
      const d = groups[c].reduce((s, j) => s + Math.sqrt(sqDist(points[i], points[j])), 0) / groups[c].length
      if (d < b) b = d
    }
    if (b === Infinity) continue
    total += (b - a) / Math.max(a, b)
  }
  return total / n
}

function scaleCoords(coords) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of coords) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const span = Math.max(spanX, spanY)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return coords.map(([x, y]) => [((x - cx) / span) * 1.7, ((y - cy) / span) * 1.7])
}

function statementStats(statements, voters) {
  return statements.map((s) => {
    let agree = 0
    let disagree = 0
    for (const v of voters) {
      const val = v.votes[s.id]
      if (val === 'agree') agree++
      else if (val === 'disagree') disagree++
    }
    const total = agree + disagree
    const agreeRate = total ? agree / total : 0
    const split = total ? 1 - Math.abs(agreeRate - 0.5) * 2 : 0
    return { id: s.id, text: s.text, custom: s.custom, agree, disagree, total, agreeRate, split }
  })
}

export function computeOpinionClusters({ statements = [], voters = [] }) {
  const stats = statementStats(statements, voters)
  const consensus = [...stats]
    .filter((s) => s.total >= 2)
    .sort((a, b) => Math.abs(b.agreeRate - 0.5) - Math.abs(a.agreeRate - 0.5))
    .slice(0, 4)
  const divisive = [...stats]
    .filter((s) => s.total >= 2)
    .sort((a, b) => b.split - a.split)
    .slice(0, 4)

  const dim = statements.length
  if (voters.length < 3 || dim < 2) {
    return {
      ok: false,
      reason: voters.length < 3 ? 'need-voters' : 'need-statements',
      voterCount: voters.length,
      statementCount: dim,
      stats,
      consensus,
      divisive,
    }
  }

  const sIndex = new Map(statements.map((s, i) => [s.id, i]))
  const raw = voters.map((v) => {
    const row = new Array(dim).fill(0)
    for (const [sid, val] of Object.entries(v.votes)) {
      const idx = sIndex.get(sid)
      if (idx != null) row[idx] = VOTE_VALUE[val] ?? 0
    }
    return row
  })

  const means = new Array(dim).fill(0)
  for (let j = 0; j < dim; j++) {
    let s = 0
    for (let i = 0; i < raw.length; i++) s += raw[i][j]
    means[j] = s / raw.length
  }
  const centered = raw.map((row) => row.map((val, j) => val - means[j]))

  const coords = scaleCoords(pca2d(centered, dim))

  const maxK = Math.min(4, voters.length - 1)
  let bestK = 2
  let bestScore = -Infinity
  let bestAssign = null
  for (let k = 2; k <= maxK; k++) {
    const km = kmeans(coords, k)
    const score = silhouette(coords, km.assign, k)
    if (score > bestScore) { bestScore = score; bestK = k; bestAssign = km.assign }
  }
  if (!bestAssign) {
    bestK = 1
    bestAssign = new Array(voters.length).fill(0)
  }

  const points = voters.map((v, i) => ({
    key: v.key,
    isYou: v.isYou,
    x: coords[i][0],
    y: coords[i][1],
    cluster: bestAssign[i],
  }))

  const clusters = Array.from({ length: bestK }, (_, c) => {
    const members = points.filter((p) => p.cluster === c)
    return { id: c, size: members.length }
  }).filter((cl) => cl.size > 0)

  const groups = clusters.map((cl) => {
    const members = voters.filter((_, i) => bestAssign[i] === cl.id)
    const minVotes = Math.max(1, Math.ceil(members.length * 0.5))
    const perStmt = statements.map((s) => {
      let agree = 0
      let disagree = 0
      for (const m of members) {
        const val = m.votes[s.id]
        if (val === 'agree') agree++
        else if (val === 'disagree') disagree++
      }
      const total = agree + disagree
      return { id: s.id, text: s.text, custom: s.custom, agree, disagree, total, rate: total ? agree / total : 0 }
    })
    const agree = perStmt
      .filter((p) => p.total >= minVotes && p.rate >= 0.6)
      .sort((a, b) => b.rate - a.rate || b.total - a.total)
      .slice(0, 3)
    const disagree = perStmt
      .filter((p) => p.total >= minVotes && p.rate <= 0.4)
      .sort((a, b) => a.rate - b.rate || b.total - a.total)
      .slice(0, 3)
    return { id: cl.id, size: cl.size, agree, disagree }
  })

  const youCluster = points.find((p) => p.isYou)?.cluster ?? null

  return {
    ok: true,
    k: clusters.length,
    points,
    clusters,
    groups,
    youCluster,
    voterCount: voters.length,
    statementCount: dim,
    stats,
    consensus,
    divisive,
  }
}
