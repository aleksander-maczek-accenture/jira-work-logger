// One viewport-wide wave. Its mask covers content surfaces and cuts out controls,
// so transparent buttons and the page background never receive a grey overlay.
const SVG_NS='http://www.w3.org/2000/svg';
let stop=null;
const CONTENT='.appHeader h1, .appHeader .eyebrow, .appHeader .lead, .periodTimeSummary, .panel, #fetchActivity';
const CONTROLS='button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], a.primaryBtn, a.secondaryBtn';
function svgElement(name,attributes={}) {
  const node=document.createElementNS(SVG_NS,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
}
function visibleRect(element){
  if(!element.checkVisibility())return null;
  const rect=element.getBoundingClientRect();
  if(!rect.width||!rect.height||rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth)return null;
  return rect;
}
export function setLoadingWave(busy){
  if(!busy){stop?.();stop=null;return;}
  if(stop)return;
  const host=document.createElement('div');host.className='pageLoadingWave';host.setAttribute('aria-hidden','true');host.inert=true;
  const svg=svgElement('svg',{width:'100%',height:'100%'});
  const definitions=svgElement('defs');
  const mask=svgElement('mask',{id:'worklogLoadingMask',x:0,y:0,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse','mask-type':'luminance'});
  const gradient=svgElement('linearGradient',{id:'worklogLoadingGradient',x1:'0%',y1:'0%',x2:'100%',y2:'15%'});
  for(const [offset,opacity] of [['20%',0],['36%',.08],['50%',.24],['64%',.08],['80%',0]])gradient.append(svgElement('stop',{offset,'stop-color':'#949ca8','stop-opacity':opacity}));
  definitions.append(mask,gradient);
  const group=svgElement('g',{mask:'url(#worklogLoadingMask)'});
  const wave=svgElement('rect',{width:'100%',height:'100%',fill:'url(#worklogLoadingGradient)',class:'loadingShimmerWave'});
  group.append(wave);svg.append(definitions,group);host.append(svg);document.body.append(host);
  let frame=0,closed=false;
  function update(){
    frame=0;if(closed)return;
    mask.setAttribute('width',innerWidth);mask.setAttribute('height',innerHeight);
    const shapes=[];
    for(const element of document.querySelectorAll(CONTENT)){
      const rect=visibleRect(element);if(!rect)continue;
      shapes.push(svgElement('rect',{x:rect.left,y:rect.top,width:rect.width,height:rect.height,rx:parseFloat(getComputedStyle(element).borderRadius)||0,fill:'white','data-kind':'content'}));
    }
    // Holes must come after every white shape, including nested panels.
    for(const element of document.querySelectorAll(CONTROLS)){
      const rect=visibleRect(element);if(!rect)continue;
      shapes.push(svgElement('rect',{x:rect.left-2,y:rect.top-2,width:rect.width+4,height:rect.height+4,rx:(parseFloat(getComputedStyle(element).borderRadius)||0)+2,fill:'black','data-kind':'control'}));
    }
    mask.replaceChildren(...shapes);
  }
  function schedule(){if(!closed&&!frame)frame=requestAnimationFrame(update);}
  const mutations=new MutationObserver(records=>{if(records.some(record=>!host.contains(record.target)))schedule();});
  mutations.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','style','open']});
  const resize=new ResizeObserver(schedule);resize.observe(document.documentElement);const app=document.querySelector('.appShell');if(app)resize.observe(app);
  document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
  update();
  stop=()=>{closed=true;cancelAnimationFrame(frame);mutations.disconnect();resize.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);host.remove();};
}
