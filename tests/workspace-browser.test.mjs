const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:1050},timezoneId:'Europe/Warsaw'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-11-05T12:00:00+01:00')});
await page.route('http://localhost/**',async route=>{
 const file=path.join(root,new URL(route.request().url()).pathname);
 try{await route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':undefined});}catch{await route.fulfill({status:404,body:''});}
});
let createdWorklog=null,postCount=0,fetchGate=null,failSearch=false,chatGate=null,chatCalls=0;
await page.route('https://test.atlassian.net/**',async route=>{
 if(route.request().method()==='POST'&&route.request().url().includes('/worklog')){postCount++;createdWorklog={...route.request().postDataJSON(),id:'new-1',author:{accountId:'me'}};await new Promise(resolve=>setTimeout(resolve,250));return route.fulfill({json:createdWorklog});}
 if(route.request().url().includes('/worklog'))return route.fulfill({json:{worklogs:route.request().url().includes('/TEST-42/')&&createdWorklog?[createdWorklog]:[],total:route.request().url().includes('/TEST-42/')&&createdWorklog?1:0}});
 if(route.request().url().includes('/search')){if(fetchGate)await fetchGate;if(failSearch)return route.fulfill({status:503,json:{error:'Test refresh failed'}});}
 if(route.request().url().includes('/search'))return route.fulfill({json:{issues:[{key:'TEST-42',fields:{summary:'Walidacja formularza zamówienia',status:{name:'In Progress'}}},{key:'TEST-17',fields:{summary:'Eksport zestawienia miesięcznego',status:{name:'To Do'}}}],isLast:true}});
 if(route.request().url().includes('/myself'))return route.fulfill({json:{accountId:'me',displayName:'Test User'}});
 return route.fulfill({status:404,json:{}});
});
await page.route('http://127.0.0.1:11434/**',async route=>{
 if(route.request().url().includes('/api/chat')){chatCalls++;if(chatGate)await chatGate;return route.fulfill({json:{message:{content:JSON.stringify({bullets:['Walidacja formularza TEST-42.']})}}});}
 return route.fulfill({json:{models:[{name:'qwen3:8b'}]}});
});
await page.addInitScript(()=>{
 const rows=[['2026-11-05',14400,'TEST-42','Walidacja formularza zamówienia','Dodano walidację i obsługę błędów.'],['2026-11-05',7200,'TEST-10','Spotkania zespołu','Daily, konsultacje'],['2026-11-04',28800,'TEST-17','Eksport miesięczny','Przygotowanie eksportu'],['2026-11-03',21600,'TEST-42','Walidacja formularza zamówienia','Testy przypadków brzegowych'],['2026-11-02',28800,'TEST-17','Eksport miesięczny','Implementacja eksportu']].map(([date,seconds,issueKey,summary,comment],index)=>({date,seconds,issueKey,summary,comment,worklogId:String(index),started:date+'T09:00:00+0100',timeHHMM:String(seconds/3600).padStart(2,'0')+':00'}));
 const scope='https://test.atlassian.net|test@example.com';
 const local={localAISettings:{enabled:false},localAISummaries:{[scope+'|2026-11-05']:{text:'• Dodano walidację formularza zamówienia (TEST-42).\n• Udział w spotkaniach zespołu.',developmentStatus:'Bitbucket · ten dzien: 3 zdarzen · 3 Twoich commitow',diffStatus:'Analiza kodu · ten dzien: zmiany z 3 Twoich commitow',manual:false}},lastResult:{rows,myIssues:[{issueKey:'TEST-42',summary:'Walidacja formularza zamówienia',status:'In Progress'}],displayName:'Test User',totalHHMM:'26:00',params:{baseUrl:'https://test.atlassian.net',email:'test@example.com',dateFrom:'2026-11-01',dateTo:'2026-11-30'}},lastResultSavedAt:Date.now()};
 for(const date of ['2026-11-02','2026-11-03','2026-11-04'])local.localAISummaries[scope+'|'+date]={text:'Zapisany opis dnia.',manual:false};
 const sync={baseUrl:'https://test.atlassian.net',email:'test@example.com',token:'fake',dateFrom:'2026-11-01',dateTo:'2026-11-30',theme:'classic',meetingIssueKey:'TEST-10',refreshOnReload:false};
 if(new URL(location.href).searchParams.has('overtime')){
  rows.find(row=>row.date==='2026-11-04').seconds=36000;rows.find(row=>row.date==='2026-11-04').timeHHMM='10:00';
  rows.push({date:'2026-11-01',seconds:36000,timeHHMM:'10:00',issueKey:'TEST-42',summary:'Weekend',worklogId:'weekend',started:'2026-11-01T09:00:00+0100',comment:''});
  sync.weeklyHours=[0,4,6,8,8,8,0];local.releaseDates=['2026-11-04'];
 }
 const storage=data=>({get:async key=>typeof key==='string'?{[key]:data[key]}:Array.isArray(key)?Object.fromEntries(key.map(k=>[k,data[k]])):{...data},set:async patch=>Object.assign(data,patch)});
 if(new URL(location.href).searchParams.has('empty')){delete local.lastResult;delete local.lastResultSavedAt;}
 window.chrome={storage:{local:storage(local),sync:storage(sync),onChanged:{addListener(){}}},runtime:{id:'test-extension',sendMessage:async()=>({}),getURL:file=>'http://localhost/'+file},tabs:{create:async({url})=>{window.openedExtensionTab=url;}}};
});
await page.goto('http://localhost/page.html');await page.waitForSelector('#day-2026-11-05 .dayExpand');
assert.deepEqual(errors,[]);
assert.equal(await page.locator('.tabs .tabBtn').count(),3);
assert.equal(await page.locator('#chartCaption').isVisible(),false);
await page.locator('#chartInfo').hover();assert.equal(await page.locator('#chartCaption').isVisible(),true);
await page.mouse.move(0,0);assert.equal(await page.locator('#chartCaption').isVisible(),false);
await page.locator('#chartInfo').focus();assert.equal(await page.locator('#chartCaption').isVisible(),true);
await page.locator('#chartInfo').press('Escape');assert.equal(await page.locator('#chartCaption').isVisible(),false);

assert.equal(await page.locator('#day-2026-11-05 .dayExpand').getAttribute('aria-expanded'),'true');
assert.equal(await page.locator('#day-2026-11-04 .dayExpand').getAttribute('aria-expanded'),'false');
await page.screenshot({path:'/tmp/worklog-ux-main.png',fullPage:true});
for(const id of ['fetchBtn','refreshBtn']){
 const original=await page.locator('#daysList').innerText();
 const width=await page.locator('#refreshBtn').evaluate(el=>el.getBoundingClientRect().width);
 let release;fetchGate=new Promise(resolve=>{release=resolve;});failSearch=true;
 await page.locator('#'+id).click();await page.waitForSelector('body.isFetching');
 assert.equal(await page.locator('#daysList').innerText(),original,'existing data must stay visible while fetching');
 assert.equal(await page.locator('#refreshBtn').evaluate(el=>el.getBoundingClientRect().width),width,'refresh button width must stay stable');
 assert.equal(await page.locator('.loadingShimmerWave').evaluate(el=>getComputedStyle(el).animationName),'worklogDataShimmer');
 const maskCoverage=await page.evaluate(()=>{
  const shapes=[...document.querySelectorAll('#worklogLoadingMask rect')];
  const contains=(shape,rect)=>Number(shape.getAttribute('x'))<=rect.left&&Number(shape.getAttribute('y'))<=rect.top&&Number(shape.getAttribute('x'))+Number(shape.getAttribute('width'))>=rect.right-.5&&Number(shape.getAttribute('y'))+Number(shape.getAttribute('height'))>=rect.bottom-.5;
  return {heading:shapes.some(shape=>shape.dataset.kind==='content'&&contains(shape,document.querySelector('.appHeader h1').getBoundingClientRect())),panel:shapes.some(shape=>shape.dataset.kind==='content'&&contains(shape,document.querySelector('#periodPanel').getBoundingClientRect())),buttons:[...document.querySelectorAll('#periodPanel .actionBar button, #newWorklog')].every(button=>shapes.some(shape=>shape.dataset.kind==='control'&&contains(shape,button.getBoundingClientRect())))};
 });
 assert.ok(maskCoverage.heading&&maskCoverage.panel&&maskCoverage.buttons,'wave covers headings and surfaces while masking out buttons');
 if(id==='fetchBtn')await page.screenshot({path:'/tmp/worklog-ux-loading.png',fullPage:true});
 release();fetchGate=null;await page.waitForSelector('body:not(.isFetching)');assert.equal(await page.locator('.pageLoadingWave').count(),0);
 await page.locator('.appPrompt [data-accept]').click();failSearch=false;
 assert.equal(await page.locator('#daysList').innerText(),original,'failed refresh must preserve cached data');
}
for(const width of [1440,1100,1000,800,600,390]){
 await page.setViewportSize({width,height:1050});
 const fits=await page.locator('#periodPanel').evaluate(panel=>{const outer=panel.getBoundingClientRect(),buttons=[...panel.querySelectorAll('.actionBar button')].map(button=>button.getBoundingClientRect());return buttons.every(rect=>rect.left>=outer.left&&rect.right<=outer.right)&&buttons[0].right<=buttons[1].left;});assert.ok(fits,'period actions fit at '+width);
}
await page.setViewportSize({width:1440,height:1050});

await page.locator('[data-day-filter="missing"]').click();
assert.equal(await page.locator('#daysList .dayCard').count(),2);
await page.locator('[data-day-filter="all"]').click();
await page.locator('#day-2026-11-04 .dayExpand').click();assert.equal(await page.locator('#day-2026-11-04 .dayDetails').isVisible(),true);
await page.locator('#day-2026-11-04 .dayMoreButton').click();
await page.locator('#day-more-2026-11-04 button').filter({hasText:'Notatka'}).click();
assert.equal(await page.locator('#day-2026-11-04 .dayNote').isVisible(),true);
await page.locator('#day-2026-11-04 .dayMoreButton').click();
await page.locator('#day-more-2026-11-04 button').filter({hasText:'Spotkania Teams'}).click();
assert.equal(await page.locator('#meetingsDate').inputValue(),'2026-11-04');
await page.locator('#meetingsDlg button[value="cancel"]').click();
await page.locator('#day-2026-11-04 [data-add-day-worklog]').click();await page.waitForSelector('.issueSearchResult');
assert.equal(await page.locator('#addWorklogDate').inputValue(),'2026-11-04');
await page.locator('#drawerClose').click();
await page.locator('#newWorklog').click();await page.waitForSelector('.issueSearchResult');
assert.equal(await page.locator('#addWorklogDate').inputValue(),'2026-11-05');
await page.locator('.issueSearchResult').first().click();
assert.equal(await page.locator('#addIssueKey').inputValue(),'TEST-42');
await page.screenshot({path:'/tmp/worklog-ux-drawer.png',fullPage:true});
await page.locator('#drawerClose').click();
await page.locator('[data-tab="settings"]').click();assert.equal(await page.locator('#settings-reminders').count(),1);
await page.locator('#settings-reminders > summary').click();assert.equal(await page.locator('#reminderEnabled').isVisible(),true);
await page.locator('[data-tab="assistant"]').click();assert.equal(await page.locator('#bartekAIQuestion').isVisible(),true);
await page.locator('[data-tab="days"]').click();
await page.locator('#toggleChart').click();assert.equal(await page.locator('#chartSection').isVisible(),false);
await page.setViewportSize({width:600,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/worklog-ux-mobile.png',fullPage:true});
await page.locator('[data-tab="settings"]').click();
await page.locator('#localAIEnabled').check();await page.locator('#localAIContext').uncheck();await page.locator('#saveLocalAI').click();
await page.locator('[data-tab="days"]').click();
let finishChat;chatGate=new Promise(resolve=>{finishChat=resolve;});
await page.locator('#day-2026-11-05 .localAISummary').hover();
const retry=page.locator('#day-2026-11-05 .localAIHeadingActions button').filter({hasText:'Wygeneruj ponownie'});
await retry.click();await page.waitForSelector('#day-2026-11-05 .localAIActivity');
assert.equal(await page.locator('#day-2026-11-05 .localAIHeadingActions button').last().isDisabled(),true);
await page.locator('#day-2026-11-05 .localAIHeadingActions button').last().dispatchEvent('click');
assert.equal(await page.locator('#newWorklog').isEnabled(),true,'AI must not block other actions');
const gutter=await page.locator('#day-2026-11-05 .localAISummary').evaluate(el=>({padding:getComputedStyle(el).padding,theme:document.body.dataset.theme}));assert.ok(parseFloat(gutter.padding.split(' ')[1]||gutter.padding)>=12,'AI progress inner gutter: '+JSON.stringify(gutter));
for(const width of [1440,900,600,390]){
 await page.setViewportSize({width,height:1050});
 assert.ok(await page.locator('#day-2026-11-05 .localAISummaryHeading').evaluate(el=>{const outer=el.getBoundingClientRect();return [...el.children].every(child=>{const rect=child.getBoundingClientRect();return rect.left>=outer.left&&rect.right<=outer.right+.5;});}),'AI heading fits at '+width);
}
await page.setViewportSize({width:1440,height:1050});
await page.screenshot({path:'/tmp/worklog-ux-ai-loading.png',fullPage:true});
finishChat();chatGate=null;await page.waitForSelector('#day-2026-11-05 .localAISummary:not(.isGenerating)');assert.equal(chatCalls,1);
for(const theme of ['ledger','bartek','xp','minecraft','audiophile','macos','yellow']){
 await page.setViewportSize({width:1280,height:900});
 await page.locator('[data-tab="settings"]').click();await page.locator('#themeSelect').selectOption(theme);
 await page.locator('[data-tab="days"]').click();
 await page.locator('#newWorklog').click();await page.waitForSelector('.issueSearchResult');
 assert.ok(await page.locator('#addWorklogSaveBtn').isVisible(),theme+' save button');
 await page.locator('#drawerClose').click();
}
await page.locator('#newWorklog').click();await page.waitForSelector('.issueSearchResult');
await page.locator('.issueSearchResult').first().click();
await page.locator('#addWorklogDate').fill('2026-11-04');
await page.locator('#addWorklogComment').fill('Nowy wpis testowy');
await page.locator('#addWorklogSaveBtn').click();
await page.locator('#addWorklogSaveBtn').dispatchEvent('click');
await page.waitForSelector('#workspaceToast');
assert.equal(postCount,1,'saving must not create duplicate worklogs');
assert.equal(await page.locator('#day-2026-11-04 .dayWorklogs li').count(),1);
await page.locator('#newWorklog').click();assert.equal(await page.locator('#addWorklogDate').inputValue(),'2026-11-04');await page.locator('#drawerClose').click();
assert.equal(await page.locator('.appPrompt').count(),0,'success must not open a blocking dialog');
await page.goto('http://localhost/page.html?overtime=1');await page.waitForSelector('[data-over-target]');
assert.equal(await page.locator('[data-over-target]').count(),3);
assert.equal(await page.locator('#monthBalance').innerText(),'40:00');
assert.equal(await page.locator('#periodTarget').innerText(),'132:00');
assert.equal(await page.locator('#periodOvertime').innerText(),'+08:00');
assert.match(await page.locator('#day-2026-11-02 .dayDelta.isOvertime').innerText(),/04:00/);
assert.match(await page.locator('#day-2026-11-04 .dayDelta.isOvertime').innerText(),/02:00/);
assert.equal(await page.locator('[data-over-target="2026-11-04"]').getAttribute('data-excess-seconds'),'7200');
assert.equal(await page.locator('[data-over-target="2026-11-02"]').getAttribute('data-threshold'),'14400');
assert.equal(await page.locator('[data-over-target="2026-11-02"]').getAttribute('data-excess-seconds'),'14400');
assert.equal(await page.locator('[data-over-target="2026-11-01"]').getAttribute('data-threshold'),'28800');
assert.equal(await page.locator('[data-over-target="2026-11-03"]').count(),0,'no stripes when exactly at the daily target');
assert.equal(await page.locator('[data-over-target="2026-11-05"]').count(),0,'no stripes below the daily target');
assert.match(await page.locator('.chartLoggedBar[data-date="2026-11-04"] .chartBar').getAttribute('style'),/releaseDayStripes/);
assert.equal(await page.locator('#overtimeStripes').getAttribute('patternTransform'),'rotate(30)');
await page.screenshot({path:'/tmp/worklog-ux-overtime.png',fullPage:true});
await page.setViewportSize({width:390,height:900});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'time summary fits a narrow screen');
await page.screenshot({path:'/tmp/worklog-ux-overtime-mobile.png',fullPage:true});
await page.goto('http://localhost/popup.html?overtime=1');await page.waitForSelector('.popupDeclared strong');
assert.equal(await page.locator('.popupPeriod').innerText(),'Listopad 2026');
assert.equal(await page.locator('.popupDeclared strong').innerText(),'40:00');
assert.equal(await page.locator('.popupOvertime strong').innerText(),'+08:00');
assert.equal(await page.locator('.popupDetails').getAttribute('open'),null);
await page.locator('.popupBody').screenshot({path:'/tmp/worklog-ux-popup.png'});
await page.locator('#openBtn').click();assert.equal(await page.evaluate(()=>window.openedExtensionTab),'http://localhost/page.html');
await page.goto('http://localhost/popup.html?empty=1');await page.waitForSelector('.popupEmpty');
assert.match(await page.locator('.popupEmpty').innerText(),/Brak pobranych danych/);
assert.deepEqual(errors,[]);console.log('OK: immediate chart tooltip and compact popup; overtime stripes honor daily schedules and weekends; single POST and nonblocking success; three tabs, expansion, missing filter, issue selection, drawer date, settings, assistant and chart toggle.');
} finally { await browser.close(); }
