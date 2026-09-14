import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source = fs.readFileSync(new URL('../src/lib/catcher-locations.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildCatcherLocations} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const player = (id, pos, started=1) => ({person:{id,fullName:`Player ${id}`},allPositions:[{abbreviation:pos}],stats:{fielding:{gamesStarted:started}}});
const pitch = (code='S', x=0) => ({isPitch:true,details:{call:{code}},pitchData:{coordinates:{pX:x,pZ:2},strikeZoneTop:3,strikeZoneBottom:1}});
const play = (half, hand, events) => ({about:{halfInning:half},matchup:{batSide:{code:hand}},playEvents:events});
const swap = (id,pos,replaced) => ({isSubstitution:true,player:{id},position:{abbreviation:pos},replacedPlayer:{id:replaced}});
const fixture={liveData:{boxscore:{teams:{home:{players:{a:player(1,'C'),b:player(2,'1B')}},away:{players:{c:player(3,'C')}}}},plays:{allPlays:[
 play('top','R',[pitch()]),
 // Events can arrive on the opposite half's play; use roster membership.
 play('bottom','L',[swap(2,'C'),pitch('B')]),
 play('top','L',[pitch('W'),swap(2,'1B'),pitch()]),
 play('top','R',[swap(1,'C'),pitch('T'),pitch('S',null)]),
]}}};
const result=buildCatcherLocations(fixture);
assert.deepEqual(result.catchers.map(c=>[c.id,c.pitches,c.locations.length]),[[1,3,2],[3,1,1],[2,1,1]]);
assert.equal(result.unattributed_pitches,1);
assert.equal(result.catchers[0].locations[0].z,.5);
assert.equal(result.catchers[0].locations[1].swinging_strike,false); // foul tip excluded
assert.equal(result.catchers[2].locations[0].hand,'L');
assert.equal(result.catchers[2].locations[0].swinging_strike,true);
for(const feed of [fixture,{}, {liveData:{plays:{allPlays:[play('top','R',[pitch()])]}}}]) {
 const py=execFileSync(fileURLToPath(new URL('../../../.venv/bin/python',import.meta.url)),['-c','import sys,json; from catcher_intel.catcher_locations import catcher_locations; print(json.dumps(catcher_locations(json.load(sys.stdin))))'],{input:JSON.stringify(feed),encoding:'utf8'});
 assert.deepEqual(buildCatcherLocations(feed),JSON.parse(py));
}
console.log('PASS catcher substitutions, team attribution, missing locations, handedness, swinging strikes, Python parity');
