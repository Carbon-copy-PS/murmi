import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { computeOpinionLandscape, computeSharedOpinionAnalysis } from "../../shared/opinion-analysis.mjs";

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


test("publishes aggregate exclusive groups without participant-level fields", async () => {
  const result = await runWrapper(syntheticSource());
  assert.equal(result.available, true);
  assert.equal(result.membershipKind, 'exclusive');
  assert.equal(result.eligibleParticipants, 30);
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups.reduce((n, group) => n + group.size, 0), 30);
  assert.equal(result.reliability.bootstrapReplicatesRequested, 100);
  assert.equal(result.reliability.bootstrapReplicatesCompleted, 100);
  for (const group of result.groups) {
    assert.ok(group.position.x >= 0 && group.position.x <= 1);
    assert.ok(group.position.y >= 0 && group.position.y <= 1);
    for (const statement of group.statements) {
      assert.equal(statement.agree + statement.neutral + statement.disagree, statement.responded);
      assert.equal(statement.responded + statement.missing, group.size);
    }
  }
  const serialized = JSON.stringify(result);
  for (const forbidden of ['private-participant', 'participant_id', 'participantIndex', 'assignments', 'coordinates', 'points']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("retains a small third pattern as provisional instead of forcing two groups", async () => {
  const result = await runWrapper(smallTendencySource());
  assert.equal(result.groups.length, 3);
  assert.deepEqual(result.groups.map((group) => group.size).sort((a, b) => a - b), [2, 14, 14]);
  assert.equal(result.status, 'provisional');
});

test("keeps early voters with only one response in live and report groups", async () => {
  const source = hualienSource();
  const live = computeSharedOpinionAnalysis(source).live;
  const report = await runWrapper(source);
  assert.equal(report.eligibleParticipants, 8);
  assert.equal(report.excludedParticipants, 0);
  assert.equal(report.minimumVotes, 1);
  assert.equal(report.status, 'provisional');
  assert.deepEqual(live.landscape, report);
  for (const group of report.groups) {
    const keys = new Set(live.points.filter((point) => point.cluster === group.id).map((point) => point.key));
    assert.equal(keys.size, group.size);
    for (const statement of group.statements) {
      const votes = source.votes.filter((v) => keys.has(v.participant_id) && v.statement_id === statement.id);
      assert.equal(statement.responded, votes.length);
      assert.equal(statement.agree, votes.filter((v) => ['agree', 'strongly_agree'].includes(v.vote)).length);
      assert.equal(statement.neutral, votes.filter((v) => v.vote === 'neutral').length);
    }
  }
});

test("missing answers remain missing; replacing one with neutral changes the analysis", () => {
  const source = hualienSource();
  const before = computeSharedOpinionAnalysis(source);
  const after = computeSharedOpinionAnalysis({...source, votes: [...source.votes, {
    participant_id: 'private-participant-7', statement_id: 'transparency', vote: 'neutral',
  }]});
  assert.equal(before.live.stats.find((s) => s.id === 'transparency').missing, 1);
  assert.equal(after.live.stats.find((s) => s.id === 'transparency').missing, 0);
  assert.equal(after.live.stats.find((s) => s.id === 'transparency').neutral, 4);
  assert.notDeepEqual(before.live.points, after.live.points);
});

test("shared analysis matches the report process and survives input reordering", async () => {
  const source = hualienSource();
  const expected = await runWrapper(source);
  assert.deepEqual(computeOpinionLandscape(source), expected);
  assert.deepEqual(computeOpinionLandscape({
    ...source, statements: [...source.statements].reverse(), votes: [...source.votes].reverse(),
  }), expected);
});

test("starts at three voters and two statements without requiring distinct camps", () => {
  const source = { sessionId: 'early', statements: [{id:'a',text:'A'}, {id:'b',text:'B'}],
    votes: ['p1','p2','p3'].map((participant_id) => ({participant_id, statement_id:'a', vote:'agree'})) };
  const result = computeSharedOpinionAnalysis(source);
  assert.equal(result.live.ok, true);
  assert.equal(result.landscape.groups.length, 1);
  assert.equal(result.landscape.groups[0].size, 3);
  assert.equal(result.landscape.status, 'provisional');
  assert.equal(computeOpinionLandscape({...source, votes:source.votes.slice(0,2)}).available, false);
});

test("detects grouping information outside the 2D map without changing its assignments", () => {
  const source = {sessionId:'cube', statements:[0,1,2].map((i)=>({id:`s${i}`,text:`Dimension ${i}`,created_at:i})), votes:[]};
  for (let p=0;p<8;p++) for(let s=0;s<3;s++) source.votes.push({
    participant_id:`p${p}`, statement_id:`s${s}`, vote:(p>>s)&1?'agree':'disagree',
  });
  const {live, landscape} = computeSharedOpinionAnalysis(source);
  const check = landscape.projectionCheck;
  assert.equal(check.dimensionsCompared, 3);
  assert.ok(Math.abs(check.explainedVariance2D - 2/3) < 1e-8);
  assert.ok(Math.abs(check.explainedVarianceCompared - 1) < 1e-8);
  assert.equal(check.changed, true);
  assert.ok(check.adjustedRand < check.agreementThreshold);
  assert.equal(live.k, check.selectedK2D);
  assert.equal(landscape.status, 'provisional');
});

test("viewer markers do not change group identities or exported group evidence", async () => {
  const { computeOpinionClusters } = await import('../../frontend/src/utils/opinion-clusters.js');
  const analysis = computeSharedOpinionAnalysis(hualienSource()).live;
  const first = computeOpinionClusters({opinionAnalysis:analysis, voters:[{key:analysis.points[0].key,isYou:true}]});
  const second = computeOpinionClusters({opinionAnalysis:analysis, voters:[{key:analysis.points.at(-1).key,isYou:true}]});
  assert.deepEqual(first.groups, second.groups);
  assert.deepEqual(first.landscape, second.landscape);
  assert.equal(first.points.filter((point)=>point.isYou).length, 1);
  assert.equal(second.points.filter((point)=>point.isYou).length, 1);
  assert.ok(analysis.points.every((point)=>!point.isYou));
});

test("JSON exports retain canonical group evidence and all exports label provisional groups", async () => {
  const {buildJSON, buildCSV, buildSummary, buildPrintableHTML} = await import('../../frontend/src/utils/export-results.js');
  const cluster = computeSharedOpinionAnalysis(hualienSource()).live;
  const ctx = {cluster, statements:[], lang:'en', voteType:'likert'};
  assert.deepEqual(JSON.parse(buildJSON(ctx)).opinionAnalysis, cluster.landscape);
  for (const build of [buildCSV, buildSummary, buildPrintableHTML]) {
    assert.ok(build(ctx).includes('Groups appear early'));
  }
});

test('coincident participants remain individually visible without changing the analysis', async () => {
  const { layoutOpinionDots, mapPosition } = await import('../../frontend/src/components/opinion-groups/map-layout.js');
  const { live, landscape } = computeSharedOpinionAnalysis(smallTendencySource());
  const original = structuredClone(live.points);
  const displayed = layoutOpinionDots(live.points, true);
  assert.deepEqual(live.points, original);
  assert.equal(new Set(displayed.map(p => `${p.plotX}:${p.plotY}`)).size, live.points.length);
  const reversed = layoutOpinionDots([...live.points].reverse(), true).reverse();
  assert.deepEqual(displayed, reversed);
  const exact = layoutOpinionDots(live.points);
  exact.forEach(p => { assert.equal(p.plotX, mapPosition(p.x)); assert.equal(p.plotY, mapPosition(p.y)); });
  for (const group of landscape.groups) {
    const members = displayed.filter(p => p.cluster === group.id);
    for (const [coordinate, display] of [['x', 'plotX'], ['y', 'plotY']]) {
      const offset = members.reduce((sum, p) => sum + p[display] - mapPosition(p[coordinate]), 0);
      assert.ok(Math.abs(offset) < 1e-8);
    }
    assert.ok(members.every(p => p.answered === 12));
  }
});


test('density follows individual positions and weights, not group centres or display offsets', async () => {
  const { opinionDensity } = await import('../../shared/opinion-density.mjs');
  const one = opinionDensity([{x:.5,y:.5}]);
  const two = opinionDensity([{x:.5,y:.5},{x:.5,y:.5}]);
  const centre = 25 * 51 + 25;
  assert.equal(one.values[centre], 1);
  assert.equal(two.values[centre], 2);
  const lobes = opinionDensity([{x:.2,y:.5},{x:.8,y:.5}]);
  assert.equal(lobes.values[centre], 0, 'do not invent density at the empty centroid');
  assert.ok(lobes.values[25 * 51 + 10] > .9);
  assert.ok(lobes.values[25 * 51 + 40] > .9);
  const {live, landscape} = computeSharedOpinionAnalysis(smallTendencySource());
  for (const group of landscape.groups) {
    assert.deepEqual(group.density, opinionDensity(live.points.filter(p=>p.cluster === group.id)));
  }
});

test('map fitting preserves relative PCA distances without separating groups artificially', async () => {
  const { analyzePolisInspiredSession } = await import('../../data-analysis/polis-inspired-analysis.mjs');
  const { OPINION_OPTIONS } = await import('../../shared/opinion-analysis.mjs');
  const source = smallTendencySource();
  const raw = analyzePolisInspiredSession(source, OPINION_OPTIONS).assignments;
  const mapped = computeSharedOpinionAnalysis(source).live.points;
  assert.equal(new Set(mapped.map(p=>`${p.x}:${p.y}`)).size, 3);
  let scale;
  for (let i=0;i<raw.length;i++) for(let j=i+1;j<raw.length;j++) {
    const before = Math.hypot(...raw[i].coordinates.map((v,axis)=>v-raw[j].coordinates[axis]));
    const after = Math.hypot(mapped[i].x-mapped[j].x,mapped[i].y-mapped[j].y);
    if(before < 1e-9) assert.ok(after < 1e-9);
    else {
      scale ??= after / before;
      assert.ok(Math.abs(after - before * scale) < 1e-7);
    }
  }
});
