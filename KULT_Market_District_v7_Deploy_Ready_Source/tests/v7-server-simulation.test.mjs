import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EPISODES,ARENA_VERSION,generateSnapshot,publicSnapshot,sha256,snapshotMaterial,secureRandom, outcome, safeCap, researchFor, councilFor, utcWeek} from '../lib/arena-v7-engine.ts';
import {SPECIALISTS} from '../lib/agency-engine.ts';
const seeded=(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
test('server-owned snapshot does not expose hidden path in public mission payload',async()=>{
 const snap=generateSnapshot('case-a','aftershock',seeded(97));
 const p=publicSnapshot(snap);
 assert.equal(snap.bars.length,60);
 assert.equal(p.visibleBars.length,48);
 assert.equal('futureBars' in p,false);assert.equal('allBars' in p,false);assert.equal('regime' in p,false);
 assert.equal(publicSnapshot(snap,true).futureBars.length,12);
 const hash=await sha256(snapshotMaterial(snap));assert.match(hash,/^[0-9a-f]{64}$/);
 assert.equal(hash,await sha256(snapshotMaterial(snap)));
 const tampered={...snap,bars:snap.bars.map((x,i)=>i===59?{...x,close:x.close+.1}:x)};
 assert.notEqual(hash,await sha256(snapshotMaterial(tampered)));
 assert.equal(snap.version,ARENA_VERSION);
});
test('all six fictional episode generators produce finite, positive OHLC values and safe risk gates',()=>{
 for(let i=0;i<EPISODES.length;i++)for(let j=0;j<100;j++){
  const ep=EPISODES[i];const snap=generateSnapshot(`${ep.id}-${j}`,ep.id,seeded(9000+i*1000+j));
  assert.equal(snap.bars.length,60);
  assert(snap.bars.every(b=>b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&b.close>0&&b.open>0&&Number.isFinite(b.close)));
  assert([0,1000,2000].includes(safeCap(snap).maxAllocationBps));
  const res=outcome(snap,'HOLD',0);assert.equal(res.pnlCents,0);assert.equal(res.costCents,0);
 }
});
test('risk stress vetoes all directional allocation in circuit mode',()=>{
 for(let j=0;j<100;j++){const s=generateSnapshot('x','circuit',seeded(398+j));assert.equal(safeCap(s).maxAllocationBps,0);}
});
test('every specialist report uses pre-cutoff bars and council decision is reproducible',()=>{
 const s=generateSnapshot('random','weekend',seeded(1927));
 const jobs=SPECIALISTS.map(r=>({specialist:r.id,cost:r.cost,createdAt:'test',report:researchFor(s,r.id)}));
 for(const job of jobs)assert.equal(job.report.sourceCutoff,48);
 assert.deepEqual(councilFor(s,jobs),councilFor(s,jobs));
 assert.deepEqual(safeCap(s),councilFor(s,jobs).risk);
});
test('week boundaries are UTC and stable',()=>{
 assert.equal(utcWeek(Date.parse('2026-11-03T12:00:00Z')),'2026-11-02');
 assert.equal(utcWeek(Date.parse('2026-11-08T23:59:59Z')),'2026-11-02');
 assert.equal(utcWeek(Date.parse('2026-11-09T00:00:00Z')),'2026-11-09');
});
