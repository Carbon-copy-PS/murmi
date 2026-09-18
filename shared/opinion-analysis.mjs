import { groupLabel } from './group-label.mjs';
import { opinionDensity } from './opinion-density.mjs';
import { analyzePolisInspiredSession, checkProjectionSensitivity } from "../data-analysis/polis-inspired-analysis.mjs";

export const OPINION_ANALYSIS_VERSION = "shared-opinion-groups-v4";
export const OPINION_OPTIONS = Object.freeze({
  minimumVotes: 1, minimumK: 2, maximumK: 7,
  bootstrapReplicates: 100, sensitivityThresholds: [1, 2, 3, 7],
});

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function nullableRound(value, digits = 4) {
  if (value === null || value === undefined || value === "") return null;
  return round(Number(value), digits);
}

function axisSummary(pcaStatements, statements, key) {
  const values = pcaStatements
    .map((statement) => ({
      statementId: statement.statementId,
      text: statements.get(String(statement.statementId)) || "",
      loading: Number(statement[key]),
    }))
    .filter((statement) => Number.isFinite(statement.loading));
  const positive = [...values]
    .sort((left, right) => right.loading - left.loading)
    .slice(0, 3);
  const negative = [...values]
    .sort((left, right) => left.loading - right.loading)
    .slice(0, 3);
  return {
    positive: positive.map((statement) => ({
      ...statement,
      loading: round(statement.loading),
    })),
    negative: negative.map((statement) => ({
      ...statement,
      loading: round(statement.loading),
    })),
  };
}

function reliabilitySummary(diagnostics) {
  const stability = diagnostics.statementBootstrapStability || {};
  const guardrails = diagnostics.publicationGuardrails || {};
  const clustering = diagnostics.clustering || {};
  const bootstrapThreshold = (
    guardrails.checks?.statementBootstrapMedianAdjustedRand?.threshold
    ?? 0.70
  );
  const records = (stability.records || []).map((record) => ({
    selectedK: Number(record.selectedK),
    adjustedRand: nullableRound(record.adjustedRand),
  })).filter((record) => (
    Number.isInteger(record.selectedK)
    && Number.isFinite(record.adjustedRand)
  ));
  const eligibilitySensitivity = (
    diagnostics.eligibilitySensitivity || []
  ).map((item) => ({
    minimumVotes: Number(item.minimumVotes),
    eligibleParticipants: Number(item.eligibleParticipantCount),
    excludedParticipants: Number(item.excludedParticipantCount),
    selectedK: Number.isInteger(item.selectedK) ? item.selectedK : null,
    silhouette: nullableRound(item.silhouette),
  }));

  return {
    method: stability.method || "",
    hardGroupStatus: (
      guardrails.recommendation || "withhold-group-claims"
    ),
    guardrailLabel: guardrails.label || "",
    selectedK: Number.isInteger(clustering.selectedK)
      ? clustering.selectedK
      : null,
    selectedSilhouette: nullableRound(clustering.selectedSilhouette),
    bootstrapReplicatesRequested: Number(stability.replicatesRequested || 0),
    bootstrapReplicatesCompleted: Number(stability.replicatesCompleted || 0),
    bootstrapMedianAdjustedRand: nullableRound(
      stability.adjustedRand?.median,
    ),
    bootstrapSameKRate: nullableRound(stability.sameKRate),
    bootstrapSelectedKFrequency: stability.selectedKFrequency || {},
    bootstrapThreshold: nullableRound(bootstrapThreshold),
    bootstrapPassCount: records.filter(
      (record) => record.adjustedRand >= bootstrapThreshold
    ).length,
    bootstrapRuns: records,
    observedSelectedKRange: diagnostics.observedSelectedKRange || {
      minimum: null,
      maximum: null,
    },
    eligibilitySensitivity,
  };
}


const VOTES = ['strongly_agree', 'agree', 'neutral', 'disagree', 'strongly_disagree'];
const textOrder = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

function statementStats(statements, voters) {
  return statements.map((statement) => {
    const dist = Object.fromEntries(VOTES.map((vote) => [vote, 0]));
    for (const voter of voters) {
      const vote = voter.votes[statement.id];
      if (Object.hasOwn(dist, vote)) dist[vote] += 1;
    }
    const agree = dist.agree + dist.strongly_agree;
    const disagree = dist.disagree + dist.strongly_disagree;
    const total = agree + disagree;
    const responded = total + dist.neutral;
    const agreeRate = responded ? agree / responded : 0;
    const disagreeRate = responded ? disagree / responded : 0;
    return {
      id: statement.id, text: statement.text, custom: !!statement.custom,
      dist, agree, disagree, neutral: dist.neutral, total, responded,
      missing: voters.length - responded, agreeRate, disagreeRate,
      rate: agreeRate, coverage: voters.length ? responded / voters.length : 0,
      strongAgreeRate: responded ? dist.strongly_agree / responded : 0,
      strongDisagreeRate: responded ? dist.strongly_disagree / responded : 0,
      split: total ? 1 - Math.abs(agree / total - 0.5) * 2 : 0,
    };
  });
}

// Used by the results page exports and common-ground/recommendation inputs too.
function describeGroup(group) {
  const evidence = group.statements.filter((item) => item.responded > 0);
  return {
    ...group,
    agree: evidence.filter((s) => s.agreeRate >= 0.5 && s.strongAgreeRate < 0.4).slice(0, 3),
    disagree: evidence.filter((s) => s.disagreeRate >= 0.5 && s.strongDisagreeRate < 0.4).slice(0, 3),
    stronglyAgree: evidence.filter((s) => s.strongAgreeRate >= 0.4).slice(0, 3),
    stronglyDisagree: evidence.filter((s) => s.strongDisagreeRate >= 0.4).slice(0, 3),
  };
}

