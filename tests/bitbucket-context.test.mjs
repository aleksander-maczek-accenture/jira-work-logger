import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),cache=new Map();
function url(file){if(cache.has(file))return cache.get(file);let text=fs.readFileSync(path.join(root,file),'utf8');text=text.replace(/from (['"])(\.\/[^'"]+)\1/g,(_,quote,relative)=>'from '+JSON.stringify(url(path.posix.join(path.posix.dirname(file),relative))));const result='data:text/javascript;base64,'+Buffer.from(text).toString('base64');cache.set(file,result);return result;}
const {commitLocation,cleanDiff,enrichCommitDiffs}=await import(url('bitbucket-context.js'));
assert.equal(commitLocation('https://evil.test/a/b/commits/abcdef123'),null);
assert.equal(commitLocation('https://bitbucket.org/a/b/commits/abcdef123').hash,'abcdef123');
assert.ok(!cleanDiff('diff --git a/package-lock.json b/package-lock.json\n+generated\ndiff --git a/src/main.js b/src/main.js\n+validation').includes('generated'));
globalThis.chrome={storage:{local:{get:async()=>({bitbucketSettings:{enabled:true,email:'test',token:'secret'}})}}};
const requests=[];
globalThis.fetch=async (value,options)=>{
  const endpoint=String(value);requests.push(endpoint);
  assert.ok(endpoint.startsWith('https://api.bitbucket.org/2.0/'));
  assert.equal(options.redirect,'error');
  if(endpoint.endsWith('/user'))return Response.json({uuid:'me'});
  if(endpoint.includes('/commit/'))return Response.json({author:{user:{uuid:endpoint.endsWith('abcdef123')?'me':'other'}},date:'2026-11-03T12:00:00Z'});
  return new Response('diff --git a/src/main.js b/src/main.js\n+validation');
};
const result=await enrichCommitDiffs({events:[{type:'commit',url:'https://bitbucket.org/a/b/commits/abcdef123'},{type:'commit',url:'https://bitbucket.org/a/b/commits/abcdef456'}]});
assert.equal(result.events[0].verifiedOwn,true);
assert.ok(result.events[0].diff.includes('validation'));
assert.equal(result.events[1].diff,undefined);
assert.equal(requests.filter(value=>value.includes('/diff/')).length,1);
assert.ok(!JSON.stringify(result).includes('secret'));
globalThis.fetch=async()=>new Response('',{status:403});
assert.match((await enrichCommitDiffs({events:[]})).diffStatus,/niedostepna/);
console.log('OK: Bitbucket URL validation, own authorship, diff filtering and failure status.');

const jiraURL='https://bitbucket.org/%7B%7D/%7B0fb63f54-bbe4-448a-9424-74634d5a5c7b%7D/commits/abcdef123';
assert.equal(commitLocation(jiraURL).workspace,'{}');
assert.equal(commitLocation(jiraURL).repo,'{0fb63f54-bbe4-448a-9424-74634d5a5c7b}');
assert.equal(commitLocation('https://bitbucket.org/a%2fb/repo/commits/abcdef123'),null);
globalThis.fetch=async(value)=>{
  const endpoint=String(value);
  assert.ok(!endpoint.includes('%257B'));
  if(endpoint.endsWith('/user'))return Response.json({uuid:'me'});
  if(endpoint.includes('/commit/')){assert.ok(endpoint.includes('/%7B%7D/%7B0fb63f54-bbe4-448a-9424-74634d5a5c7b%7D/'));return Response.json({author:{user:{uuid:'me'}},date:'2026-11-03T12:00:00Z'});}
  return new Response('diff --git a/main.js b/main.js\n+fix');
};
assert.equal((await enrichCommitDiffs({events:[{type:'commit',url:jiraURL}]})).events[0].verifiedOwn,true);
console.log('OK: Jira encoded UUID links are encoded exactly once, including empty workspace.');
