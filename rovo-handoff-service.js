export function registerRovoHandoff() {
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.type!=='rovo-summary:consume')return;
    (async()=>{
      const source=new URL(sender.url || 'https://invalid.local');
      const id=String(message.id||'');
      if(!sender.tab || source.protocol!=='https:' || !source.hostname.endsWith('.atlassian.net') || !/^[a-f0-9-]{36}$/.test(id))return {ok:false};
      const key=`rovoSummary:${id}`;
      const data=(await chrome.storage.session.get(key))[key];
      if(!data || data.origin!==source.origin)return {ok:false};
      await chrome.storage.session.remove(key);
      if(Date.now()-data.createdAt>10*60*1000)return {ok:false};
      return {ok:true,prompt:data.prompt};
    })().then(sendResponse).catch(()=>sendResponse({ok:false}));
    return true;
  });
}
