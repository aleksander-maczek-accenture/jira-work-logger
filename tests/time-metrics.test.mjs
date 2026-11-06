import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),cache=new Map();
function moduleURL(file){
 if(cache.has(file))return cache.get(file);
 const source=fs.readFileSync(path.join(root,file),'utf8').replace(/from (['"])(\.\/[^'"]+)\1/g,(_,quote,relative)=>'from '+JSON.stringify(moduleURL(path.posix.join(path.posix.dirname(file),relative))));
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(file,url);return url;
}
const {dailyWorkLimit,dailyOvertime,totalOvertime}=await import(moduleURL('time-metrics.js'));
const settings={weeklyHours:[0,4,6,8,8,8,0],dailyTargetHours:8};
const day=(date,hours,target)=>({date,seconds:hours*3600,targetSeconds:target*3600});
assert.equal(dailyOvertime(day('2026-11-02',8,4),settings),4*3600);
assert.equal(dailyOvertime(day('2026-11-03',6,6),settings),0);
assert.equal(dailyOvertime(day('2026-11-05',6,8),settings),0);
assert.equal(dailyWorkLimit(day('2026-11-01',10,0),settings),8*3600);
assert.equal(dailyOvertime(day('2026-11-01',10,0),settings),2*3600);
assert.equal(totalOvertime([day('2026-11-02',8,4),day('2026-11-04',10,8),day('2026-11-01',10,0)],settings),8*3600);
assert.equal(totalOvertime([],settings),0);
console.log('OK: one overtime calculation for daily badges, totals and striped chart segments.');
