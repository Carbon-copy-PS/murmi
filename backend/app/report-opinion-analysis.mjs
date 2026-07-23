import process from "node:process";

import { analyzePolisInspiredSession } from "../../data-analysis/polis-inspired-analysis.mjs";

const MINIMUM_PUBLIC_CELL = 5;
const MAX_PRIORITY_STATEMENTS = 3;

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function buildDensity(assignments, columns = 4, rows = 4) {
  const points = assignments
    .map((assignment) => assignment.coordinates)
    .filter((coordinates) => (
      Array.isArray(coordinates)
      && coordinates.length >= 2
      && coordinates.every(Number.isFinite)
    ));
  if (!points.length) {
    return {
      columns,
      rows,
      minimumCellCount: MINIMUM_PUBLIC_CELL,
      participantCount: 0,
      shownParticipants: 0,
      suppressedParticipants: 0,
      maximumCellCount: 0,
      cells: [],
    };
  }

  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);
  const xMinimum = Math.min(...xValues);
  const xMaximum = Math.max(...xValues);
  const yMinimum = Math.min(...yValues);
  const yMaximum = Math.max(...yValues);
  const xSpan = Math.max(Number.EPSILON, xMaximum - xMinimum);
  const ySpan = Math.max(Number.EPSILON, yMaximum - yMinimum);
  const counts = new Map();

  for (const [x, y] of points) {
    const column = Math.min(
      columns - 1,
      Math.floor(columns * (x - xMinimum) / xSpan),
    );
    const rowFromBottom = Math.min(
      rows - 1,
      Math.floor(rows * (y - yMinimum) / ySpan),
    );
    const row = rows - 1 - rowFromBottom;
    const key = `${row},${column}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const cells = [...counts.entries()]
    .map(([key, count]) => {
      const [row, column] = key.split(",").map(Number);
      return { row, column, count };
    })
    .filter((cell) => cell.count >= MINIMUM_PUBLIC_CELL)
    .sort((left, right) => left.row - right.row || left.column - right.column);
  const shownParticipants = cells.reduce((total, cell) => total + cell.count, 0);

  return {
    columns,
    rows,
    minimumCellCount: MINIMUM_PUBLIC_CELL,
    participantCount: points.length,
    shownParticipants,
    suppressedParticipants: points.length - shownParticipants,
    maximumCellCount: Math.max(0, ...cells.map((cell) => cell.count)),
    cells,
  };
}

function statementMap(source) {
  return new Map(
    (source.statements || []).map((statement) => [
      String(statement.id),
      String(statement.text || ""),
    ]),
  );
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

function tendencyProfiles(result, source) {
  const tendencies = result.opinionTendencies;
  if (!tendencies?.profiles?.length) return [];
  const statements = statementMap(source);
  const overall = new Map(
    (result.statementSummaries || []).map((statement) => [
      statement.statementId,
      statement.supportRateDecided,
    ]),
  );
  const domain = tendencies.mapDomain;
  const xSpan = Math.max(Number.EPSILON, domain.xMaximum - domain.xMinimum);
  const ySpan = Math.max(Number.EPSILON, domain.yMaximum - domain.yMinimum);
  const eligibleParticipants = result.diagnostics.eligibleParticipantCount || 0;

  return tendencies.profiles.map((profile) => {
    const statementScores = profile.statements
      .filter((statement) => (
        Number.isFinite(statement.supportRateDecided)
        && statement.coverage >= 0.4
      ))
      .map((statement) => {
        const overallSupport = overall.get(statement.statementId) ?? 0.5;
        const contrast = statement.supportRateDecided - overallSupport;
        return {
          statementId: statement.statementId,
          text: statements.get(String(statement.statementId)) || statement.text,
          supportRate: statement.supportRateDecided,
          coverageRate: statement.coverage,
          contrast,
          priorityScore: (
            0.6 * statement.supportRateDecided
            + 0.4 * Math.max(0, contrast)
          ),
        };
      });
    const priorities = [...statementScores]
      .sort((left, right) => (
        right.priorityScore - left.priorityScore
        || right.coverageRate - left.coverageRate
      ))
      .slice(0, MAX_PRIORITY_STATEMENTS)
      .map((statement) => ({
        statementId: statement.statementId,
        text: statement.text,
        supportRate: round(statement.supportRate),
        coverageRate: round(statement.coverageRate),
        contrast: round(statement.contrast),
      }));
    const distinctive = [...statementScores]
      .sort((left, right) => (
        Math.abs(right.contrast) - Math.abs(left.contrast)
        || right.coverageRate - left.coverageRate
      ))
      .slice(0, MAX_PRIORITY_STATEMENTS)
      .map((statement) => ({
        statementId: statement.statementId,
        text: statement.text,
        direction: statement.contrast >= 0 ? "more-supportive" : "less-supportive",
        supportRate: round(statement.supportRate),
        contrast: round(statement.contrast),
      }));
    return {
      tendencyId: profile.tendencyId,
      membershipMass: round(profile.membershipMass, 2),
      membershipShare: eligibleParticipants
        ? round(profile.membershipMass / eligibleParticipants)
        : 0,
      position: {
        x: round((profile.centroid[0] - domain.xMinimum) / xSpan),
        y: round(1 - (profile.centroid[1] - domain.yMinimum) / ySpan),
      },
      priorities,
      distinctive,
    };
  });
}

function buildPublicResult(source, options) {
  const result = analyzePolisInspiredSession(source, options);
  const diagnostics = result.diagnostics || {};
  if (!result.ok) {
    return {
      available: false,
      reason: result.reason,
      method: diagnostics.method,
      eligibleParticipants: diagnostics.eligibleParticipantCount || 0,
      excludedParticipants: diagnostics.excludedParticipantCount || 0,
      minimumVotes: diagnostics.eligibilityThreshold || options.minimumVotes,
    };
  }

  const profiles = tendencyProfiles(result, source);
  const minimumMass = profiles.length
    ? Math.min(...profiles.map((profile) => profile.membershipMass))
    : 0;
  if (!profiles.length || minimumMass < MINIMUM_PUBLIC_CELL) {
    return {
      available: false,
      reason: "privacy-threshold",
      method: diagnostics.method,
      eligibleParticipants: diagnostics.eligibleParticipantCount,
      excludedParticipants: diagnostics.excludedParticipantCount,
      minimumVotes: diagnostics.eligibilityThreshold,
    };
  }

  const statements = statementMap(source);
  const pcaStatements = diagnostics.pca?.statements || [];
  const density = buildDensity(result.assignments || []);
  return {
    available: true,
    method: "Pol.is-inspired PCA with overlapping fuzzy tendencies",
    caveat: "The tendencies are recurring patterns, not fixed or mutually exclusive groups.",
    eligibleParticipants: diagnostics.eligibleParticipantCount,
    excludedParticipants: diagnostics.excludedParticipantCount,
    minimumVotes: diagnostics.eligibilityThreshold,
    explainedVariance: (diagnostics.pca?.explainedVarianceRatio || [])
      .slice(0, 2)
      .map((value) => round(value)),
    axes: [
      axisSummary(pcaStatements, statements, "pc1Loading"),
      axisSummary(pcaStatements, statements, "pc2Loading"),
    ],
    density,
    tendencies: {
      count: profiles.length,
      profiles,
      overlapSummary: {
        membershipThreshold: round(
          result.opinionTendencies.overlapSummary.membershipThreshold,
        ),
        participantsWithMultipleTendencies: (
          result.opinionTendencies.overlapSummary
            .participantsWithMultipleTendencies
        ),
        eligibleParticipants: (
          result.opinionTendencies.overlapSummary.eligibleParticipants
        ),
      },
    },
  };
}

let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const request = JSON.parse(input);
  const statementCount = request.source?.statements?.length || 0;
  const minimumVotes = Math.min(
    7,
    Math.max(2, Math.ceil(statementCount * 0.3)),
  );
  const result = buildPublicResult(request.source, {
    bootstrapReplicates: 0,
    minimumVotes,
    sensitivityThresholds: [minimumVotes],
  });
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(String(error?.stack || error));
  process.exitCode = 1;
}
