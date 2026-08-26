import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function syntheticSource() {
  const statements = Array.from({ length: 12 }, (_, index) => ({
    id: `statement-${index}`,
    text: `Public statement ${index}`,
    created_at: index,
  }));
  const votes = [];
  for (let participant = 0; participant < 30; participant += 1) {
    for (let statement = 0; statement < statements.length; statement += 1) {
      const firstTendency = participant % 2 === 0;
      const firstHalf = statement < statements.length / 2;
      votes.push({
        participant_id: `private-participant-${participant}`,
        statement_id: statements[statement].id,
        vote: firstTendency === firstHalf ? "agree" : "disagree",
      });
    }
  }
  return { sessionId: "synthetic", statements, votes };
}

function smallTendencySource() {
  const statements = Array.from({ length: 12 }, (_, index) => ({
    id: `statement-${index}`,
    text: `Public statement ${index}`,
    created_at: index,
  }));
  const votes = [];
  for (let participant = 0; participant < 30; participant += 1) {
    for (let statement = 0; statement < statements.length; statement += 1) {
      let vote;
      if (participant < 14) {
        vote = statement < 6 ? "agree" : "disagree";
      } else if (participant < 28) {
        vote = statement < 6 ? "disagree" : "agree";
      } else {
        vote = statement % 2 === 0 ? "agree" : "disagree";
      }
      votes.push({
        participant_id: `private-participant-${participant}`,
        statement_id: statements[statement].id,
        vote,
      });
    }
  }
  return { sessionId: "small-tendency", statements, votes };
}

function hualienSource() {
  const statements = [
    { id: "user-needs", text: "Focus on user needs", created_at: 1 },
    { id: "transparency", text: "Monitor policy implementation", created_at: 2 },
  ];
  const patterns = [
    ["strongly_agree", "strongly_agree"],
    ["strongly_agree", "strongly_agree"],
    ["agree", "agree"],
    ["agree", "strongly_agree"],
    ["strongly_agree", "neutral"],
    ["strongly_agree", "neutral"],
    ["neutral", "neutral"],
    ["agree", null],
  ];
  const votes = [];
  patterns.forEach((pattern, participant) => {
    pattern.forEach((vote, statement) => {
      if (!vote) return;
      votes.push({
        participant_id: `private-participant-${participant}`,
        statement_id: statements[statement].id,
        vote,
      });
    });
  });
  return { sessionId: "hualien-regression", statements, votes };
}

function runWrapper(source) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [new URL("./report-opinion-analysis.mjs", import.meta.url).pathname],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `wrapper exited with ${code}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
    child.stdin.end(JSON.stringify({ source }));
  });
}

test("publishes aggregate tendencies without participant-level fields", async () => {
  const result = await runWrapper(syntheticSource());

  assert.equal(result.available, true);
  assert.equal(result.eligibleParticipants, 30);
  assert.equal(result.tendencies.count, 2);
  assert.equal(result.tendencies.profiles.length, 2);
  assert.ok(result.tendencies.profiles.every((profile) => profile.membershipMass > 0));
  assert.ok(result.tendencies.profiles.every((profile) => (
    Number.isFinite(profile.shape.radiusMajor)
    && Number.isFinite(profile.shape.radiusMinor)
    && Number.isFinite(profile.shape.rotation)
    && profile.shape.radiusMajor >= 0.06
    && profile.shape.radiusMajor <= 0.3
    && profile.shape.radiusMinor >= 0.06
    && profile.shape.radiusMinor <= 0.3
  )));
  assert.ok(result.density.cells.every((cell) => cell.count >= 5));
  assert.equal(result.reliability.bootstrapReplicatesRequested, 100);
  assert.equal(result.reliability.bootstrapReplicatesCompleted, 100);
  assert.equal(result.reliability.bootstrapRuns.length, 100);
  assert.ok(["publishable", "withhold-group-claims"].includes(
    result.reliability.hardGroupStatus,
  ));
  assert.ok(result.reliability.bootstrapRuns.every((run) => (
    Number.isInteger(run.selectedK)
    && Number.isFinite(run.adjustedRand)
  )));

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "private-participant",
    "participant_id",
    "participantIndex",
    "assignments",
    "coordinates",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("limits published opinion analysis to two recurring tendencies", async () => {
  const result = await runWrapper(smallTendencySource());

  assert.equal(result.available, true);
  assert.equal(result.reliability.selectedK, 2);
  assert.equal(result.tendencies.count, 2);
  assert.equal(result.tendencies.profiles.length, 2);

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "private-participant",
    "participant_id",
    "participantIndex",
    "assignments",
    "coordinates",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("does not manufacture a third tendency for the Hualien response pattern", async () => {
  const result = await runWrapper(hualienSource());

  assert.equal(result.available, true);
  assert.equal(result.eligibleParticipants, 7);
  assert.equal(result.excludedParticipants, 1);
  assert.equal(result.reliability.selectedK, 2);
  assert.equal(result.tendencies.count, 2);
  assert.equal(result.tendencies.profiles.length, 2);
  assert.deepEqual(
    result.tendencies.profiles.map((profile) => profile.tendencyId),
    [1, 2],
  );
  assert.ok(result.tendencies.profiles.every((profile) => (
    profile.distinctive.some((statement) => Math.abs(statement.contrast) > 0.1)
  )));
  assert.notDeepEqual(
    result.tendencies.profiles[0].distinctive,
    result.tendencies.profiles[1].distinctive,
  );
});
