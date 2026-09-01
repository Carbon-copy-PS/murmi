/**
 * Dependency-free, static, Pol.is-inspired opinion-group analysis.
 *
 * The implementation follows the broad shape of the public Pol.is method:
 * ternary votes, column-mean imputation, a two-dimensional PCA projection,
 * the sqrt(C / Cp) sparse-response correction, deterministic k-means, and
 * silhouette-based selection of K. It is intentionally described as
 * "Pol.is-inspired": this is an offline implementation, not output produced by
 * the hosted Pol.is math service.
 *
 * Privacy: raw participant identifiers are used only as in-memory matrix keys.
 * Returned assignments contain deterministic, one-based analysis indexes and
 * never contain source participant IDs, names, or client IDs.
 */

export const POLIS_TERNARY_VOTE = Object.freeze({
  strongly_agree: 1,
  agree: 1,
  neutral: 0,
  pass: 0,
  disagree: -1,
  strongly_disagree: -1,
});

export const DEFAULT_POLIS_ANALYSIS_OPTIONS = Object.freeze({
  minimumVotes: 7,
  minimumK: 2,
  maximumK: 5,
  kmeansRestarts: 12,
  kmeansMaximumIterations: 100,
  pcaMaximumIterations: 240,
  bootstrapReplicates: 100,
  sensitivityThresholds: Object.freeze([7, 10, 12]),
  representativeStatementLimit: 5,
});

