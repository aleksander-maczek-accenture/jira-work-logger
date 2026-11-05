(async()=>{
  const id=location.hash.match(/^#jw-rovo-summary=([a-f0-9-]{36})$/)?.[1];
  if(!id || document.getElementById('jw-rovo-handoff'))return;
  let data;try{data=await chrome.runtime.sendMessage({type:'rovo-summary:consume',id});}catch{return;}
  if(!data?.ok)return;
  history.replaceState(history.state,'',location.pathname+location.search);
  const host=document.createElement('div');host.id='jw-rovo-handoff';
  host.style.cssText='position:fixed;top:76px;left:20px;z-index:2147483001;';
  const root=host.attachShadow({mode:'closed'});
  root.innerHTML=`<style>:host{all:initial;font:13px/1.5 system-ui,sans-serif;color:#172033}*{box-sizing:border-box}.box{width:min(350px,calc(100vw - 40px));padding:16px;background:#fff;border:1px solid #cbd6e7;border-radius:10px;box-shadow:0 8px 30px #0003}header{display:flex;justify-content:space-between;align-items:center}p{margin:10px 0}button{font:inherit;cursor:pointer;border:1px solid #cbd6e7;border-radius:5px;background:#eef3ff;color:#173d99;padding:6px 10px}textarea{box-sizing:border-box;width:100%;height:150px;margin-top:10px;font:11px/1.5 monospace}small{display:block;color:#667085;margin-top:8px}.actions{display:flex;gap:6px;flex-wrap:wrap}</style><section class="box" aria-label="Podsumowanie z Rovo"><header><strong>Podsumowanie z Rovo</strong><button id="close" aria-label="Zamknij">×</button></header><p id="status" role="status">Otworz Rovo, wklej przygotowane pytanie i wyslij. Odpowiedz pojawi sie w czacie Rovo.</p><div class="actions"><button id="copy">Kopiuj pytanie</button><button id="open">Otworz Rovo</button></div><textarea readonly aria-label="Przygotowane pytanie"></textarea><small>Dodatek nie wysyla pytania automatycznie.</small></section>`;
  root.querySelector('textarea').value=data.prompt;
  const status=root.getElementById('status');
  root.getElementById('close').addEventListener('click',()=>host.remove());
  root.getElementById('copy').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(data.prompt);status.textContent='Skopiowano. Wklej pytanie w Rovo i wyslij.';}catch{const text=root.querySelector('textarea');text.focus();text.select();status.textContent='Skopiuj zaznaczony tekst recznie (Ctrl/Cmd+C).';}
  });
  root.getElementById('open').addEventListener('click',()=>{
    const corner=document.querySelector('[data-testid^="layout-controller.ui.bottom-right-corner.container"]');
    const candidate=[...(corner||document).querySelectorAll('button,[role="button"]')].find(button=>/rovo/i.test([button.getAttribute('aria-label'),button.getAttribute('title'),button.textContent].filter(Boolean).join(' ')) && button.getBoundingClientRect().width>0);
    if(candidate){candidate.click();status.textContent='Wklej pytanie do Rovo i wyslij.';}
    else{status.textContent='Kliknij przycisk Rovo w Jira, a potem wklej przygotowane pytanie.';}
  });
  document.body.append(host);
})();