/** Canonical shared calculation. Only `landscape` is publishable report data.
 * Live points use caller-provided anonymous ballot keys, never report fields.
 * Weak evidence changes the status label, not the early participation threshold.
 */
export function computeSharedOpinionAnalysis(source) {
  const statements = [...source.statements].sort((a, b) => textOrder(a.id, b.id));
  const ids = [...new Set(source.votes.map((vote) => String(vote.participant_id)))].sort(textOrder);
  const byId = new Map(ids.map((key) => [key, { key, votes: {} }]));
  for (const vote of source.votes) byId.get(String(vote.participant_id)).votes[vote.statement_id] = vote.vote;
  const voters = ids.map((id) => byId.get(id));
  const stats = statementStats(statements, voters);
  const consensus = stats.filter((s) => s.responded >= 2 && s.agreeRate >= 0.6)
    .sort((a, b) => b.agreeRate - a.agreeRate || textOrder(a.id, b.id)).slice(0, 4);
  const divisive = stats.filter((s) => s.total >= 2)
    .sort((a, b) => b.split - a.split || textOrder(a.id, b.id)).slice(0, 4);
  const base = {
    analysisVersion: OPINION_ANALYSIS_VERSION,
    voterCount: voters.length, statementCount: statements.length,
    stats, consensus, divisive, groups: [], clusters: [], points: [], youCluster: null,
  };
  if (statements.length < 2 || voters.length < 3) {
    const reason = voters.length < 3 ? 'need-voters' : 'need-statements';
    return { live: { ...base, ok: false, reason }, landscape: {
      available: false, reason, analysisVersion: OPINION_ANALYSIS_VERSION, membershipKind: 'exclusive',
    } };
  }
  const result = analyzePolisInspiredSession(source, OPINION_OPTIONS);
  if (!result.ok && result.reason !== 'insufficient-distinct-opinion-points') {
    throw new Error(`Opinion analysis failed: ${result.reason}`);
  }
  // Identical patterns still form one visible early group; never invent a split.
  const assignments = result.ok ? result.assignments : voters.map((_, i) => ({
    participantIndex: i + 1, groupId: 0, coordinates: [0, 0],
  }));
  const reliability = reliabilitySummary(result.diagnostics);
  const projectionCheck = result.ok ? checkProjectionSensitivity(source, OPINION_OPTIONS, result) : null;
  const provisional = !result.ok || reliability.hardGroupStatus !== 'publishable' || projectionCheck?.changed;
  const xs = assignments.map((a) => a.coordinates[0]);
  const ys = assignments.map((a) => a.coordinates[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-12);
  const position = ([x, y]) => ({ x: round(0.5 + 0.8 * (x - cx) / span, 8), y: round(0.5 - 0.8 * (y - cy) / span, 8) });
  const points = assignments.map((a) => ({
    key: voters[a.participantIndex - 1].key, cluster: a.groupId,
    answered: a.observedVotes ?? Object.keys(voters[a.participantIndex - 1].votes).length,
    ...position(a.coordinates),
  }));
  const groupIds = [...new Set(assignments.map((a) => a.groupId))].sort((a, b) => a - b);
  const groups = groupIds.map((id) => {
    const members = assignments.filter((a) => a.groupId === id);
    const groupStats = statementStats(statements, members.map((a) => voters[a.participantIndex - 1]));
    const enriched = groupStats.map((s) => ({
      ...s, contrast: round(s.agreeRate - stats.find((all) => all.id === s.id).agreeRate),
    })).sort((a, b) => Math.abs(b.contrast) - Math.abs(a.contrast) || b.responded - a.responded || textOrder(a.id, b.id));
    const centre = position([0, 1].map((axis) => members.reduce((n, a) => n + a.coordinates[axis], 0) / members.length));
    const mapped = members.map((a) => position(a.coordinates));
    const average = (fn) => mapped.reduce((sum, point) => sum + fn(point), 0) / mapped.length;
    return {
      id, letter: groupLabel(id), size: members.length,
      position: centre,
      // Snapshot-only geometry, sorted spatially rather than in roster order.
      // Preserve one real projected position per voter, including overlaps.
      dots: mapped.map(({x, y}) => ({x, y})).sort((a, b) => a.x - b.x || a.y - b.y),
      density: opinionDensity(mapped),
      spread: {
        xx: round(average((point) => (point.x - centre.x) ** 2), 6),
        yy: round(average((point) => (point.y - centre.y) ** 2), 6),
        xy: round(average((point) => (point.x - centre.x) * (point.y - centre.y)), 6),
      },
      statements: enriched,
    };
  });
  const landscape = {
    available: true, analysisVersion: OPINION_ANALYSIS_VERSION, membershipKind: 'exclusive',
    method: 'PCA with deterministic k-means and early provisional groups',
    status: provisional ? 'provisional' : 'supported',
    eligibleParticipants: voters.length, excludedParticipants: 0, minimumVotes: 1,
    explainedVariance: (result.diagnostics.pca?.explainedVarianceRatio || [0, 0]).map((value) => round(value)),
    projectionCheck, reliability, groups,
    axes: ['pc1Loading', 'pc2Loading'].map((key) => axisSummary(
      result.diagnostics.pca?.statements || [], new Map(statements.map((s) => [s.id, s.text])), key,
    )),
  };
  return {
    landscape,
    live: { ...base, ok: true, k: groups.length, points,
      clusters: groups.map(({ id, size }) => ({ id, size })),
      groups: groups.map(describeGroup), landscape,
    },
  };
}

export function computeOpinionLandscape(source) {
  return computeSharedOpinionAnalysis(source).landscape;
}
