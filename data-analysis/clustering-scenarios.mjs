// Fictional ballots only. Scenarios deliberately separate opinions from coverage.
const A = 1, N = 0, D = -1, M = null;
function source(id, patterns) {
  const statements = patterns[0].length;
  return {sessionId:id, statements:Array.from({length:statements},(_,i)=>({id:`s${i}`,text:`Synthetic proposal ${i+1}`,created_at:i})),
    votes:patterns.flatMap((row,p)=>row.flatMap((v,i)=>v===null?[]:[{
      participant_id:`synthetic-${String(p).padStart(3,'0')}`,statement_id:`s${i}`,vote:v===1?'agree':v===-1?'disagree':'neutral',
    }]))};
}
const repeat = (row,n) => Array.from({length:n},()=>[...row]);
const traffic = [
 [A,A,A,A,A,A,N,A], [A,A,N,D,A,A,N,D], [A,D,D,D,A,A,D,N],
];
const poles = [[A,A,A,A,D,D,D,D],[D,D,D,D,A,A,A,A]];
function noisyPatterns() {
 let seed=29;
 const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 return [0,1,2].flatMap(g=>Array.from({length:20},()=>Array.from({length:12},(_,i)=>{
   const base=Math.floor(i/4)===g?A:D;
   const draw=random();
   return draw<.15?M:draw<.20?N:base;
 })));
}
export const clusteringScenarios = [
 {id:'traffic-partial',label:'Traffic: nine answers to unanimous final question',rows:traffic.flatMap(r=>[...repeat([...r,M],17),...repeat([...r,A],3)]),expectedSizes:[20,20,20]},
 {id:'traffic-complete',label:'Traffic: everyone answers final question',rows:traffic.flatMap(r=>repeat([...r,A],20)),expectedSizes:[20,20,20]},
 {id:'two-clear-camps',label:'Two clear opposing views',rows:poles.flatMap(r=>repeat(r,20)),expectedSizes:[20,20]},
 {id:'uneven-depth',label:'Two views, uneven coverage on varying questions',rows:poles.flatMap(r=>[...repeat(r,10),...repeat(r.map((v,i)=>i>4?M:v),10)]),expectedSizes:[20,20]},
 {id:'small-minority',label:'Two-person minority with a distinct view',rows:[...repeat(poles[0],14),...repeat(poles[1],14),...repeat([A,D,A,D,A,D,A,D],2)],expectedSizes:[2,14,14]},
 {id:'all-agree',label:'Everyone agrees, with uneven response coverage',rows:[...repeat([A,A,A,A],15),...repeat([A,M,A,M],15)],expectedSizes:[30]},
 {id:'no-common-questions',label:'Different answers on disjoint questions',rows:[...repeat([A,A,M,M],15),...repeat([M,M,D,D],15)],expectedSizes:[30]},
 {id:'neutral-distinct',label:'Support, neutral and opposition',rows:[...repeat([A,A,A,A],12),...repeat([N,N,N,N],12),...repeat([D,D,D,D],12)],expectedSizes:[12,12,12]},
 {id:'neutral-vs-missing',label:'Neutral responses plus skipped questions',rows:[...repeat([A,A,A,A],10),...repeat([N,N,N,N],10),...repeat([N,N,M,M],10)],expectedSizes:[10,20]},
 {id:'single-outlier',label:'One dissenting ballot, too little group evidence',rows:[...repeat(poles[0],29),...repeat(poles[1],1)],expectedSizes:[30]},
 {id:'noisy-three-camps',label:'Three views with missing and neutral answers',rows:noisyPatterns(),expectedSizes:[20,20,20]},
].map(({rows,...scenario})=>({...scenario,source:source(scenario.id,rows)}));