const EPSILON = 1e-12;
const SIGNIFICANCE_90_Z = 1.6448536269514722;
const UINT32_MAX_PLUS_ONE = 4294967296;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compareText(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareNumber(left, right) {
  return left - right;
}

function finiteNumber(value, fallback = null) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

function sum(values) {
  let result = 0;
  for (const value of values) result += value;
  return result;
}

function mean(values) {
  return values.length ? sum(values) / values.length : null;
}

function quantile(values, probability) {
  if (!values.length) return null;
  const ordered = [...values].sort(compareNumber);
  const position = clamp(probability, 0, 1) * (ordered.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  const weight = position - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

function dot(left, right) {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result += left[index] * right[index];
  }
  return result;
}

function squaredNorm(vector) {
  return dot(vector, vector);
}

function norm(vector) {
  return Math.sqrt(squaredNorm(vector));
}

function normalizeVector(vector) {
  const length = norm(vector);
  if (length <= EPSILON) return null;
  return vector.map((value) => value / length);
}

function matrixVectorMultiply(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function subtractProjection(vector, basis) {
  const result = [...vector];
  for (const component of basis) {
    const coefficient = dot(result, component);
    for (let index = 0; index < result.length; index += 1) {
      result[index] -= coefficient * component[index];
    }
  }
  return result;
}

function orientVector(vector) {
  let anchor = 0;
  for (let index = 1; index < vector.length; index += 1) {
    if (Math.abs(vector[index]) > Math.abs(vector[anchor]) + EPSILON) anchor = index;
  }
  if (vector[anchor] < 0) return vector.map((value) => -value);
  return vector;
}

function deterministicStartVector(dimension, salt, basis) {
  const candidates = [];
  candidates.push(Array.from(
    { length: dimension },
    (_, index) => Math.sin((index + 1) * (salt + 1.618033988749895))
      + Math.cos((index + 1) * (salt + 0.7071067811865476)),
  ));
  for (let index = 0; index < dimension; index += 1) {
    const unit = new Array(dimension).fill(0);
    unit[index] = 1;
    candidates.push(unit);
  }
  for (const candidate of candidates) {
    const normalized = normalizeVector(subtractProjection(candidate, basis));
    if (normalized) return normalized;
  }
  return new Array(dimension).fill(0);
}

function topEigenpair(matrix, basis, salt, maximumIterations) {
  const dimension = matrix.length;
  if (!dimension) return { vector: [], value: 0, iterations: 0 };
  let vector = deterministicStartVector(dimension, salt, basis);
  if (norm(vector) <= EPSILON) {
    return { vector: new Array(dimension).fill(0), value: 0, iterations: 0 };
  }

  let iterations = 0;
  for (; iterations < maximumIterations; iterations += 1) {
    const multiplied = matrixVectorMultiply(matrix, vector);
    const projected = subtractProjection(multiplied, basis);
    const next = normalizeVector(projected);
    if (!next) {
      return { vector: new Array(dimension).fill(0), value: 0, iterations: iterations + 1 };
    }
    const alignment = Math.abs(dot(vector, next));
    vector = next;
    if (1 - alignment <= 1e-13) {
      iterations += 1;
      break;
    }
  }

  vector = orientVector(normalizeVector(subtractProjection(vector, basis)) || vector);
  const value = Math.max(0, dot(vector, matrixVectorMultiply(matrix, vector)));
  if (value <= EPSILON) {
    return { vector: new Array(dimension).fill(0), value: 0, iterations };
  }
  return { vector, value, iterations };
}

function squaredDistance(left, right) {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    result += difference * difference;
  }
  return result;
}

function euclideanDistance(left, right) {
  return Math.sqrt(squaredDistance(left, right));
}

function initializeFuzzyCenters(points, requestedK) {
  const uniqueK = Math.min(requestedK, uniquePointCount(points));
  if (uniqueK < 2) return [];
  const centerOfMass = points[0].map((_, dimension) => (
    mean(points.map((point) => point[dimension])) ?? 0
  ));
  const chosenIndexes = [];
  while (chosenIndexes.length < uniqueK) {
    const candidate = points.map((point, index) => ({
      index,
      distance: chosenIndexes.length
        ? Math.min(...chosenIndexes.map((chosenIndex) => squaredDistance(point, points[chosenIndex])))
        : squaredDistance(point, centerOfMass),
    })).filter((entry) => !chosenIndexes.includes(entry.index)).sort((left, right) => (
      right.distance - left.distance || left.index - right.index
    ))[0];
    if (!candidate || candidate.distance <= EPSILON) break;
    chosenIndexes.push(candidate.index);
  }
  return chosenIndexes.map((index) => [...points[index]]);
}

function fuzzyMemberships(points, centers, fuzzifier) {
  const exponent = 2 / (fuzzifier - 1);
  return points.map((point) => {
    const distances = centers.map((center) => euclideanDistance(point, center));
    const exactIndex = distances.findIndex((distance) => distance <= EPSILON);
    if (exactIndex >= 0) {
      return distances.map((_, index) => (index === exactIndex ? 1 : 0));
    }
    return distances.map((distance) => (
      1 / sum(distances.map((otherDistance) => (distance / otherDistance) ** exponent))
    ));
  });
}

function fuzzyCMeans(points, requestedK, {
  fuzzifier = 2,
  maximumIterations = 300,
  tolerance = 1e-10,
} = {}) {
  assert(fuzzifier > 1, "Fuzzy c-means fuzzifier must be greater than one.");
  let centers = initializeFuzzyCenters(points, requestedK);
  if (centers.length < 2) return null;
  let memberships = [];
  let iterations = 0;
  for (; iterations < maximumIterations; iterations += 1) {
    memberships = fuzzyMemberships(points, centers, fuzzifier);
    const nextCenters = centers.map((_, tendencyIndex) => {
      const weights = memberships.map((row) => row[tendencyIndex] ** fuzzifier);
      const denominator = sum(weights);
      return centers[0].map((__, dimension) => (
        denominator > EPSILON
          ? sum(points.map((point, pointIndex) => weights[pointIndex] * point[dimension])) / denominator
          : centers[tendencyIndex][dimension]
      ));
    });
    const movement = Math.max(...nextCenters.map((center, index) => (
      euclideanDistance(center, centers[index])
    )));
    centers = nextCenters;
    if (movement <= tolerance) {
      iterations += 1;
      break;
    }
  }
  memberships = fuzzyMemberships(points, centers, fuzzifier);
  const order = centers.map((center, index) => ({ center, index })).sort((left, right) => (
    lexicographicArrayCompare(left.center, right.center)
  ));
  centers = order.map((entry) => [...entry.center]);
  memberships = memberships.map((row) => order.map((entry) => row[entry.index]));
  return {
    centers,
    memberships,
    fuzzifier,
    iterations,
  };
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixSeed(...values) {
  let result = 0x9e3779b9;
  for (const value of values) {
    const numeric = typeof value === "number" ? value >>> 0 : fnv1a(String(value));
    result ^= numeric + 0x9e3779b9 + ((result << 6) >>> 0) + (result >>> 2);
    result >>>= 0;
  }
  return result >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  };
}

function timestampValue(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeVote(value) {
  if (typeof value === "number") {
    assert(value === -1 || value === 0 || value === 1, "Numeric votes must be -1, 0, or 1.");
    return value;
  }
  const key = String(value || "").trim().toLowerCase();
  assert(Object.hasOwn(POLIS_TERNARY_VOTE, key), "Unsupported vote value: " + key);
  return POLIS_TERNARY_VOTE[key];
}

function sourceParticipantId(vote) {
  return vote.participant_id ?? vote.participantId ?? vote.voter_id ?? vote.voterId;
}

function sourceStatementId(vote) {
  return vote.statement_id ?? vote.statementId ?? vote.comment_id ?? vote.commentId;
}

function sourceVoteValue(vote) {
  return vote.vote ?? vote.value ?? vote.vote_value;
}

function normalizeSession(source) {
  assert(source && typeof source === "object", "Analysis input must be an object.");
  assert(Array.isArray(source.statements), "Analysis input is missing statements.");
  assert(Array.isArray(source.votes), "Analysis input is missing votes.");

  const sessionId = String(source.sessionId ?? source.session?.id ?? "session").trim() || "session";
  const statements = source.statements.map((statement, sourceIndex) => {
    const id = String(statement.id ?? statement.statement_id ?? statement.comment_id ?? "").trim();
    assert(id, "Statement at source index " + sourceIndex + " has no ID.");
    const text = typeof statement.text === "string"
      ? statement.text
      : typeof statement.comment === "string"
        ? statement.comment
        : "";
    return {
      id,
      text,
      sourceIndex,
      createdAt: timestampValue(statement.created_at ?? statement.createdAt),
    };
  }).sort((left, right) => {
    if (left.createdAt !== null && right.createdAt !== null && left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    if (left.createdAt !== null && right.createdAt === null) return -1;
    if (left.createdAt === null && right.createdAt !== null) return 1;
    const idDifference = compareText(left.id, right.id);
    return idDifference || left.sourceIndex - right.sourceIndex;
  }).map((statement, index) => ({ ...statement, index }));

  const statementIndexById = new Map();
  for (const statement of statements) {
    assert(!statementIndexById.has(statement.id), "Statement IDs must be unique.");
    statementIndexById.set(statement.id, statement.index);
  }

  const normalizedVotes = [];
  const participantIds = new Set();
  const seenPairs = new Set();
  for (const vote of source.votes) {
    const participantId = String(sourceParticipantId(vote) ?? "").trim();
    const statementId = String(sourceStatementId(vote) ?? "").trim();
    assert(participantId, "A vote is missing its participant ID.");
    assert(statementIndexById.has(statementId), "A vote references an unknown statement.");
    const pairKey = participantId + "\u0000" + statementId;
    assert(!seenPairs.has(pairKey), "Duplicate participant/statement vote pair.");
    seenPairs.add(pairKey);
    participantIds.add(participantId);
    normalizedVotes.push({
      participantId,
      statementIndex: statementIndexById.get(statementId),
      value: normalizeVote(sourceVoteValue(vote)),
    });
  }

  const participants = [...participantIds].sort(compareText);
  const participantIndexById = new Map(participants.map((id, index) => [id, index]));
  const matrix = Array.from(
    { length: participants.length },
    () => new Array(statements.length).fill(null),
  );
  for (const vote of normalizedVotes) {
    matrix[participantIndexById.get(vote.participantId)][vote.statementIndex] = vote.value;
  }

  return {
    sessionId,
    statements,
    participantCount: participants.length,
    matrix,
    observedVoteCount: normalizedVotes.length,
  };
}

function validatePositiveInteger(value, name, allowZero = false) {
  assert(Number.isInteger(value), name + " must be an integer.");
  assert(allowZero ? value >= 0 : value > 0, name + (allowZero ? " must be non-negative." : " must be positive."));
}

function normalizeOptions(sessionId, options) {
  const merged = {
    ...DEFAULT_POLIS_ANALYSIS_OPTIONS,
    ...options,
  };
  merged.sensitivityThresholds = [...(options.sensitivityThresholds
    ?? DEFAULT_POLIS_ANALYSIS_OPTIONS.sensitivityThresholds)];
  validatePositiveInteger(merged.minimumVotes, "minimumVotes");
  validatePositiveInteger(merged.minimumK, "minimumK");
  validatePositiveInteger(merged.maximumK, "maximumK");
  validatePositiveInteger(merged.kmeansRestarts, "kmeansRestarts");
  validatePositiveInteger(merged.kmeansMaximumIterations, "kmeansMaximumIterations");
  validatePositiveInteger(merged.pcaMaximumIterations, "pcaMaximumIterations");
  validatePositiveInteger(merged.bootstrapReplicates, "bootstrapReplicates", true);
  validatePositiveInteger(merged.representativeStatementLimit, "representativeStatementLimit");
  assert(merged.minimumK >= 2, "minimumK must be at least 2.");
  assert(merged.maximumK >= merged.minimumK, "maximumK must be greater than or equal to minimumK.");
  for (const threshold of merged.sensitivityThresholds) {
    validatePositiveInteger(threshold, "sensitivity threshold");
  }
  merged.sensitivityThresholds = [...new Set([
    merged.minimumVotes,
    ...merged.sensitivityThresholds,
  ])].sort(compareNumber);
  merged.seed = Number.isInteger(options.seed) ? options.seed >>> 0 : fnv1a("polis-static:" + sessionId);
  merged.bootstrapSeed = Number.isInteger(options.bootstrapSeed)
    ? options.bootstrapSeed >>> 0
    : mixSeed(merged.seed, "statement-bootstrap");
  return merged;
}

function observedCountsByParticipant(matrix) {
  return matrix.map((row) => row.reduce(
    (count, value) => count + (value === null ? 0 : 1),
    0,
  ));
}

function computePcaProjection(matrix, maximumIterations) {
  const participantCount = matrix.length;
  const statementCount = matrix[0]?.length ?? 0;
  const columnMeans = new Array(statementCount).fill(0);
  const columnObserved = new Array(statementCount).fill(0);
  for (let column = 0; column < statementCount; column += 1) {
    let columnSum = 0;
    for (let row = 0; row < participantCount; row += 1) {
      const value = matrix[row][column];
      if (value === null) continue;
      columnSum += value;
      columnObserved[column] += 1;
    }
    columnMeans[column] = columnObserved[column]
      ? columnSum / columnObserved[column]
      : 0;
  }

  const covariance = Array.from(
    { length: statementCount },
    () => new Array(statementCount).fill(0),
  );
  for (const row of matrix) {
    const centered = row.map((value, column) => (
      value === null ? 0 : value - columnMeans[column]
    ));
    for (let left = 0; left < statementCount; left += 1) {
      const leftValue = centered[left];
      if (Math.abs(leftValue) <= EPSILON) continue;
      for (let right = left; right < statementCount; right += 1) {
        const increment = leftValue * centered[right];
        covariance[left][right] += increment;
        if (left !== right) covariance[right][left] += increment;
      }
    }
  }

  const first = topEigenpair(covariance, [], 1, maximumIterations);
  const firstBasis = first.value > EPSILON ? [first.vector] : [];
  const second = topEigenpair(covariance, firstBasis, 2, maximumIterations);
  const components = [first.vector, second.vector];
  const eigenvalues = [first.value, second.value];
  const totalVariance = covariance.reduce((result, row, index) => result + row[index], 0);
  const explainedVarianceRatio = eigenvalues.map((value) => (
    totalVariance > EPSILON ? value / totalVariance : 0
  ));

  const coordinates = matrix.map((row) => {
    const observed = row.reduce((count, value) => count + (value === null ? 0 : 1), 0);
    const correction = Math.sqrt(statementCount / Math.max(observed, 1));
    return components.map((component) => {
      let projection = 0;
      for (let column = 0; column < statementCount; column += 1) {
        const value = row[column];
        if (value === null) continue;
        projection += (value - columnMeans[column]) * component[column];
      }
      return correction * projection;
    });
  });

  return {
    columnMeans,
    columnObserved,
    components,
    eigenvalues,
    totalVariance,
    explainedVarianceRatio,
    explainedVarianceRatioTotal: sum(explainedVarianceRatio),
    iterations: [first.iterations, second.iterations],
    coordinates,
  };
}

function uniquePointCount(points) {
  return new Set(points.map((point) => point.map((value) => value.toPrecision(15)).join("\u0000"))).size;
}

function kmeansPlusPlus(points, k, seed) {
  const random = mulberry32(seed);
  const selected = [];
  selected.push(Math.floor(random() * points.length));
  while (selected.length < k) {
    const distances = points.map((point, pointIndex) => {
      if (selected.includes(pointIndex)) return 0;
      let closest = Infinity;
      for (const centerIndex of selected) {
        closest = Math.min(closest, squaredDistance(point, points[centerIndex]));
      }
      return closest;
    });
    const total = sum(distances);
    if (total <= EPSILON) return null;
    let target = random() * total;
    let chosen = -1;
    for (let index = 0; index < distances.length; index += 1) {
      target -= distances[index];
      if (target <= 0 && distances[index] > 0) {
        chosen = index;
        break;
      }
    }
    if (chosen < 0) {
      chosen = distances.reduce(
        (best, value, index) => value > distances[best] ? index : best,
        0,
      );
    }
    selected.push(chosen);
  }
  return selected.map((index) => [...points[index]]);
}

function nearestCenter(point, centers) {
  let bestCluster = 0;
  let bestDistance = squaredDistance(point, centers[0]);
  for (let cluster = 1; cluster < centers.length; cluster += 1) {
    const distance = squaredDistance(point, centers[cluster]);
    if (distance < bestDistance - EPSILON) {
      bestCluster = cluster;
      bestDistance = distance;
    }
  }
  return { cluster: bestCluster, distance: bestDistance };
}

function recomputeCenters(points, assignments, k, previousCenters) {
  const dimension = points[0].length;
  const centers = Array.from({ length: k }, () => new Array(dimension).fill(0));
  const counts = new Array(k).fill(0);
  for (let index = 0; index < points.length; index += 1) {
    const cluster = assignments[index];
    counts[cluster] += 1;
    for (let axis = 0; axis < dimension; axis += 1) {
      centers[cluster][axis] += points[index][axis];
    }
  }
  for (let cluster = 0; cluster < k; cluster += 1) {
    if (!counts[cluster]) {
      centers[cluster] = [...previousCenters[cluster]];
      continue;
    }
    for (let axis = 0; axis < dimension; axis += 1) {
      centers[cluster][axis] /= counts[cluster];
    }
  }
  return { centers, counts };
}

function repairEmptyClusters(points, assignments, centers, k) {
  let { counts } = recomputeCenters(points, assignments, k, centers);
  for (let empty = 0; empty < k; empty += 1) {
    if (counts[empty]) continue;
    let candidate = -1;
    let candidateDistance = -1;
    for (let index = 0; index < points.length; index += 1) {
      const donor = assignments[index];
      if (counts[donor] <= 1) continue;
      const distance = squaredDistance(points[index], centers[donor]);
      if (distance > candidateDistance + EPSILON) {
        candidate = index;
        candidateDistance = distance;
      }
    }
    if (candidate < 0) return false;
    counts[assignments[candidate]] -= 1;
    assignments[candidate] = empty;
    counts[empty] += 1;
  }
  return true;
}

function canonicalizeClustering(assignments, centers) {
  const sizes = new Array(centers.length).fill(0);
  for (const assignment of assignments) sizes[assignment] += 1;
  const order = centers.map((center, id) => ({ center, id, size: sizes[id] }))
    .sort((left, right) => {
      for (let axis = 0; axis < left.center.length; axis += 1) {
        const difference = left.center[axis] - right.center[axis];
        if (Math.abs(difference) > EPSILON) return difference;
      }
      const sizeDifference = right.size - left.size;
      return sizeDifference || left.id - right.id;
    });
  const remap = new Map(order.map((cluster, index) => [cluster.id, index]));
  return {
    assignments: assignments.map((cluster) => remap.get(cluster)),
    centers: order.map((cluster) => [...cluster.center]),
    sizes: order.map((cluster) => cluster.size),
  };
}

function lexicographicArrayCompare(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function deterministicKmeans(points, k, options, contextSeed) {
  if (points.length < k || uniquePointCount(points) < k) return null;
  let best = null;
  for (let restart = 0; restart < options.kmeansRestarts; restart += 1) {
    let centers = kmeansPlusPlus(points, k, mixSeed(contextSeed, k, restart));
    if (!centers) continue;
    let assignments = new Array(points.length).fill(-1);
    let iterations = 0;
    for (; iterations < options.kmeansMaximumIterations; iterations += 1) {
      const nextAssignments = points.map((point) => nearestCenter(point, centers).cluster);
      if (!repairEmptyClusters(points, nextAssignments, centers, k)) break;
      const updated = recomputeCenters(points, nextAssignments, k, centers);
      const unchanged = nextAssignments.every((cluster, index) => cluster === assignments[index]);
      assignments = nextAssignments;
      centers = updated.centers;
      if (unchanged) {
        iterations += 1;
        break;
      }
    }
    if (assignments.some((cluster) => cluster < 0)) continue;
    const canonical = canonicalizeClustering(assignments, centers);
    const inertia = points.reduce(
      (result, point, index) => result + squaredDistance(point, canonical.centers[canonical.assignments[index]]),
      0,
    );
    const candidate = { ...canonical, inertia, iterations };
    if (!best
      || candidate.inertia < best.inertia - EPSILON
      || (Math.abs(candidate.inertia - best.inertia) <= EPSILON
        && lexicographicArrayCompare(candidate.assignments, best.assignments) < 0)) {
      best = candidate;
    }
  }
  return best;
}

function silhouetteScore(points, assignments, k) {
  if (points.length <= k || k < 2) return null;
  const members = Array.from({ length: k }, () => []);
  for (let index = 0; index < assignments.length; index += 1) {
    members[assignments[index]].push(index);
  }
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const own = assignments[index];
    if (members[own].length <= 1) continue;
    let within = 0;
    for (const other of members[own]) {
      if (other !== index) within += euclideanDistance(points[index], points[other]);
    }
    within /= members[own].length - 1;
    let nearestOther = Infinity;
    for (let cluster = 0; cluster < k; cluster += 1) {
      if (cluster === own || !members[cluster].length) continue;
      let distance = 0;
      for (const other of members[cluster]) {
        distance += euclideanDistance(points[index], points[other]);
      }
      distance /= members[cluster].length;
      nearestOther = Math.min(nearestOther, distance);
    }
    const denominator = Math.max(within, nearestOther);
    if (Number.isFinite(nearestOther) && denominator > EPSILON) {
      total += (nearestOther - within) / denominator;
    }
  }
  return total / points.length;
}

function selectClustering(points, options, contextSeed) {
  const maximumK = Math.min(
    options.maximumK,
    points.length - 1,
    uniquePointCount(points),
  );
  const candidates = [];
  for (let k = options.minimumK; k <= maximumK; k += 1) {
    const clustering = deterministicKmeans(points, k, options, mixSeed(contextSeed, "kmeans", k));
    if (!clustering) continue;
    const silhouette = silhouetteScore(points, clustering.assignments, k);
    candidates.push({
      k,
      silhouette,
      inertia: clustering.inertia,
      iterations: clustering.iterations,
      groupSizes: clustering.sizes,
      clustering,
    });
  }
  if (!candidates.length) return { selected: null, candidates: [] };
  const selected = [...candidates].sort((left, right) => {
    const scoreDifference = (right.silhouette ?? -Infinity) - (left.silhouette ?? -Infinity);
    if (Math.abs(scoreDifference) > EPSILON) return scoreDifference;
    if (left.k !== right.k) return left.k - right.k;
    return left.inertia - right.inertia;
  })[0];
  return {
    selected,
    candidates: candidates.map(({ clustering, ...candidate }) => candidate),
  };
}

function chooseTwo(value) {
  return value >= 2 ? value * (value - 1) / 2 : 0;
}

function adjustedRandIndex(reference, comparison) {
  assert(reference.length === comparison.length, "ARI partitions must contain the same participants.");
  const count = reference.length;
  if (count < 2) return 1;
  const referenceCounts = new Map();
  const comparisonCounts = new Map();
  const jointCounts = new Map();
  for (let index = 0; index < count; index += 1) {
    const left = reference[index];
    const right = comparison[index];
    referenceCounts.set(left, (referenceCounts.get(left) || 0) + 1);
    comparisonCounts.set(right, (comparisonCounts.get(right) || 0) + 1);
    const key = left + "\u0000" + right;
    jointCounts.set(key, (jointCounts.get(key) || 0) + 1);
  }
  const jointPairs = sum([...jointCounts.values()].map(chooseTwo));
  const referencePairs = sum([...referenceCounts.values()].map(chooseTwo));
  const comparisonPairs = sum([...comparisonCounts.values()].map(chooseTwo));
  const allPairs = chooseTwo(count);
  if (allPairs <= EPSILON) return 1;
  const expected = referencePairs * comparisonPairs / allPairs;
  const maximum = (referencePairs + comparisonPairs) / 2;
  const denominator = maximum - expected;
  if (Math.abs(denominator) <= EPSILON) {
    return jointPairs === maximum ? 1 : 0;
  }
  return clamp((jointPairs - expected) / denominator, -1, 1);
}

function sampleStatementIndexes(statementCount, seed) {
  const random = mulberry32(seed);
  return Array.from(
    { length: statementCount },
    () => Math.floor(random() * statementCount),
  );
}

function selectColumns(matrix, columnIndexes) {
  return matrix.map((row) => columnIndexes.map((column) => row[column]));
}

function bootstrapStability(matrix, eligibleIndexes, reference, options) {
  const records = [];
  if (!reference || options.bootstrapReplicates === 0) {
    return {
      method: "Deterministic statement bootstrap; resample statement columns with replacement, rerun PCA and K selection, compare participant partitions with adjusted Rand index.",
      replicatesRequested: options.bootstrapReplicates,
      replicatesCompleted: 0,
      seed: options.bootstrapSeed,
      adjustedRand: { mean: null, median: null, p10: null, minimum: null, maximum: null },
      sameKRate: null,
      selectedKFrequency: {},
      records: [],
    };
  }

  const statementCount = matrix[0]?.length ?? 0;
  for (let replicate = 0; replicate < options.bootstrapReplicates; replicate += 1) {
    const replicateSeed = mixSeed(options.bootstrapSeed, replicate);
    const columns = sampleStatementIndexes(statementCount, replicateSeed);
    const sampledMatrix = selectColumns(matrix, columns);
    const pca = computePcaProjection(sampledMatrix, options.pcaMaximumIterations);
    const points = eligibleIndexes.map((index) => pca.coordinates[index]);
    const selection = selectClustering(points, options, mixSeed(replicateSeed, "bootstrap-clustering"));
    if (!selection.selected) continue;
    const ari = adjustedRandIndex(
      reference.clustering.assignments,
      selection.selected.clustering.assignments,
    );
    records.push({
      replicate,
      selectedK: selection.selected.k,
      silhouette: selection.selected.silhouette,
      adjustedRand: ari,
    });
  }

  const adjustedRandValues = records.map((record) => record.adjustedRand);
  const selectedKFrequency = {};
  for (const record of records) {
    selectedKFrequency[record.selectedK] = (selectedKFrequency[record.selectedK] || 0) + 1;
  }
  return {
    method: "Deterministic statement bootstrap; resample statement columns with replacement, rerun PCA and K selection, compare participant partitions with adjusted Rand index.",
    replicatesRequested: options.bootstrapReplicates,
    replicatesCompleted: records.length,
    seed: options.bootstrapSeed,
    adjustedRand: {
      mean: mean(adjustedRandValues),
      median: quantile(adjustedRandValues, 0.5),
      p10: quantile(adjustedRandValues, 0.1),
      minimum: adjustedRandValues.length ? Math.min(...adjustedRandValues) : null,
      maximum: adjustedRandValues.length ? Math.max(...adjustedRandValues) : null,
    },
    sameKRate: records.length
      ? records.filter((record) => record.selectedK === reference.k).length / records.length
      : null,
    selectedKFrequency,
    records,
  };
}

function voteCounts(matrix, participantIndexes, statementIndex) {
  const counts = { agree: 0, neutral: 0, disagree: 0, missing: 0, observed: 0, decided: 0 };
  for (const participantIndex of participantIndexes) {
    const value = matrix[participantIndex][statementIndex];
    if (value === null) {
      counts.missing += 1;
      continue;
    }
    counts.observed += 1;
    if (value === 1) {
      counts.agree += 1;
      counts.decided += 1;
    } else if (value === -1) {
      counts.disagree += 1;
      counts.decided += 1;
    } else {
      counts.neutral += 1;
    }
  }
  return counts;
}

function statementRateSummary(counts, populationSize) {
  return {
    ...counts,
    coverage: populationSize ? counts.observed / populationSize : 0,
    supportRateObserved: counts.observed ? counts.agree / counts.observed : null,
    neutralRateObserved: counts.observed ? counts.neutral / counts.observed : null,
    opposeRateObserved: counts.observed ? counts.disagree / counts.observed : null,
    supportRateDecided: counts.decided ? counts.agree / counts.decided : null,
    smoothedSupportObserved: (counts.agree + 1) / (counts.observed + 2),
    smoothedSupportDecided: (counts.agree + 1) / (counts.decided + 2),
  };
}

function weightedStatementSummary(matrix, eligibleIndexes, memberships, tendencyIndex, statementIndex) {
  const counts = { agree: 0, neutral: 0, disagree: 0, missing: 0, observed: 0, decided: 0 };
  let populationWeight = 0;
  for (let position = 0; position < eligibleIndexes.length; position += 1) {
    const weight = memberships[position][tendencyIndex];
    populationWeight += weight;
    const value = matrix[eligibleIndexes[position]][statementIndex];
    if (value === null) {
      counts.missing += weight;
      continue;
    }
    counts.observed += weight;
    if (value === 1) {
      counts.agree += weight;
      counts.decided += weight;
    } else if (value === -1) {
      counts.disagree += weight;
      counts.decided += weight;
    } else {
      counts.neutral += weight;
    }
  }
  return {
    ...counts,
    populationWeight,
    coverage: populationWeight > EPSILON ? counts.observed / populationWeight : 0,
    supportRateObserved: counts.observed > EPSILON ? counts.agree / counts.observed : null,
    neutralRateObserved: counts.observed > EPSILON ? counts.neutral / counts.observed : null,
    opposeRateObserved: counts.observed > EPSILON ? counts.disagree / counts.observed : null,
    supportRateDecided: counts.decided > EPSILON ? counts.agree / counts.decided : null,
  };
}

function fuzzyProfileSpread(points, memberships, center, tendencyIndex, fuzzifier) {
  const weights = memberships.map((row) => row[tendencyIndex] ** fuzzifier);
  const totalWeight = sum(weights);
  if (totalWeight <= EPSILON) {
    return { varianceX: 0, covarianceXY: 0, varianceY: 0 };
  }
  let varianceX = 0;
  let covarianceXY = 0;
  let varianceY = 0;
  for (let index = 0; index < points.length; index += 1) {
    const x = points[index][0] - center[0];
    const y = points[index][1] - center[1];
    varianceX += weights[index] * x * x;
    covarianceXY += weights[index] * x * y;
    varianceY += weights[index] * y * y;
  }
  return {
    varianceX: varianceX / totalWeight,
    covarianceXY: covarianceXY / totalWeight,
    varianceY: varianceY / totalWeight,
  };
}

function buildSoftOpinionTendencies(normalized, eligibleIndexes, pca, requestedK = 2) {
  const points = eligibleIndexes.map((index) => pca.coordinates[index]);
  const fuzzy = fuzzyCMeans(points, requestedK);
  if (!fuzzy) return null;
  const profiles = fuzzy.centers.map((center, tendencyIndex) => ({
    tendencyId: tendencyIndex + 1,
    centroid: [...center],
    membershipMass: sum(fuzzy.memberships.map((row) => row[tendencyIndex])),
    spread: fuzzyProfileSpread(
      points,
      fuzzy.memberships,
      center,
      tendencyIndex,
      fuzzy.fuzzifier,
    ),
    statements: normalized.statements.map((statement) => ({
      statementIndex: statement.index,
      statementId: statement.id,
      text: statement.text,
      ...weightedStatementSummary(
        normalized.matrix,
        eligibleIndexes,
        fuzzy.memberships,
        tendencyIndex,
        statement.index,
      ),
    })),
  }));
  const xValues = points.map((point) => point[0]);
  const yValues = points.map((point) => point[1]);
  const multipleTendencyThreshold = 0.20;
  return {
    method: "Deterministic fuzzy c-means on the first two PCA dimensions",
    requestedTendencyCount: requestedK,
    tendencyCount: profiles.length,
    fuzzifier: fuzzy.fuzzifier,
    iterations: fuzzy.iterations,
    profiles,
    mapDomain: {
      xMinimum: Math.min(...xValues),
      xMaximum: Math.max(...xValues),
      yMinimum: Math.min(...yValues),
      yMaximum: Math.max(...yValues),
    },
    overlapSummary: {
      membershipThreshold: multipleTendencyThreshold,
      participantsWithMultipleTendencies: fuzzy.memberships.filter((row) => (
        row.filter((membership) => membership >= multipleTendencyThreshold).length >= 2
      )).length,
      eligibleParticipants: eligibleIndexes.length,
    },
  };
}

function oneProportionZ(successes, trials, nullProbability = 0.5) {
  if (!trials) return 0;
  const denominator = Math.sqrt(nullProbability * (1 - nullProbability) / trials);
  return denominator > EPSILON ? (successes / trials - nullProbability) / denominator : 0;
}

function twoProportionZ(successesInside, trialsInside, successesOutside, trialsOutside) {
  if (!trialsInside || !trialsOutside) return 0;
  const pooled = (successesInside + successesOutside) / (trialsInside + trialsOutside);
  const denominator = Math.sqrt(pooled * (1 - pooled) * (1 / trialsInside + 1 / trialsOutside));
  if (denominator <= EPSILON) return 0;
  return (successesInside / trialsInside - successesOutside / trialsOutside) / denominator;
}

function representativeCandidate(statement, direction, inside, outside) {
  const insideSuccesses = direction === "agree" ? inside.agree : inside.disagree;
  const outsideSuccesses = direction === "agree" ? outside.agree : outside.disagree;
  const insideProbability = (insideSuccesses + 1) / (inside.observed + 2);
  const outsideProbability = (outsideSuccesses + 1) / (outside.observed + 2);
  const relativeLikelihood = insideProbability / outsideProbability;
  const difference = insideProbability - outsideProbability;
  const betweenGroupZ = twoProportionZ(
    insideSuccesses,
    inside.observed,
    outsideSuccesses,
    outside.observed,
  );
  const withinGroupZ = oneProportionZ(insideSuccesses, inside.observed);
  const significant90 = betweenGroupZ >= SIGNIFICANCE_90_Z
    && withinGroupZ >= SIGNIFICANCE_90_Z;
  const score = Math.max(0, difference)
    * Math.max(0, betweenGroupZ)
    * Math.max(0, withinGroupZ)
    * relativeLikelihood;
  return {
    statementIndex: statement.index,
    statementId: statement.id,
    text: statement.text,
    direction,
    inside: {
      successes: insideSuccesses,
      observed: inside.observed,
      probability: insideProbability,
    },
    outside: {
      successes: outsideSuccesses,
      observed: outside.observed,
      probability: outsideProbability,
    },
    probabilityDifference: difference,
    relativeLikelihood,
    betweenGroupZ,
    withinGroupZ,
    significant90,
    score,
    fallback: false,
  };
}

function buildGroupAnalysis(normalized, eligibleIndexes, clustering, pca, options) {
  const { matrix, statements } = normalized;
  const k = clustering.assignments.length ? clustering.centers.length : 0;
  const memberIndexes = Array.from({ length: k }, () => []);
  for (let index = 0; index < eligibleIndexes.length; index += 1) {
    memberIndexes[clustering.assignments[index]].push(eligibleIndexes[index]);
  }
  const eligibleSet = new Set(eligibleIndexes);
  const groupStatementCounts = memberIndexes.map((members, groupId) => ({
    id: groupId,
    label: String.fromCharCode("A".charCodeAt(0) + groupId),
    size: members.length,
    share: eligibleIndexes.length ? members.length / eligibleIndexes.length : 0,
    centroid: [...clustering.centers[groupId]],
    statements: statements.map((statement) => ({
      statementIndex: statement.index,
      statementId: statement.id,
      text: statement.text,
      ...statementRateSummary(voteCounts(matrix, members, statement.index), members.length),
    })),
  }));

  const statementSummaries = statements.map((statement) => ({
    statementIndex: statement.index,
    statementId: statement.id,
    text: statement.text,
    ...statementRateSummary(
      voteCounts(matrix, eligibleIndexes, statement.index),
      eligibleIndexes.length,
    ),
  }));

  const representativeStatements = groupStatementCounts.map((group) => {
    const members = memberIndexes[group.id];
    const memberSet = new Set(members);
    const outsiders = eligibleIndexes.filter((index) => !memberSet.has(index));
    const candidates = [];
    for (const statement of statements) {
      const inside = voteCounts(matrix, members, statement.index);
      const outside = voteCounts(matrix, outsiders, statement.index);
      const agree = representativeCandidate(statement, "agree", inside, outside);
      const disagree = representativeCandidate(statement, "disagree", inside, outside);
      candidates.push(agree.score >= disagree.score ? agree : disagree);
    }
    candidates.sort((left, right) => {
      if (left.significant90 !== right.significant90) return left.significant90 ? -1 : 1;
      const scoreDifference = right.score - left.score;
      return Math.abs(scoreDifference) > EPSILON
        ? scoreDifference
        : left.statementIndex - right.statementIndex;
    });
    const significant = candidates.filter((candidate) => candidate.significant90)
      .slice(0, options.representativeStatementLimit);
    const selected = significant.length
      ? significant
      : candidates.length
        ? [{ ...candidates[0], fallback: true }]
        : [];
    return {
      groupId: group.id,
      groupLabel: group.label,
      hasSignificantRepresentativeStatements: significant.length > 0,
      statements: selected,
    };
  });

  const differentiatingStatements = statements.map((statement) => {
    const byGroup = groupStatementCounts.map((group) => {
      const counts = group.statements[statement.index];
      return {
        groupId: group.id,
        groupLabel: group.label,
        size: group.size,
        agree: counts.agree,
        neutral: counts.neutral,
        disagree: counts.disagree,
        observed: counts.observed,
        coverage: counts.coverage,
        smoothedSupportDecided: counts.smoothedSupportDecided,
      };
    });
    const ordered = [...byGroup].sort((left, right) => (
      left.smoothedSupportDecided - right.smoothedSupportDecided
      || left.groupId - right.groupId
    ));
    const lowest = ordered[0];
    const highest = ordered[ordered.length - 1];
    const supportValues = byGroup.map((group) => group.smoothedSupportDecided);
    const supportMean = mean(supportValues) ?? 0;
    const betweenGroupVariance = mean(supportValues.map((value) => (value - supportMean) ** 2)) ?? 0;
    return {
      statementIndex: statement.index,
      statementId: statement.id,
      text: statement.text,
      lowestGroupId: lowest.groupId,
      highestGroupId: highest.groupId,
      supportRange: highest.smoothedSupportDecided - lowest.smoothedSupportDecided,
      betweenGroupVariance,
      minimumGroupCoverage: Math.min(...byGroup.map((group) => group.coverage)),
      groups: byGroup,
    };
  }).sort((left, right) => {
    const rangeDifference = right.supportRange - left.supportRange;
    if (Math.abs(rangeDifference) > EPSILON) return rangeDifference;
    const coverageDifference = right.minimumGroupCoverage - left.minimumGroupCoverage;
    return Math.abs(coverageDifference) > EPSILON
      ? coverageDifference
      : left.statementIndex - right.statementIndex;
  });

  const consensus = statements.map((statement) => {
    const groups = groupStatementCounts.map((group) => {
      const counts = group.statements[statement.index];
      return {
        groupId: group.id,
        groupLabel: group.label,
        observed: counts.observed,
        decided: counts.decided,
        coverage: counts.coverage,
        smoothedSupportObserved: counts.smoothedSupportObserved,
        smoothedSupportDecided: counts.smoothedSupportDecided,
      };
    });
    return {
      statementIndex: statement.index,
      statementId: statement.id,
      text: statement.text,
      polisProduct: groups.reduce(
        (product, group) => product * group.smoothedSupportObserved,
        1,
      ),
      minimumGroupSupport: Math.min(...groups.map((group) => group.smoothedSupportDecided)),
      equalGroupMeanSupport: mean(groups.map((group) => group.smoothedSupportDecided)),
      minimumGroupCoverage: Math.min(...groups.map((group) => group.coverage)),
      groups,
    };
  });

  const rankBy = (metric) => {
    const ordered = [...consensus].sort((left, right) => {
      const difference = right[metric] - left[metric];
      if (Math.abs(difference) > EPSILON) return difference;
      const coverageDifference = right.minimumGroupCoverage - left.minimumGroupCoverage;
      return Math.abs(coverageDifference) > EPSILON
        ? coverageDifference
        : left.statementIndex - right.statementIndex;
    });
    return new Map(ordered.map((statement, index) => [statement.statementIndex, index + 1]));
  };
  const polisRanks = rankBy("polisProduct");
  const minimumRanks = rankBy("minimumGroupSupport");
  const equalMeanRanks = rankBy("equalGroupMeanSupport");
  const consensusRankings = consensus.map((statement) => ({
    ...statement,
    rankByPolisProduct: polisRanks.get(statement.statementIndex),
    rankByMinimumGroupSupport: minimumRanks.get(statement.statementIndex),
    rankByEqualGroupMeanSupport: equalMeanRanks.get(statement.statementIndex),
  })).sort((left, right) => (
    left.rankByMinimumGroupSupport - right.rankByMinimumGroupSupport
  ));

  const assignments = eligibleIndexes.map((participantIndex, index) => ({
    participantIndex: participantIndex + 1,
    groupId: clustering.assignments[index],
    groupLabel: String.fromCharCode("A".charCodeAt(0) + clustering.assignments[index]),
    coordinates: [...pca.coordinates[participantIndex]],
    observedVotes: matrix[participantIndex].reduce(
      (count, value) => count + (value === null ? 0 : 1),
      0,
    ),
  }));

  // Keep the assertion local to the privacy boundary: only analysis indexes are returned.
  assert(assignments.every((assignment) => eligibleSet.has(assignment.participantIndex - 1)), "Assignment index mismatch.");

  return {
    assignments,
    groups: groupStatementCounts,
    statementSummaries,
    representativeStatements,
    differentiatingStatements,
    consensusRankings,
  };
}

function sensitivitySummary(pca, observedCounts, options) {
  return options.sensitivityThresholds.map((threshold) => {
    const eligibleIndexes = observedCounts
      .map((count, index) => ({ count, index }))
      .filter((participant) => participant.count >= threshold)
      .map((participant) => participant.index);
    const points = eligibleIndexes.map((index) => pca.coordinates[index]);
    const contextSeed = threshold === options.minimumVotes
      ? mixSeed(options.seed, "primary-clustering")
      : mixSeed(options.seed, "sensitivity", threshold);
    const selection = points.length > options.minimumK
      ? selectClustering(points, options, contextSeed)
      : { selected: null, candidates: [] };
    return {
      minimumVotes: threshold,
      eligibleParticipantCount: eligibleIndexes.length,
      excludedParticipantCount: observedCounts.length - eligibleIndexes.length,
      selectedK: selection.selected?.k ?? null,
      silhouette: finiteNumber(selection.selected?.silhouette),
      groupSizes: selection.selected?.groupSizes ?? [],
    };
  });
}

function publicationGuardrails(mainClustering, eligibleCount, stability) {
  const groupSizes = mainClustering?.groupSizes ?? [];
  const minimumGroupSize = groupSizes.length ? Math.min(...groupSizes) : 0;
  const minimumGroupShare = eligibleCount ? minimumGroupSize / eligibleCount : 0;
  const silhouette = finiteNumber(mainClustering?.silhouette);
  const medianAdjustedRand = stability.adjustedRand.median;
  const checks = {
    minimumGroupSize: {
      threshold: 15,
      observed: minimumGroupSize,
      pass: minimumGroupSize >= 15,
    },
    minimumGroupShare: {
      threshold: 0.20,
      observed: minimumGroupShare,
      pass: minimumGroupShare >= 0.20,
    },
    silhouette: {
      threshold: 0.25,
      observed: silhouette,
      pass: silhouette !== null && silhouette >= 0.25,
    },
    statementBootstrapMedianAdjustedRand: {
      threshold: 0.70,
      observed: medianAdjustedRand,
      pass: medianAdjustedRand !== null && medianAdjustedRand >= 0.70,
    },
  };
  const pass = Object.values(checks).every((check) => check.pass);
  return {
    label: "Project-specific publication guardrails — not official Pol.is thresholds",
    pass,
    recommendation: pass ? "publishable" : "withhold-group-claims",
    checks,
  };
}

/**
 * Analyze a raw HearTheRoom session object or the `normalized` object returned
 * by `convert-heartheroom-to-polis.mjs`.
 *
 * @param {object} source Object with `statements` and `votes`; session metadata
 * may be under `session.id` or `sessionId`.
 * @param {object} [options]
 * @returns {object} JSON-serializable diagnostics, pseudonymous assignments,
 * group statement counts, representative statements, differentiating
 * statements, and cross-group consensus rankings.
 */
export function analyzePolisInspiredSession(source, options = {}) {
  const normalized = normalizeSession(source);
  const analysisOptions = normalizeOptions(normalized.sessionId, options);
  assert(normalized.statements.length >= 2, "At least two statements are required.");
  assert(normalized.participantCount >= 3, "At least three voting participants are required.");

  const observedCounts = observedCountsByParticipant(normalized.matrix);
  const eligibleIndexes = observedCounts
    .map((count, index) => ({ count, index }))
    .filter((participant) => participant.count >= analysisOptions.minimumVotes)
    .map((participant) => participant.index);
  const pca = computePcaProjection(normalized.matrix, analysisOptions.pcaMaximumIterations);
  const sensitivity = sensitivitySummary(pca, observedCounts, analysisOptions);
  const selectedSensitivity = sensitivity.find(
    (summary) => summary.minimumVotes === analysisOptions.minimumVotes,
  );

  if (eligibleIndexes.length <= analysisOptions.minimumK) {
    return {
      ok: false,
      reason: "insufficient-eligible-participants",
      sessionId: normalized.sessionId,
      privacy: "No raw participant IDs, names, or client IDs are included. Participant-level assignments are not publishable report data.",
      diagnostics: {
        method: "Pol.is-inspired static analysis; not official Pol.is output",
        participantCount: normalized.participantCount,
        eligibleParticipantCount: eligibleIndexes.length,
        excludedParticipantCount: normalized.participantCount - eligibleIndexes.length,
        statementCount: normalized.statements.length,
        observedVoteCount: normalized.observedVoteCount,
        matrixDensity: normalized.observedVoteCount
          / (normalized.participantCount * normalized.statements.length),
        eligibilityThreshold: analysisOptions.minimumVotes,
        eligibilitySensitivity: sensitivity,
      },
      assignments: [],
      groups: [],
      statementSummaries: [],
      representativeStatements: [],
      differentiatingStatements: [],
      consensusRankings: [],
    };
  }

  const eligiblePoints = eligibleIndexes.map((index) => pca.coordinates[index]);
  const clusteringSelection = selectClustering(
    eligiblePoints,
    analysisOptions,
    mixSeed(analysisOptions.seed, "primary-clustering"),
  );
  if (!clusteringSelection.selected) {
    return {
      ok: false,
      reason: "insufficient-distinct-opinion-points",
      sessionId: normalized.sessionId,
      privacy: "No raw participant IDs, names, or client IDs are included. Participant-level assignments are not publishable report data.",
      diagnostics: {
        method: "Pol.is-inspired static analysis; not official Pol.is output",
        participantCount: normalized.participantCount,
        eligibleParticipantCount: eligibleIndexes.length,
        excludedParticipantCount: normalized.participantCount - eligibleIndexes.length,
        statementCount: normalized.statements.length,
        observedVoteCount: normalized.observedVoteCount,
        matrixDensity: normalized.observedVoteCount
          / (normalized.participantCount * normalized.statements.length),
        eligibilityThreshold: analysisOptions.minimumVotes,
        eligibilitySensitivity: sensitivity,
      },
      assignments: [],
      groups: [],
      statementSummaries: [],
      representativeStatements: [],
      differentiatingStatements: [],
      consensusRankings: [],
    };
  }

  const selected = clusteringSelection.selected;
  const stability = bootstrapStability(
    normalized.matrix,
    eligibleIndexes,
    selected,
    analysisOptions,
  );
  const analysis = buildGroupAnalysis(
    normalized,
    eligibleIndexes,
    selected.clustering,
    pca,
    analysisOptions,
  );
  const opinionTendencies = buildSoftOpinionTendencies(
    normalized,
    eligibleIndexes,
    pca,
    selected.k,
  );
  const selectedKs = sensitivity
    .map((summary) => summary.selectedK)
    .filter((value) => value !== null);
  const observedKRange = selectedKs.length
    ? { minimum: Math.min(...selectedKs), maximum: Math.max(...selectedKs) }
    : { minimum: null, maximum: null };
  const guardrails = publicationGuardrails(selected, eligibleIndexes.length, stability);

  return {
    ok: true,
    sessionId: normalized.sessionId,
    privacy: "No raw participant IDs, names, or client IDs are included. Participant-level assignments are not publishable report data.",
    diagnostics: {
      method: "Pol.is-inspired static analysis; not official Pol.is output",
      voteEncoding: "+1 agree, 0 observed neutral/pass, -1 disagree; null means missing/unseen",
      missingVoteHandling: "Per-statement observed mean for PCA fitting; missing cells remain absent during sparse participant projection.",
      participantProjectionScaling: "sqrt(statement count / participant observed-vote count)",
      participantCount: normalized.participantCount,
      eligibleParticipantCount: eligibleIndexes.length,
      excludedParticipantCount: normalized.participantCount - eligibleIndexes.length,
      statementCount: normalized.statements.length,
      observedVoteCount: normalized.observedVoteCount,
      missingCellCount: normalized.participantCount * normalized.statements.length
        - normalized.observedVoteCount,
      matrixDensity: normalized.observedVoteCount
        / (normalized.participantCount * normalized.statements.length),
      eligibilityThreshold: analysisOptions.minimumVotes,
      pca: {
        dimensions: 2,
        fitParticipantCount: normalized.participantCount,
        eigenvalues: pca.eigenvalues,
        explainedVarianceRatio: pca.explainedVarianceRatio,
        explainedVarianceRatioTotal: pca.explainedVarianceRatioTotal,
        totalVariance: pca.totalVariance,
        iterations: pca.iterations,
        statements: normalized.statements.map((statement, index) => ({
          statementIndex: statement.index,
          statementId: statement.id,
          observed: pca.columnObserved[index],
          imputationMean: pca.columnMeans[index],
          pc1Loading: pca.components[0][index],
          pc2Loading: pca.components[1][index],
        })),
      },
      clustering: {
        algorithm: "Deterministic seeded k-means++ with Lloyd iterations",
        candidateK: [analysisOptions.minimumK, analysisOptions.maximumK],
        selectedK: selected.k,
        selectedSilhouette: selected.silhouette,
        selectedInertia: selected.inertia,
        groupSizes: selected.groupSizes,
        restarts: analysisOptions.kmeansRestarts,
        seed: analysisOptions.seed,
        candidates: clusteringSelection.candidates,
      },
      eligibilitySensitivity: sensitivity,
      observedSelectedKRange: observedKRange,
      statementBootstrapStability: stability,
      publicationGuardrails: guardrails,
      selectedEligibilitySummary: selectedSensitivity ?? null,
    },
    opinionTendencies,
    ...analysis,
  };
}
