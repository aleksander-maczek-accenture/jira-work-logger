import { basicAuthHeader } from './api.js';
import { iso } from './reminders.js';

export function commitLocation(value) {
  try {
    const url=new URL(value);
    if(url.origin!=='https://bitbucket.org')return null;
    const match=url.pathname.match(/^\/([^/]+)\/([^/]+)\/commits?\/([a-f0-9]{7,40})\/?$/i);
    if(!match)return null;
    const workspace=decodeURIComponent(match[1]),repo=decodeURIComponent(match[2]);
    const uuid=/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i;
    const slug=/^[a-z0-9_][a-z0-9_.-]*$/i;
    if(!(slug.test(repo)||uuid.test(repo)))return null;
    if(!(slug.test(workspace)||uuid.test(workspace)||(workspace==='{}'&&uuid.test(repo))))return null;
    return {workspace,repo,hash:match[3]};
  }catch{return null;}
}
async function request(settings,path,signal) {
  const response=await fetch(`https://api.bitbucket.org/2.0/${path}`,{
    headers:{Authorization:basicAuthHeader(settings.email,settings.token),Accept:'application/json'},
    redirect:'error',credentials:'omit',signal
  });
  if(!response.ok) {
    const stage=path==='user'?'konto':path.includes('/commit/')?'odczyt commita':'pobieranie zmian';
    const repository=path.match(/^repositories\/([^/]+)\/([^/]+)/);
    const target=repository?` · ${repository[1]}/${repository[2]}`:'';
    throw Error(`Bitbucket: HTTP ${response.status} · ${stage}${target}${response.status===404?' — repozytorium lub commit nie istnieje albo token nie ma do niego dostepu':response.status===401||response.status===403?' — sprawdz token i uprawnienia':''}`);
  }
  return response;
}
export async function testBitbucket(settings,signal) {
  const user=await (await request(settings,'user',signal)).json();
  if(!user.uuid)throw Error('Bitbucket nie zwrocil tozsamosci konta.');
  return user;
}
export function cleanDiff(raw,limit=9000) {
  return String(raw).split(/(?=^diff --git )/m).filter(block=>!/^diff --git .*?(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.js|\/dist\/|\/vendor\/|\/node_modules\/)/m.test(block))
    .join('').slice(0,limit);
}
export async function enrichCommitDiffs(development,signal) {
  const stored=await globalThis.chrome?.storage?.local?.get('bitbucketSettings');
  const settings=stored?.bitbucketSettings;
  if(!settings?.enabled)return {...development,diffStatus:'Analiza kodu Bitbucket: wylaczona'};
  let checked=0,downloaded=0,limited=false;const failures=[];
  const events=development.events.map(event=>({...event}));
  try {
    const user=await testBitbucket(settings,signal);
    const seen=new Set();
    for(const event of events) {
      if(event.type!=='commit')continue;
      const location=commitLocation(event.url);
      if(!location){limited=true;continue;}
      if(seen.has(event.url))continue;
      seen.add(event.url);
      if(checked>=8){limited=true;continue;}checked++;
      const root=`repositories/${encodeURIComponent(location.workspace)}/${encodeURIComponent(location.repo)}`;
      try {
      const commit=await (await request(settings,`${root}/commit/${location.hash}`,signal)).json();
      if(commit.author?.user?.uuid!==user.uuid)continue;
      event.verifiedOwn=true;
      const timestamp=new Date(commit.date);
      if(Number.isFinite(timestamp.getTime()))event.day=iso(timestamp);
      // Stream with a hard cap instead of downloading an arbitrarily large patch.
      const response=await request(settings,`${root}/diff/${location.hash}`,signal);
      const reader=response.body.getReader(),decoder=new TextDecoder();let raw='';
      try {while(raw.length<60000){const {done,value}=await reader.read();if(done)break;raw+=decoder.decode(value,{stream:true});}}finally{await reader.cancel();}
      event.diff=cleanDiff(raw);event.diffLimited=raw.length>=60000||raw.length>9000;
      downloaded++;limited ||=event.diffLimited;
      }catch(error){if(signal?.aborted)throw error;failures.push(error.message);limited=true;}
    }
    return {...development,events,diffStatus:`Analiza kodu Bitbucket: pobrane zmiany w ${downloaded} wlasnych commitach${limited?' · ograniczony zakres':''}${failures.length?' · '+[...new Set(failures)].join('; '):''}`};
  }catch(error){if(signal?.aborted)throw error;return {...development,events,diffStatus:`Analiza kodu niedostepna · ${error.message}`};}
}
export function installBitbucketSettings(showNotice) {
  const $=id=>document.getElementById(id);
  const read=()=>({enabled:$('bitbucketEnabled').checked,email:$('bitbucketEmail').value.trim(),token:$('bitbucketToken').value.trim()});
  async function save(){const settings=read();if(settings.enabled&&(!settings.email||!settings.token))throw Error('Podaj email i token Bitbucketa.');settings.revision=crypto.randomUUID();await chrome.storage.local.set({bitbucketSettings:settings});$('bitbucketStatus').textContent='Zapisano. Wygeneruj podsumowanie dnia ponownie, aby pobrac zmiany.';}
  $('saveBitbucket').addEventListener('click',()=>void save().catch(error=>showNotice(error.message)));
  $('testBitbucket').addEventListener('click',async()=>{const button=$('testBitbucket');button.disabled=true;try{const user=await testBitbucket(read(),AbortSignal.timeout(15000));$('bitbucketStatus').textContent=`Polaczono: ${user.display_name || user.username}. Dostep do repozytoriow zostanie sprawdzony podczas pobierania commitow.`;}catch(error){$('bitbucketStatus').textContent=error.message;}finally{button.disabled=false;}});
  void chrome.storage.local.get('bitbucketSettings').then(({bitbucketSettings:s})=>{if(!s)return;$('bitbucketEnabled').checked=!!s.enabled;$('bitbucketEmail').value=s.email||'';$('bitbucketToken').value=s.token||'';});
}
