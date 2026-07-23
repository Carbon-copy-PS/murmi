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
  assert.ok(result.tendencies.profiles.length >= 2);
  assert.ok(result.tendencies.profiles.every((profile) => profile.membershipMass >= 5));
  assert.ok(result.density.cells.every((cell) => cell.count >= 5));

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
