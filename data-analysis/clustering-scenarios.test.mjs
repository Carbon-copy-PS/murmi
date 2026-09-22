import assert from 'node:assert/strict';
import test from 'node:test';
import {clusteringScenarios} from './clustering-scenarios.mjs';
import {analyzePolisInspiredSession} from './polis-inspired-analysis.mjs';
import {computeSharedOpinionAnalysis, OPINION_OPTIONS} from '../shared/opinion-analysis.mjs';

function samePartition(a,b) {
  return a.every((group,i)=>a.every((other,j)=>(group===other)===(b[i]===b[j])));
}

for (const scenario of clusteringScenarios) test(scenario.label, () => {
  const original = structuredClone(scenario.source);
  const {live,landscape} = computeSharedOpinionAnalysis(scenario.source);
  const expected = scenario.expectedSizes;
  assert.deepEqual(landscape.groups.map(g=>g.size).sort((a,b)=>a-b),expected);
  assert.equal(live.points.length,new Set(scenario.source.votes.map(v=>v.participant_id)).size);
  assert.deepEqual(scenario.source, original, 'analysis never changes source votes');
  const counts=landscape.groups.flatMap(g=>g.statements);
  for(const s of scenario.source.statements) {
    const votes=original.votes.filter(v=>v.statement_id===s.id);
    for(const [field,vote] of [['agree','agree'],['neutral','neutral'],['disagree','disagree']])
      assert.equal(counts.filter(r=>r.id===s.id).reduce((n,r)=>n+r[field],0),votes.filter(v=>v.vote===vote).length);
    assert.equal(counts.filter(r=>r.id===s.id).reduce((n,r)=>n+r.missing,0),live.points.length-votes.length);
  }
  if(['small-minority','single-outlier','no-common-questions'].includes(scenario.id))assert.equal(landscape.status,'provisional');
  const reordered=computeSharedOpinionAnalysis({...original,votes:[...original.votes].reverse(),statements:[...original.statements].reverse()});
  assert.deepEqual(reordered.landscape,landscape);
});

test('answering an otherwise unanimous statement cannot split any traffic pair',()=>{
  const [partial,complete]=clusteringScenarios;
  const a=computeSharedOpinionAnalysis(partial.source).live;
  const b=computeSharedOpinionAnalysis(complete.source).live;
  assert.ok(samePartition(a.points.map(p=>p.cluster),b.points.map(p=>p.cluster)));
  assert.ok(a.points.every((p,i)=>Math.hypot(p.x-b.points[i].x,p.y-b.points[i].y)<1e-7));
});

test('rejects geometric coverage splits and still records rejected candidates',()=>{
  const scenario=clusteringScenarios.find(s=>s.id==='uneven-depth');
  const raw=analyzePolisInspiredSession(scenario.source,OPINION_OPTIONS);
  const candidates=raw.diagnostics.clustering.candidates;
  assert.equal(raw.diagnostics.clustering.selectedK,2);
  assert.ok(candidates.some(c=>c.k>2 && !c.separation.supported));
  assert.equal(candidates.find(c=>c.k===2).separation.supported,true);
});

test('clear and noisy patterns survive several deterministic seeds',()=>{
  for(const id of ['traffic-partial','uneven-depth','small-minority','noisy-three-camps']) {
    const scenario=clusteringScenarios.find(s=>s.id===id);
    const baseline=analyzePolisInspiredSession(scenario.source,{...OPINION_OPTIONS,bootstrapReplicates:0});
    for(const seed of [1,17,1234]) {
      const result=analyzePolisInspiredSession(scenario.source,{...OPINION_OPTIONS,seed,bootstrapReplicates:0});
      assert.ok(samePartition(baseline.assignments.map(a=>a.groupId),result.assignments.map(a=>a.groupId)),id);
    }
  }
});
