(() => {
  if (document.getElementById('jw-jira-panel')) return;
  const host=document.createElement('div');
  host.id='jw-jira-panel';
  host.style.cssText='position:fixed;left:18px;bottom:18px;z-index:2147483000;';
  const root=host.attachShadow({mode:'closed'});
  root.innerHTML=`<style>
    :host([hidden]){display:none!important}:host{all:initial;font:13px/1.5 system-ui,sans-serif;color:#172033}*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;border:1px solid #d7deea;border-radius:6px;padding:7px 10px;background:#eef2f8;color:#172033}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #3467db;outline-offset:2px}[hidden]{display:none!important}.launcher{display:flex;align-items:center;gap:8px;background:#2557d6;color:white;box-shadow:0 3px 16px #0003;font-weight:650}.dot{width:8px;height:8px;border-radius:50%;background:#c4d6ff}.panel{width:min(370px,calc(100vw - 36px));max-height:calc(100dvh - 100px);overflow:auto;background:#fff;border:1px solid #d7deea;border-radius:12px;box-shadow:0 10px 35px #0003;margin-bottom:10px}.head{display:flex;align-items:center;gap:8px;border-bottom:1px solid #e2e7f0;padding:12px 14px}.head strong{flex:1}.body{padding:14px}h3{font-size:14px;margin:0 0 10px}.title{font-size:13px;margin:0 0 10px;overflow-wrap:anywhere}.status{font-size:11px;color:#667085}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.metric{padding:10px;background:#f2f5fa;border-radius:6px;font-size:11px}.metric strong{display:block;font-size:20px;font-variant-numeric:tabular-nums}.notice{white-space:pre-wrap;background:#edf3ff;padding:10px;border-radius:6px;margin:0 0 12px;font-size:12px}.notice.error{background:#fff0ed;color:#963b28}.form{display:grid;gap:9px;border-top:1px solid #e2e7f0;padding-top:12px}.form label{display:grid;gap:4px;font-size:11px;font-weight:600}input,textarea{width:100%;border:1px solid #cdd6e4;border-radius:5px;padding:7px;color:#172033;background:#fff}textarea{resize:vertical;min-height:65px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.primary{background:#2557d6;color:#fff;border-color:#2557d6}.recent{margin-top:16px}.entry{border-top:1px solid #e2e7f0;padding:8px 0;font-size:11px}.entry header{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums}.entry p{margin:4px 0 0;white-space:pre-wrap;color:#667085;overflow-wrap:anywhere}.footer{display:flex;justify-content:space-between;gap:8px;margin-top:12px}.caption{font-size:10px;color:#667085}.loading{opacity:.65}:host(.loading) .dot{animation:pulse .8s alternate infinite}@keyframes pulse{to{opacity:.2}}@media(prefers-reduced-motion:reduce){:host(.loading) .dot{animation:none}}
  </style>
  <section class="panel" hidden aria-label="Jira Worklogs"><header class="head"><strong>Jira Worklogs</strong><button type="button" id="close" aria-label="Zwin panel">×</button></header><div class="body">
    <h3 id="key"></h3><p id="title" class="title"></p><span id="status" class="status"></span>
    <div id="notice" class="notice" role="status" aria-live="polite"></div>
    <div id="metrics" class="metrics" hidden><div class="metric">Dzisiaj<strong id="todayTime">—</strong></div><div class="metric">Ten miesiac<strong id="monthTime">—</strong><span id="monthCount"></span></div></div>
    <form class="form"><h3>Dodaj moj worklog</h3><div class="fields"><label>Data<input id="date" type="date" required /></label><label>Czas HH:MM<input id="time" value="01:00" pattern="[0-9]+:[0-5][0-9]" required /></label></div><label>Komentarz<textarea id="comment"></textarea></label><button id="save" class="primary" type="submit">Dodaj worklog</button></form>
    <section id="recent" class="recent"></section><div class="footer"><button id="refresh" type="button">Odswiez</button><button id="open" type="button">Otworz rozszerzenie</button></div><p class="caption">Twoje wpisy na tym tickecie · dane pobierane po otwarciu panelu.</p>
  </div></section><button class="launcher" aria-expanded="false"><span class="dot"></span><span id="launcherText">Worklogi</span></button>`;
  const $=id=>root.getElementById(id);
  const panel=root.querySelector('.panel');
  const launcher=root.querySelector('.launcher');
  const form=root.querySelector('form');
  const fmt=seconds=>`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}`;
  const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  let enabled=false;
  let issueKey='',version=0,busy=false,loaded=false,done=false;
  function detectIssue() {
    const url=new URL(location.href);
    const candidate=url.searchParams.get('selectedIssue') || url.searchParams.get('issueKey') || url.pathname.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/i)?.[1] || '';
    return /^[A-Z][A-Z0-9_]*-\d+$/i.test(candidate)?candidate.toUpperCase():'';
  }
  function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
  function setBusy(value){busy=value;host.classList.toggle('loading',value);panel.setAttribute('aria-busy',String(value));form.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=value||done);$('refresh').disabled=value;}
  async function request(type,extra={}) {
    let response;
    try {response=await chrome.runtime.sendMessage({type,issueKey,...extra});}
    catch {throw Error('Polaczenie z dodatkiem wygaslo. Odswiez strone Jira.');}
    if(!response?.ok)throw Error(response?.error || 'Nie udalo sie wykonac operacji.');
    return response;
  }
  async function load(success='') {
    if(busy || !issueKey)return;
    const ticket=issueKey,revision=version;
    setBusy(true);notice('Pobieram Twoje worklogi…');
    try {
      const data=await request('jira-panel:load');
      if(revision!==version || ticket!==issueKey)return;
      $('title').textContent=data.issue.summary;
      $('status').textContent=data.issue.status;
      done=String(data.issue.status).toLowerCase()==='done';
      $('todayTime').textContent=fmt(data.todaySeconds);$('monthTime').textContent=fmt(data.monthSeconds);
      $('monthCount').textContent=`${data.range.dateFrom.slice(0,7)} · wpisy: ${data.monthCount}`;
      $('metrics').hidden=false;loaded=true;
      $('recent').replaceChildren();
      const heading=document.createElement('h3');heading.textContent='Ostatnie Twoje wpisy';$('recent').append(heading);
      if(!data.recent.length){const p=document.createElement('p');p.textContent='Nie masz jeszcze wpisow na tym tickecie.';$('recent').append(p);}
      for(const entry of data.recent){const row=document.createElement('div');row.className='entry';const head=document.createElement('header');const date=document.createElement('span');date.textContent=entry.date;const time=document.createElement('strong');time.textContent=fmt(entry.seconds);head.append(date,time);const comment=document.createElement('p');comment.textContent=entry.comment;row.append(head,comment);$('recent').append(row);}
      notice(success || (done?'Ticket jest DONE. Dodawanie wpisow jest wylaczone.':'Aktualne dane. Formularz zapisuje worklog w Jira.'));
    } catch(error){if(revision===version)notice((success?`${success} `:'')+error.message,true);}
    finally{if(revision===version)setBusy(false);}
  }
  function open(value){panel.hidden=!value;launcher.setAttribute('aria-expanded',String(value));if(value&&!loaded)void load();}
  launcher.addEventListener('click',()=>open(panel.hidden));$('close').addEventListener('click',()=>{open(false);launcher.focus();});
  $('refresh').addEventListener('click',()=>void load());
  $('open').addEventListener('click',()=>request('jira-panel:open').catch(error=>notice(error.message,true)));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||done||!form.reportValidity())return;
    if(!/^(\d+):([0-5]\d)$/.test($('time').value)||$('time').value.split(':').every(n=>Number(n)===0)){notice('Podaj dodatni czas w formacie HH:MM.',true);return;}
    const revision=version;
    const payload={date:$('date').value,timeHHMM:$('time').value,comment:$('comment').value};
    setBusy(true);notice('Zapisuje worklog w Jira…');
    try {
      await request('jira-panel:add',payload);
      if(revision!==version)return;
      $('comment').value='';setBusy(false);
      await load('Worklog zostal dodany.');
    }catch(error){if(revision===version){setBusy(false);notice(error.message,true);}}
  });
  function checkLocation(){
    if(!enabled){host.hidden=true;return;}
    const next=detectIssue();if(next===issueKey)return;
    issueKey=next;version++;busy=false;loaded=false;done=false;
    host.hidden=!issueKey;
    $('key').textContent=issueKey;$('launcherText').textContent='Worklogi';launcher.title=issueKey?`Twoje worklogi · ${issueKey}`:'Twoje worklogi';
    $('date').value=localDate();$('time').value='01:00';$('comment').value='';$('title').textContent='';$('status').textContent='';$('metrics').hidden=true;$('recent').replaceChildren();
    setBusy(false);if(!panel.hidden && issueKey)void load();
  }
  // Mount next to Jira's own corner controls instead of overlaying them.
  const cornerSelector='[data-testid^="layout-controller.ui.bottom-right-corner.container"]';
  function mountBesideRovo(){
    const corner=[...document.querySelectorAll(cornerSelector)].find(element=>{
      const rect=element.getBoundingClientRect();
      return rect.width>0 && rect.height>0;
    });
    if(corner){
      if(host.parentElement!==corner){
        host.style.cssText='position:relative;display:block;flex:0 0 auto;margin-right:12px;z-index:1;';
        corner.insertBefore(host,corner.firstChild);
        panel.style.cssText='position:absolute;right:0;bottom:calc(100% + 12px);margin:0;';
      }
      // Keep the expanded panel within the viewport even in narrow Jira layouts.
      const rect=host.getBoundingClientRect();
      if(rect.width){
        const width=Math.min(370,window.innerWidth-36);
        const right=Math.min(0,rect.right-width-18);
        const maxHeight=Math.max(120,rect.top-30);
        panel.style.right=`${right}px`;
        panel.style.maxHeight=`${maxHeight}px`;
      }
    }else if(host.parentElement!==document.body){
      host.style.cssText='position:fixed;left:18px;bottom:18px;z-index:2147483000;';
      panel.style.cssText='';
      document.body.append(host);
    }
  }
  document.body.append(host);host.hidden=true;
  let mountFrame=0;
  const scheduleMount=()=>{
    if(mountFrame)return;
    mountFrame=requestAnimationFrame(()=>{mountFrame=0;mountBesideRovo();});
  };
  const layoutObserver=new MutationObserver(scheduleMount);
  layoutObserver.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',scheduleMount);
  mountBesideRovo();
  function applyEnabled(value){
    enabled=value!==false;
    version++;busy=false;loaded=false;issueKey='';
    open(false);host.hidden=true;
    if(enabled)checkLocation();
  }
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='sync' && changes.jiraPanelEnabled)applyEnabled(changes.jiraPanelEnabled.newValue);
  });
  chrome.storage.sync.get('jiraPanelEnabled').then(data=>applyEnabled(data.jiraPanelEnabled)).catch(()=>{host.hidden=true;});
  const timer=setInterval(()=>{if(!chrome.runtime?.id){clearInterval(timer);layoutObserver.disconnect();window.removeEventListener("resize",scheduleMount);return;}checkLocation();mountBesideRovo();},1000);
  window.addEventListener('popstate',checkLocation);
})();
