import { totalOvertime } from './time-metrics.js';
import { iso } from './reminders.js';
import { fmtHHMM } from './api.js';
import { formatDateRange, monthDates } from './date-range.js';

export function dayMatchesFilter(day,filter) {
  if(filter==='missing')return !day.isVacation&&day.counted&&day.targetSeconds>day.seconds;
  if(filter==='logged')return day.entries.length>0;
  return true;
}

export function installWorkspaceUX({renderDays,openWorklog,openTab,propose,isBusy,getMonthlyTargets=()=>({}),getWorkSchedule=()=>({})}) {
  const $=id=>document.getElementById(id);
  const expanded=new Map();let filter='all',hasData=false,lastEntryDate=iso(new Date());
  // Keep older reports available under Settings instead of giving each a top-level tab.
  for(const [id,label] of [['worklogs','Wszystkie wpisy — tabela'],['workedIssues','Tickety z aktywnością'],['pinnedIssues','Stałe tickety'],['reminders','Harmonogram i przypomnienia']]) {
    document.querySelector(`.tabBtn[data-tab="${id}"]`)?.remove();
    const section=$(id+'Tab');section.classList.remove('tabView','panel');
    const details=document.createElement('details');details.className='settingsSection';details.id=`settings-${id}`;
    const heading=document.createElement('summary');heading.textContent=label;details.append(heading,section);$('settingsTab').append(details);
  }
  $('settingsTab').append(document.querySelector('.appearanceBar'));
  document.querySelector('.tabBtn[data-tab="days"] .tabLabel').textContent='Czas';
  const controls=document.querySelector('.controlsPanel');controls.id='periodPanel';
  document.querySelector('.appHeader').after(document.querySelector('.tabs'));
  const proposal=document.querySelector('.worklogProposalSection');$('drawerAIContent').append(proposal);
  // The assistant's detailed controls belong to the assistant workspace.
  const overview=document.createElement('details');overview.className='assistantOverview';overview.innerHTML='<summary>Bilans miesiąca i ustawienia celu</summary>';
  overview.append($('bartekPanel'));$('assistantTab').append(overview);$('bartekPanel').hidden=false;
  $('bartekClose').hidden=true;$('bartekOpenChat').hidden=true;
  $('bartekToggle').hidden=true;
  $('newWorklog').addEventListener('click',()=>openWorklog('','','',{date:lastEntryDate,timeHHMM:'01:00'}));
  $('showMissingDays').addEventListener('click',()=>{openTab('days');setFilter('missing');$('dayListToolbar').scrollIntoView({behavior:'smooth',block:'start'});});
  $('askAssistant').addEventListener('click',()=>{openTab(hasData?'assistant':'settings');$(hasData?'bartekAIQuestion':'baseUrl').focus();});
  $('dayFilters').addEventListener('click',event=>{const button=event.target.closest('[data-day-filter]');if(button)setFilter(button.dataset.dayFilter);});
  const chartInfo=$('chartInfo'),chartTooltip=$('chartCaption');
  const hideChartInfo=()=>{if(chartTooltip.matches(':popover-open'))chartTooltip.hidePopover();};
  const showChartInfo=()=>{
    if(chartInfo.disabled||!chartTooltip.textContent)return;
    chartTooltip.showPopover();
    const anchor=chartInfo.getBoundingClientRect(),bubble=chartTooltip.getBoundingClientRect();
    chartTooltip.style.left=`${Math.max(8,Math.min(anchor.right-bubble.width,innerWidth-bubble.width-8))}px`;
    chartTooltip.style.top=`${Math.max(8,anchor.bottom+8+bubble.height<=innerHeight?anchor.bottom+8:anchor.top-bubble.height-8)}px`;
  };
  chartInfo.addEventListener('pointerenter',showChartInfo);chartInfo.addEventListener('pointerleave',hideChartInfo);
  chartInfo.addEventListener('focus',showChartInfo);chartInfo.addEventListener('blur',hideChartInfo);
  chartInfo.addEventListener('click',showChartInfo);
  chartInfo.addEventListener('keydown',event=>{if(event.key==='Escape')hideChartInfo();});
  document.addEventListener('scroll',hideChartInfo,true);window.addEventListener('resize',hideChartInfo);
  $('toggleChart').addEventListener('click',()=>{
    hideChartInfo();const figure=$('chartSection'),collapsed=!figure.hidden;figure.hidden=collapsed;$('toggleChart').setAttribute('aria-expanded',String(!collapsed));$('toggleChart').textContent=collapsed?'Pokaż wykres':'Ukryj wykres';
  });
  $('drawerClose').addEventListener('click',()=>$('addWorklogDlg').close());
  $('draftFromAI').addEventListener('click',()=>{const date=$('addWorklogDate').value;$('proposalDate').value=date;$('drawerAI').open=true;propose(date);});
  function setFilter(value){filter=value;for(const button of $('dayFilters').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.dayFilter===value));renderDays();}
  function decorate(card,day,defaultDate) {
    const content=card.querySelector('.dayContent'),head=content.querySelector('.dayHead');
    const body=document.createElement('div');body.id=`day-body-${day.date}`;body.className='dayDetails';
    for(const child of [...content.children])if(child!==head)body.append(child);
    content.append(body);
    const when=head.querySelector('.dayWhen');const toggle=document.createElement('button');toggle.type='button';toggle.className='dayExpand';
    toggle.setAttribute('aria-controls',body.id);toggle.innerHTML='<span class="dayChevron" aria-hidden="true">›</span>';
    toggle.append(...when.childNodes);when.replaceChildren(toggle);
    const apply=()=>{const open=expanded.has(day.date)?expanded.get(day.date):day.date===defaultDate;card.classList.toggle('isCollapsed',!open);body.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`${open?'Zwiń':'Rozwiń'} dzień ${day.date}`);};
    toggle.addEventListener('click',()=>{expanded.set(day.date,toggle.getAttribute('aria-expanded')!=='true');apply();});card.querySelector('.dayMoreMenu')?.addEventListener('click',event=>{if(event.target.closest('button')){expanded.set(day.date,true);apply();}},true);apply();
  }
  function reveal(date){expanded.set(date,true);filter='all';for(const button of $('dayFilters').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.dayFilter==='all'));}
  function update(summary){
    hasData=!!summary;$('askAssistant').textContent=summary?'Zapytaj Bartka':'Połącz Jirę';
    $('newWorklog').disabled=isBusy();
    const missing=summary?.days.filter(day=>dayMatchesFilter(day,'missing'))||[];
    const gap=missing.reduce((sum,day)=>sum+day.targetSeconds-day.seconds,0);
    let target=summary?.days.reduce((sum,day)=>sum+(day.isVacation?0:day.targetSeconds),0)||0;
    const month=summary&&monthDates(summary.dateFrom.slice(0,7)),custom=summary&&getMonthlyTargets()[summary.dateFrom.slice(0,7)];
    if(month&&month.dateFrom===summary.dateFrom&&month.dateTo===summary.dateTo&&Number.isFinite(custom))target=Math.round(custom*3600);
    const overtime=summary?totalOvertime(summary.days,getWorkSchedule()):0;
    $('monthBalance').textContent=summary?fmtHHMM(summary.loggedSeconds):'—';
    $('periodTarget').textContent=summary?fmtHHMM(target):'—';
    $('periodOvertime').textContent=summary?`${overtime?'+':''}${fmtHHMM(overtime)}`:'—';
    $('periodOvertimeCard').classList.toggle('hasOvertime',overtime>0);
    const progress=summary&&target>0?Math.min(100,Math.round(summary.loggedSeconds/target*100)):0;
    $('periodTimeProgressFill').style.width=`${progress}%`;
    $('periodTimeProgress').setAttribute('aria-valuenow',String(progress));
    $('periodTimeProgress').setAttribute('aria-valuetext',summary?`${fmtHHMM(summary.loggedSeconds)} z ${fmtHHMM(target)}; nadgodziny ponad dzienne limity: ${fmtHHMM(overtime)}`:'Brak danych');
    $('workspacePeriod').textContent=summary?formatDateRange(summary):'Wybierz okres i pobierz dane';
    $('attentionText').textContent=missing.length?`${missing.length} dni do uzupełnienia · brakuje ${fmtHHMM(gap)}`:summary?'Wszystkie dotychczasowe dni są uzupełnione.':'Połącz Jirę w Ustawieniach, aby zacząć.';
    $('showMissingDays').hidden=!missing.length;
    $('attentionStrip').classList.toggle('isComplete',!!summary&&!missing.length);
    $('visibleDayCount').textContent=summary?`${summary.days.filter(day=>dayMatchesFilter(day,filter)&&day.date<=iso(new Date())).length} dni`:'';
  }
  let toastTimer;
  function notify(message){
    let toast=$('workspaceToast');if(!toast){toast=document.createElement('div');toast.id='workspaceToast';toast.className='workspaceToast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);}
    toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},7000);
  }
  return {decorate,reveal,update,notify,rememberDate:date=>{lastEntryDate=date;},matches:day=>dayMatchesFilter(day,filter),openLegacy(id){const section=$(`settings-${id}`);if(section){section.open=true;section.scrollIntoView({behavior:'smooth',block:'start'});}},getFilter:()=>filter};
}
