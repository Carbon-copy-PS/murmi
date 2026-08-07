import assert from "node:assert/strict";
import test from "node:test";

import { analyzePolisInspiredSession } from "./polis-inspired-analysis.mjs";

function statement(id) {
  return {
    id: "statement-" + id,
    text: "Statement " + id,
    created_at: id,
  };
}

function namedVote(value) {
  if (value === 1) return "agree";
  if (value === -1) return "disagree";
  return "neutral";
}

function polarizedSession({ participants = 30, statements = 12, voteCounts = null } = {}) {
  const statementRows = Array.from({ length: statements }, (_, index) => statement(index));
  const votes = [];
  for (let participant = 0; participant < participants; participant += 1) {
    const group = participant % 2;
    const count = voteCounts ? voteCounts[participant] : statements;
    for (let statementIndex = 0; statementIndex < count; statementIndex += 1) {
      const firstHalf = statementIndex < statements / 2;
      const value = (group === 0) === firstHalf ? 1 : -1;
      votes.push({
        participant_id: "private-participant-" + String(participant).padStart(3, "0"),
        statement_id: statementRows[statementIndex].id,
        vote: namedVote(value),
      });
    }
  }
  return {
    session: { id: "synthetic-session" },
    statements: statementRows,
    votes,
  };
}

test("recovers a deterministic two-group partition and stable bootstrap", () => {
  const source = polarizedSession();
  const options = { bootstrapReplicates: 24, seed: 1234, bootstrapSeed: 5678 };
  const first = analyzePolisInspiredSession(source, options);
  const second = analyzePolisInspiredSession(source, options);

  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.diagnostics.clustering.selectedK, 2);
  assert.deepEqual(first.diagnostics.clustering.groupSizes, [15, 15]);
  assert.equal(first.diagnostics.clustering.selectedSilhouette, 1);
  assert.equal(first.diagnostics.statementBootstrapStability.adjustedRand.median, 1);
  assert.equal(first.diagnostics.statementBootstrapStability.sameKRate, 1);
  assert.equal(first.diagnostics.publicationGuardrails.pass, true);
  assert.equal(first.assignments.length, 30);
  assert.equal(first.representativeStatements.length, 2);

  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes("private-participant"), false);
  assert.equal(serialized.includes("participant_id"), false);
});

test("keeps observed neutral distinct from a missing vote during imputation and counts", () => {
  const source = polarizedSession({ participants: 10, statements: 8 });
  source.votes = source.votes.filter((vote) => !(
    vote.participant_id === "private-participant-000"
      && vote.statement_id === "statement-0"
  ));
  const neutralVote = source.votes.find((vote) => (
    vote.participant_id === "private-participant-002"
      && vote.statement_id === "statement-0"
  ));
  neutralVote.vote = 0;

  const result = analyzePolisInspiredSession(source, { bootstrapReplicates: 0, seed: 8 });
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.eligibleParticipantCount, 10);

  const pcaStatement = result.diagnostics.pca.statements.find((item) => item.statementId === "statement-0");
  assert.equal(pcaStatement.observed, 9);
  // Four nominal agrees become one missing and one neutral: 3 agrees, 5 disagrees.
  assert.ok(Math.abs(pcaStatement.imputationMean - (-2 / 9)) < 1e-12);

  const summary = result.statementSummaries.find((item) => item.statementId === "statement-0");
  assert.equal(summary.observed, 9);
  assert.equal(summary.missing, 1);
  assert.equal(summary.neutral, 1);
  assert.equal(summary.agree, 3);
  assert.equal(summary.disagree, 5);
  assert.equal(summary.decided, 8);
});

test("returns deterministic aggregate soft tendencies whose membership mass reconciles", () => {
  const source = polarizedSession();
  const result = analyzePolisInspiredSession(source, { bootstrapReplicates: 0, seed: 77 });
  const tendencies = result.opinionTendencies;

  assert.equal(tendencies.tendencyCount, 2);
  assert.equal(tendencies.profiles.length, 2);
  const membershipMass = tendencies.profiles.reduce((total, profile) => total + profile.membershipMass, 0);
  assert.ok(Math.abs(membershipMass - result.diagnostics.eligibleParticipantCount) < 1e-9);
  assert.ok(tendencies.profiles.every((profile) => profile.statements.length === 12));
  assert.ok(tendencies.profiles.every((profile) => (
    profile.centroid.length === 2
    && profile.centroid.every(Number.isFinite)
    && Object.values(profile.spread).every(Number.isFinite)
  )));
  assert.equal(JSON.stringify(tendencies).includes("private-participant"), false);
});

test("reports deterministic eligibility sensitivity at 7, 10, and 12 votes", () => {
  const voteCounts = [
    ...new Array(10).fill(7),
    ...new Array(10).fill(10),
    ...new Array(10).fill(12),
  ];
  const source = polarizedSession({ participants: 30, statements: 12, voteCounts });
  const result = analyzePolisInspiredSession(source, { bootstrapReplicates: 0, seed: 42 });

  assert.equal(result.ok, true);
  const sensitivity = result.diagnostics.eligibilitySensitivity;
  assert.deepEqual(
    sensitivity.map((item) => [item.minimumVotes, item.eligibleParticipantCount]),
    [[7, 30], [10, 20], [12, 10]],
  );
  // The response-depth tiers intentionally create extra geometric strata at
  // lower thresholds; the diagnostic must expose, rather than hide, that K is
  // sensitive to eligibility.
  assert.deepEqual(sensitivity.map((item) => item.selectedK), [5, 4, 2]);
  assert.deepEqual(result.diagnostics.observedSelectedKRange, { minimum: 2, maximum: 5 });
});

test("accepts the converter's normalized session shape", () => {
  const raw = polarizedSession({ participants: 12, statements: 8 });
  const normalized = {
    sessionId: "normalized-session",
    statements: raw.statements,
    votes: raw.votes,
    voters: raw.votes.map((vote) => vote.participant_id),
  };
  const result = analyzePolisInspiredSession(normalized, { bootstrapReplicates: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "normalized-session");
  assert.equal(result.diagnostics.participantCount, 12);
});

test("returns a structured non-success result when fewer than three participants are eligible", () => {
  const source = polarizedSession({ participants: 6, statements: 8 });
  for (let index = 0; index < source.votes.length; index += 1) {
    const participant = Number(source.votes[index].participant_id.slice(-3));
    if (participant >= 2 && Number(source.votes[index].statement_id.slice("statement-".length)) >= 6) {
      source.votes[index] = null;
    }
  }
  source.votes = source.votes.filter(Boolean);
  const result = analyzePolisInspiredSession(source, { bootstrapReplicates: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "insufficient-eligible-participants");
  assert.equal(result.diagnostics.eligibleParticipantCount, 2);
  assert.deepEqual(result.assignments, []);
});
