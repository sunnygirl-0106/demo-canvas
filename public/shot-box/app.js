(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const KEY='shot-box-direct-history-v4';
  const settings=()=>({model:'演示模型',resolution:'720p',ratio:'9:16'});
  const prompt='午后的客厅里，穿粉色衣服的小猫坐在沙发上接电话。动作自然，柔和的侧光。';
  function initial(){
    return {version:4,active:'n1',historyNode:null,filter:'all',composerNode:null,selectedRecord:null,counters:{edit:1,extend:1,restored:0},nextNode:4,nextRecord:4,
      records:[
        {id:'r1',name:'版本 01',kind:'generate',file:'clip-8.mp4',image:1,duration:8,prompt,settings:settings(),sourceRecordId:null,createdNode:'n1'},
        {id:'r2',name:'版本 02',kind:'edit',file:'clip-8.mp4',image:3,duration:8,prompt:'保留动作，让小猫的表情更轻松。',settings:settings(),sourceRecordId:'r1',createdNode:'n2'},
        {id:'r3',name:'版本 03',kind:'extend',file:'assets/extension-demo.mp4',image:5,duration:5,prompt:'向后延长，小猫放下电话，望向窗外。',settings:settings(),sourceRecordId:'r2',createdNode:'n3'}
      ],
      nodes:[
        {id:'n1',name:'原视频',x:56,y:145,displayId:'r1',historyIds:['r1','r2'],input:null,draft:{kind:'generate',base:null,text:prompt,settings:settings()}},
        {id:'n2',name:'编辑视频节点 1',x:446,y:145,displayId:'r2',historyIds:['r2','r3'],input:{nodeId:'n1',recordId:'r1'},draft:{kind:'edit',base:'r1',text:'保留动作，让小猫的表情更轻松。',settings:settings()}},
        {id:'n3',name:'延长视频节点 1',x:836,y:145,displayId:'r3',historyIds:['r3'],input:{nodeId:'n2',recordId:'r2'},draft:{kind:'extend',base:'r2',text:'向后延长，小猫放下电话，望向窗外。',settings:settings()}}
      ]};
  }
  let state=initial();
  try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved?.version===4&&saved.nodes?.length&&saved.records?.length)state=saved;}catch{}
  const pending=new Map();let toastTimer,drag=null;
  const node=id=>state.nodes.find(n=>n.id===id), record=id=>state.records.find(r=>r.id===id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kindName=k=>({generate:'生成',edit:'编辑',extend:'延长'}[k]||'');
  const poster=r=>`./assets/take-${r.image}.jpg`;
  const source=r=>r.file.startsWith('assets/')?'./'+r.file:'../media/'+r.file;
  const player=(r,label)=>`<video controls playsinline muted preload="metadata" src="${source(r)}" poster="${poster(r)}" aria-label="${esc(label)}"></video>`;
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));$('#save-state').textContent='本机已保存';}catch{$('#save-state').textContent='当前会话';}}
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3300);}
  function durationFor(n){const base=record(n.draft.base),display=record(n.displayId);return n.draft.kind==='extend'?5:base?.duration||display?.duration||8;}
  function origin(r){return kindName(r.kind)+(r.sourceRecordId?' · 基于 '+record(r.sourceRecordId)?.name:'');}
  function composer(n){
    const base=record(n.draft.base),busy=pending.has(n.id);
    return `<section class="composer" aria-label="${esc(n.name)}的生成面板"><div class="composer-head"><strong>${n.displayId?'重新生成':kindName(n.draft.kind)+'视频'}</strong><button data-close-composer="${n.id}" aria-label="收起生成面板">×</button></div>${base?`<div class="composer-origin">${n.draft.kind==='extend'?'向后延长':'编辑基于'} · ${base.name} · ${base.duration} 秒</div>`:''}<label class="sr-only" for="prompt-${n.id}">提示词</label><textarea id="prompt-${n.id}" data-prompt="${n.id}" rows="3" placeholder="描述这次想生成的内容…">${esc(n.draft.text)}</textarea><div class="composer-foot"><span>演示模型 · ${n.draft.kind==='extend'?'新增 ':''}${durationFor(n)} 秒</span><button class="primary" data-generate="${n.id}" ${busy?'disabled':''}>${busy?'生成中…':n.displayId?'重新生成 ↑':'生成视频 ↑'}</button></div></section>`;
  }
  function renderNodes(){
    $('#nodes').innerHTML=state.nodes.map(n=>{
      const r=record(n.displayId),active=state.active===n.id,busy=pending.has(n.id),src=n.input?record(n.input.recordId):null;
      return `<article class="video-node ${active?'active':''}" id="node-${n.id}" data-node="${n.id}" data-display="${n.displayId||''}" style="left:${n.x}px;top:${n.y}px">${active?`<nav class="node-tools" aria-label="${esc(n.name)}的操作"><button data-derive="edit" data-owner="${n.id}" ${r?'':'disabled'}><span class="tool-icon">✎</span>编辑视频</button><button data-derive="extend" data-owner="${n.id}" ${r?'':'disabled'}><span class="tool-icon">⇥</span>延长视频</button><button data-history="${n.id}" aria-expanded="${state.historyNode===n.id}"><span class="tool-icon">▤</span>历史</button></nav>`:''}<div class="node-heading"><span class="node-grip" data-drag="${n.id}" aria-hidden="true">⠿</span><input class="node-name" aria-label="节点名称" data-name="${n.id}" value="${esc(n.name)}"></div><div class="node-body">${n.input?'<span class="port in"></span>':''}<span class="port out"></span><div class="node-media">${r?player(r,n.name):`<div class="empty-output">${busy?'<span class="spinner"></span>':''}<span>${busy?'正在生成视频':'待生成'}</span><small>${n.draft.kind==='extend'?'只生成新增的 5 秒片段':'在下方填写编辑要求'}</small></div>`}${r?`<span class="node-label">${r.kind==='extend'?'新增片段':kindName(r.kind)}</span>`:''}</div><div class="node-meta"><span>${r?`${r.name} · ${r.duration} 秒`:'草稿已保留'}</span>${r?`<button data-compose="${n.id}">重新生成 ↻</button>`:''}</div><button class="node-history" data-history="${n.id}" aria-expanded="${state.historyNode===n.id}"><span>历史版本 <span class="history-total">${n.historyIds.length}</span></span><span>↗</span></button></div>${src?`<div class="source-line"><img src="${poster(src)}" alt="引用版本"><span>来源</span><button data-inspect="${src.id}">${esc(node(n.input.nodeId)?.name||'原节点')} · ${src.name}</button></div>`:''}${state.composerNode===n.id?composer(n):''}</article>`;
    }).join('');
    positionStage();drawEdges();
  }
  function positionStage(){
    const maxX=Math.max(...state.nodes.map(n=>n.x+340)),maxY=Math.max(...state.nodes.map(n=>n.y+(state.composerNode===n.id?640:390)));
    $('#canvas').style.width=Math.max($('#viewport').clientWidth,maxX+50)+'px';$('#canvas').style.height=Math.max($('#viewport').clientHeight,maxY+60)+'px';
  }
  function drawEdges(){
    const canvas=$('#canvas').getBoundingClientRect();
    const center=(id,side)=>{const r=$(`#node-${id} .port.${side}`).getBoundingClientRect();return{x:r.left+r.width/2-canvas.left,y:r.top+r.height/2-canvas.top};};
    $('#connections').innerHTML=state.nodes.filter(n=>n.input&&node(n.input.nodeId)).map(n=>{const a=center(n.input.nodeId,'out'),b=center(n.id,'in');return `<path data-edge-to="${n.id}" data-source-record="${n.input.recordId}" d="M ${a.x} ${a.y} C ${a.x+55} ${a.y}, ${b.x-55} ${b.y}, ${b.x} ${b.y}"/>`;}).join('');
  }
  function renderHistory(){
    const panel=$('#history-panel'),n=node(state.historyNode);panel.hidden=!n;if(!n)return;
    $('#history-owner').textContent=n.name;
    $('#history-count').textContent=n.historyIds.length;
    const records=n.historyIds.map(record).filter(r=>r&&(state.filter==='all'||r.kind===state.filter));
    $('#history-grid').innerHTML=records.map(r=>`<button class="history-record" data-inspect="${r.id}" aria-label="查看${r.name}"><div class="history-image"><img src="${poster(r)}" alt="${r.name}画面"><span class="duration">${r.kind==='extend'?'新增 ':''}${r.duration}s</span></div><span class="history-name"><span>${r.name}</span><span>↗</span></span><span class="history-kind">${origin(r)}</span></button>`).join('')||'<div class="empty-history">暂无'+(state.filter==='all'?'历史版本':kindName(state.filter)+'记录')+'</div>';
    $$('#history-filters button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===state.filter)));
    positionHistory();
  }
  function positionHistory(){
    if(!state.historyNode)return;const panel=$('#history-panel'),n=node(state.historyNode),view=$('#viewport');if(!n)return;
    const width=panel.offsetWidth||395;let x=n.x+306,y=n.y+32,left=false;
    if(view.clientWidth<720){x=view.scrollLeft+12;y=n.y+35;}
    else if(x+width>view.scrollLeft+view.clientWidth-15&&n.x-width-20>=view.scrollLeft){x=n.x-width-20;left=true;}
    panel.style.left=x+'px';panel.style.top=y+'px';panel.classList.toggle('left',left);
    $('#canvas').style.width=Math.max(parseFloat($('#canvas').style.width),x+width+30)+'px';
    $('#canvas').style.height=Math.max(parseFloat($('#canvas').style.height),y+panel.offsetHeight+70)+'px';
  }
  function render(){renderNodes();renderHistory();}
  function activate(id){state.active=id;state.historyNode=null;render();persist();}
  function showHistory(id){state.active=id;state.historyNode=state.historyNode===id?null:id;state.filter='all';render();persist();}
  function moveIntoView(id){requestAnimationFrame(()=>$('#node-'+id)?.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}));}
  function freePosition(parent){let x=parent?parent.x+390:56,y=parent?parent.y:540;while(state.nodes.some(n=>Math.abs(n.x-x)<300&&Math.abs(n.y-y)<460))y+=540;return{x,y};}
  function derive(parentId,kind){
    const parent=node(parentId),src=record(parent?.displayId);if(!src)return;
    const id='n'+state.nextNode++,name=`${kindName(kind)}视频节点 ${++state.counters[kind]}`,pos=freePosition(parent);
    state.nodes.push({id,name,...pos,displayId:null,historyIds:[],input:{nodeId:parentId,recordId:src.id},draft:{kind,base:src.id,text:kind==='edit'?'':'向后延长，',settings:settings()}});
    state.active=id;state.composerNode=id;state.historyNode=null;render();persist();moveIntoView(id);
    toast(`已创建${name}，使用 ${src.name} 作为素材`);
  }
  function generate(id){
    const n=node(id);if(!n||pending.has(id))return;
    const snapshot=structuredClone(n.draft),first=!n.displayId,input=n.input?{...n.input}:null,previous=record(n.displayId);
    const job={snapshot,timer:null};pending.set(id,job);renderNodes();renderHistory();
    job.timer=setTimeout(()=>{
      if(pending.get(id)!==job)return;const target=node(id);if(!target)return;
      const src=record(snapshot.base),number=state.nextRecord++,rid='r'+number;
      const r={id:rid,name:`版本 ${String(number).padStart(2,'0')}`,kind:snapshot.kind,file:snapshot.kind==='extend'?'assets/extension-demo.mp4':src?.file||previous?.file||'clip-8.mp4',image:(number-1)%6+1,duration:snapshot.kind==='extend'?5:src?.duration||previous?.duration||8,prompt:snapshot.text,settings:snapshot.settings,sourceRecordId:snapshot.base,createdNode:id};
      state.records.push(r);target.historyIds.push(rid);target.displayId=rid;
      // Only this new node's first result is indexed by its immediate source node.
      // Further work belongs to this node; no ancestor traversal takes place.
      if(first&&input){const parent=node(input.nodeId);if(parent&&!parent.historyIds.includes(rid))parent.historyIds.push(rid);}
      pending.delete(id);
      if(state.active===id&&!$('#detail-dialog').open){state.historyNode=id;state.filter='all';}
      render();persist();toast(`${r.name} 已保存；已建立的下游仍引用原来的版本`);
    },1200);
  }
  function inspect(id){
    const r=record(id);if(!r)return;state.selectedRecord=id;const owner=node(state.historyNode)||node(r.createdNode);
    $('#detail-owner').textContent=(owner?.name||'视频')+' · 历史版本';$('#detail-title').textContent=r.name;
    const present=state.nodes.find(n=>n.displayId===id);
    $('#detail-content').innerHTML=`<div class="detail-video">${player(r,r.name)}</div><div class="detail-info"><div class="detail-provenance">${origin(r)}</div><h3>提示词</h3><p class="detail-prompt">${esc(r.prompt||'未填写提示词')}</p><h3>生成设置</h3><dl class="settings"><div><dt>模型</dt><dd>${esc(r.settings.model)}</dd></div><div><dt>清晰度</dt><dd>${esc(r.settings.resolution)}</dd></div><div><dt>画幅</dt><dd>${esc(r.settings.ratio)}</dd></div><div><dt>${r.kind==='extend'?'新增时长':'时长'}</dt><dd>${r.duration} 秒</dd></div></dl>${r.kind==='extend'?'<p class="detail-note">只包含新增片段，未自动拼接。</p>':''}<div class="detail-actions"><button class="primary" data-place="${id}">${present?'在画布中查看 ↗':'添加到画布 ↗'}</button></div></div>`;
    if(!$('#detail-dialog').open)$('#detail-dialog').showModal();persist();
  }
  function closeDetail(){$$('#detail-content video').forEach(v=>v.pause());$('#detail-dialog').close();$(`[data-inspect="${state.selectedRecord}"]`)?.focus({preventScroll:true});}
  function place(id){
    let target=state.nodes.find(n=>n.displayId===id);closeDetail();state.historyNode=null;
    if(!target){const r=record(id),owner=node(state.active),pos=freePosition(owner);target={id:'n'+state.nextNode++,name:'视频节点 '+(++state.counters.restored),...pos,displayId:id,historyIds:[id],input:null,draft:{kind:r.kind,base:r.sourceRecordId,text:r.prompt,settings:structuredClone(r.settings)}};state.nodes.push(target);toast('已添加到画布，原历史记录仍保留');}
    else toast('已定位到这条视频所在的节点');
    state.active=target.id;state.composerNode=null;render();persist();moveIntoView(target.id);
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(b&&!b.disabled){
      if(b.dataset.derive){derive(b.dataset.owner,b.dataset.derive);return;}
      if(b.dataset.history){showHistory(b.dataset.history);return;}
      if(b.dataset.filter){state.filter=b.dataset.filter;renderHistory();persist();return;}
      if(b.dataset.compose){state.active=b.dataset.compose;state.composerNode=b.dataset.compose;state.historyNode=null;render();persist();moveIntoView(b.dataset.compose);return;}
      if(b.dataset.closeComposer){state.composerNode=null;render();persist();return;}
      if(b.dataset.generate){generate(b.dataset.generate);return;}
      if(b.dataset.inspect){inspect(b.dataset.inspect);return;}
      if(b.dataset.place){place(b.dataset.place);return;}
      if(b.id==='close-detail'){closeDetail();return;}
      if(b.id==='close-history'){state.historyNode=null;render();persist();return;}
      if(b.id==='go-root'){activate('n1');moveIntoView('n1');return;}
      if(b.id==='reset'){pending.forEach(job=>clearTimeout(job.timer));pending.clear();state=initial();render();persist();$('#viewport').scrollTo({left:0,top:0});toast('已恢复原视频、编辑节点和延长节点的示例');return;}
    }
    if(e.target.closest('button,input,textarea,video,#history-panel,dialog'))return;
    const article=e.target.closest('.video-node');if(article&&state.active!==article.dataset.node)activate(article.dataset.node);
  });
  document.addEventListener('input',e=>{
    if(e.target.dataset.prompt){node(e.target.dataset.prompt).draft.text=e.target.value;persist();}
    if(e.target.dataset.name){node(e.target.dataset.name).name=e.target.value;renderHistory();persist();}
  });
  document.addEventListener('focusout',e=>{if(e.target.dataset.name){const n=node(e.target.dataset.name);n.name=n.name.trim()||'视频节点';e.target.value=n.name;persist();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#detail-dialog').open&&state.historyNode){state.historyNode=null;render();persist();}if(e.key==='Enter'&&e.target.dataset.name)e.target.blur();});
  $('#detail-dialog').addEventListener('cancel',()=>{$$('#detail-content video').forEach(v=>v.pause());});
  $('#detail-dialog').addEventListener('click',e=>{if(e.target!==$('#detail-dialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDetail();});
  $('#canvas').addEventListener('pointerdown',e=>{const grip=e.target.closest('[data-drag]');if(!grip||e.button!==0)return;const n=node(grip.dataset.drag);drag={id:n.id,startX:e.clientX,startY:e.clientY,x:n.x,y:n.y};grip.setPointerCapture(e.pointerId);e.preventDefault();});
  $('#canvas').addEventListener('pointermove',e=>{if(!drag)return;const n=node(drag.id);n.x=Math.max(12,drag.x+e.clientX-drag.startX);n.y=Math.max(75,drag.y+e.clientY-drag.startY);const el=$('#node-'+n.id);el.style.left=n.x+'px';el.style.top=n.y+'px';positionStage();drawEdges();positionHistory();});
  function endDrag(){if(drag){drag=null;persist();}}
  $('#canvas').addEventListener('pointerup',endDrag);$('#canvas').addEventListener('pointercancel',endDrag);
  new ResizeObserver(()=>{positionStage();positionHistory();}).observe($('#viewport'));
  render();persist();
})();
