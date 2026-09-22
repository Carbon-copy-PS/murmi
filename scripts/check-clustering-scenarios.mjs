import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {clusteringScenarios} from '../data-analysis/clustering-scenarios.mjs';
import {analyzePolisInspiredSession} from '../data-analysis/polis-inspired-analysis.mjs';
import {OPINION_OPTIONS} from '../shared/opinion-analysis.mjs';
import {layoutOpinionDots} from '../frontend/src/components/opinion-groups/map-layout.js';
const baseline=process.argv[2]?await import(pathToFileURL(path.resolve(process.argv[2]))):null;
const summarize = (run,source) => {
 const result=run(source,OPINION_OPTIONS);
 const groups=result.ok?result.groups.map(g=>g.size):[new Set(source.votes.map(v=>v.participant_id)).size];
 return {groups:groups.length,sizes:groups.sort((a,b)=>a-b),status:result.diagnostics.publicationGuardrails?.recommendation ?? 'withhold-group-claims',
  candidates:result.diagnostics.clustering?.candidates,assignments:result.assignments.length?result.assignments:
    Array.from({length:groups[0]},(_,i)=>({participantIndex:i+1,groupId:0,coordinates:[0,0]}))};
};
const results=clusteringScenarios.map(s=>({id:s.id,label:s.label,expectedSizes:s.expectedSizes,
 before:baseline?summarize(baseline.analyzePolisInspiredSession,s.source):null,
 after:summarize(analyzePolisInspiredSession,s.source)}));
fs.mkdirSync('outputs',{recursive:true});
fs.writeFileSync('outputs/clustering-scenarios.json',JSON.stringify(results,null,2));
for(const s of results)console.log(`${s.id}: ${s.before?JSON.stringify(s.before.sizes)+' -> ':''}${JSON.stringify(s.after.sizes)} (${s.after.status})`);
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#547b63','#b08c49','#5486ae','#94779f','#b17560','#5b9595','#84816a'];
function plot(run,label) {
  const rows=run.assignments;
  const xs=rows.map(r=>r.coordinates[0]),ys=rows.map(r=>r.coordinates[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),1e-12);
  const points=layoutOpinionDots(rows.map(r=>({key:String(r.participantIndex),group:r.groupId,
    x:.5+.8*(r.coordinates[0]-cx)/span,y:.5-.8*(r.coordinates[1]-cy)/span})),true);
  return `<figure><figcaption>${label}: ${run.groups} group${run.groups===1?'':'s'} <small>${run.sizes.join(' + ')} people</small></figcaption>
    <svg viewBox="0 0 600 600" role="img" aria-label="${label}: ${run.groups} groups">${points.map(p=>`<circle cx="${p.plotX}" cy="${p.plotY}" r="7" fill="${colors[p.group%colors.length]}" stroke="white" stroke-width="1.5"/>`).join('')}</svg></figure>`;
}
fs.writeFileSync('outputs/clustering-scenarios.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clustering scenario review</title>
<style>body{font:16px/1.55 system-ui,sans-serif;color:#24272b;background:#f3f4f5;margin:0;padding:32px}main{max-width:1080px;margin:auto}h1{font-size:36px;letter-spacing:-1px}h2{font-size:21px}article{background:white;border-radius:16px;padding:24px;margin:24px 0}.maps{display:grid;grid-template-columns:repeat(${baseline?2:1},minmax(0,1fr));gap:20px}figure{margin:0}figcaption{font-weight:650}small{display:block;font-weight:400;color:#59616b}svg{width:100%;max-height:380px;background:#f6f7f8;margin-top:12px;border-radius:12px}.note{color:#59616b;max-width:850px}@media(max-width:600px){body{padding:16px}.maps{grid-template-columns:1fr}article{padding:18px}}</style>
<main><h1>Clustering scenario review</h1><p>Eleven fictional discussions · one dot per voter · real analysis, no generated prose.</p><p class="note">Dots with identical positions are spread for visibility. Colours identify groups within each map; they do not match identities across maps. A single group can mean insufficient evidence to separate people, not agreement. These checks do not validate population-level claims or live AI generation.</p>
${results.map(r=>`<article><h2>${escape(r.label)}</h2><div class="maps">${r.before?plot(r.before,'Before'):''}${plot(r.after,'After')}</div><p class="note">${r.after.status==='publishable'?'Passes the existing numerical stability checks.':'Provisional: does not pass all publication checks.'}</p></article>`).join('')}</main></html>`);
