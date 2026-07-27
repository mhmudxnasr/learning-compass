// W2 — tree drilldown + interactive canvas.
// Loaded as external script after the main app code.
// Relies on global: escHtml, fetchRecs, fetchBrain, brainProfile, brainTree, brainHealth, statsData
(function(){
  'use strict';

  // renderTreeTab is called by main app on Tree tab activation.
  window.__treeTab = function(){
    const body=document.getElementById('list-body');
    const rowHeader=document.getElementById('row-header');
    body.style.display='block';rowHeader.style.display='none';body.innerHTML='';
    if(!brainTree){fetchBrain&&fetchBrain();const e=document.createElement('div');e.className='empty';e.textContent='Loading tree...';body.appendChild(e);return;}

    const tb=document.createElement('div');tb.className='tree-toolbar';
    tb.innerHTML='<div class="tree-toolbar-left"><span class="tree-section-label">View</span><button class="view-btn active" data-view="categories">Categories</button><button class="view-btn" data-view="canvas">Canvas</button><button class="view-btn" data-view="all">All nodes</button></div><div class="tree-toolbar-right"><input type="text" id="tree-search" class="form-input tree-search" placeholder="Filter nodes..."></div>';
    body.appendChild(tb);
    const container=document.createElement('div');container.id='tree-view-container';body.appendChild(container);

    tb.querySelectorAll('.view-btn').forEach(btn=>{
      btn.onclick=()=>{
        tb.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        renderTreeView(btn.dataset.view, container);
      };
    });
    document.getElementById('tree-search').oninput=(e)=>{
      window.treeSearchTerm=e.target.value.toLowerCase();
      const active=document.querySelector('.view-btn.active');
      renderTreeView(active?active.dataset.view:'categories', container);
    };
    renderTreeView('categories', container);
  };

  let treeSearchTerm='';
  let currentNode=null;
  let nodeHistory=[];

  function renderTreeView(view, container){
    container.innerHTML='';
    if(view==='categories') renderCategoriesView(container);
    else if(view==='canvas') renderCanvasView(container);
    else if(view==='all') renderAllNodesView(container);
    else if(view==='node' && currentNode) renderNodeDetail(container, currentNode);
  }

  function renderCategoriesView(container){
    const nodes=brainTree.nodes||[];
    const groups={};
    nodes.forEach(n=>{const k=n.super_category||'root';if(!groups[k])groups[k]=[];groups[k].push(n);});
    const order=['cat-faith','cat-mind','cat-body','cat-money','cat-life','cat-tools'];
    const grid=document.createElement('div');grid.className='tree-grid';
    order.forEach(catId=>{
      if(!groups[catId]||!groups[catId].length)return;
      const cat=groups[catId].find(n=>n.id===catId);
      const branches=groups[catId].filter(n=>n.type==='branch'&&n.id!==catId);
      if(!branches.length)return;
      const card=document.createElement('div');card.className='tree-cat';
      let h='<div class="tree-cat-title">'+escHtml(cat?cat.label:catId)+'</div>';
      branches.forEach(b=>{
        if(treeSearchTerm&&!(b.label||'').toLowerCase().includes(treeSearchTerm)&&!b.id.includes(treeSearchTerm))return;
        h+='<div class="tree-branch clickable" data-id="'+escHtml(b.id)+'"><div class="tb-head"><span class="tb-id">'+escHtml(b.id)+'</span>'+(b.status?'<span class="tb-status s-'+escHtml(b.status)+'">'+escHtml(b.status)+'</span>':'')+'<span class="tb-label">'+escHtml(b.label||b.id)+'</span></div></div>';
      });
      card.innerHTML=h;grid.appendChild(card);
    });
    container.appendChild(grid);
    container.querySelectorAll('.tree-branch.clickable').forEach(el=>{el.onclick=()=>openNode(el.dataset.id);});

    if(brainHealth&&brainHealth.byBranch&&brainHealth.byBranch.length){
      const bh=document.createElement('div');bh.className='brain-card';
      let bhh='<div class="brain-card-title">Branch Health <span class="brain-badge">'+brainHealth.byBranch.length+'</span></div><div class="bh-grid">';
      brainHealth.byBranch.forEach(b=>{
        const avg=b.avg_rating?Number(b.avg_rating).toFixed(1):'—';
        bhh+='<div class="bh-cell clickable" data-branch="'+escHtml(b.branch)+'"><span class="bh-branch">'+escHtml(b.branch)+'</span><span class="bh-count">'+b.consumed_count+'</span><span class="bh-avg">avg '+avg+'</span><span class="bh-last">'+escHtml((b.last_consumed||'').slice(0,10))+'</span></div>';
      });
      bhh+='</div>';
      bh.innerHTML=bhh;container.appendChild(bh);
      bh.querySelectorAll('.bh-cell.clickable').forEach(el=>{el.onclick=()=>openNode(el.dataset.branch);});
    }
  }

  function renderCanvasView(container){
    const nodes=brainTree.nodes||[];
    if(!nodes.length)return;
    const withPos = nodes.filter(n=>typeof n.x==='number'&&typeof n.y==='number');
    if(!withPos.length){
      container.innerHTML='<div class="empty">No positional data. Re-seed with the schema migration.</div>';
      return;
    }
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    withPos.forEach(n=>{if(n.x<minX)minX=n.x;if(n.x>maxX)maxX=n.x;if(n.y<minY)minY=n.y;if(n.y>maxY)maxY=n.y;});
    const padX=400,padY=300;
    minX-=padX;maxX+=padX;minY-=padY;maxY+=padY;
    const w=maxX-minX,h=maxY-minY;
    const baseScale=Math.max(0.10,Math.min(0.6,1100/w));
    const wrap=document.createElement('div');wrap.className='canvas-wrap';
    const ctrls=document.createElement('div');ctrls.className='canvas-ctrls';
    ctrls.innerHTML='<button class="canvas-btn" data-act="zoom-in">+</button><button class="canvas-btn" data-act="zoom-out">−</button><button class="canvas-btn" data-act="reset">⤢</button><span class="canvas-info">drag · scroll to zoom · click node</span>';
    wrap.appendChild(ctrls);
    const stage=document.createElement('div');stage.className='canvas-stage';
    const inner=document.createElement('div');inner.className='canvas-inner';
    inner.style.width=(w*baseScale)+'px';
    inner.style.height=(h*baseScale)+'px';
    const byId={};nodes.forEach(n=>{byId[n.id]=n;});
    const SVG_NS='http://www.w3.org/2000/svg';
    const edgesSvg=document.createElementNS(SVG_NS,'svg');
    edgesSvg.setAttribute('class','canvas-edges');
    edgesSvg.setAttribute('width',w*baseScale);
    edgesSvg.setAttribute('height',h*baseScale);
    edgesSvg.setAttribute('viewBox',minX+' '+minY+' '+w+' '+h);
    edgesSvg.setAttribute('preserveAspectRatio','none');
    withPos.forEach(n=>{
      if(!n.parent_id||!byId[n.parent_id])return;
      const p=byId[n.parent_id];
      if(typeof p.x!=='number'||typeof p.y==='number'&&!p.y)return;
      const l=document.createElementNS(SVG_NS,'line');
      l.setAttribute('x1',p.x);l.setAttribute('y1',p.y);
      l.setAttribute('x2',n.x);l.setAttribute('y2',n.y);
      l.setAttribute('class','canvas-edge');
      edgesSvg.appendChild(l);
    });
    inner.appendChild(edgesSvg);
    const statusColors={locked:'var(--state-rejected)',love:'var(--state-active)',fresh:'oklch(0.62 0.16 170)',standard:'var(--ink-secondary)'};
    withPos.forEach(n=>{
      const el=document.createElement('div');
      el.className='canvas-node cn-'+(n.type||'leaf')+(n.status?' s-'+n.status:'');
      el.style.left=(n.x-minX)+'px';
      el.style.top=(n.y-minY)+'px';
      el.dataset.id=n.id;
      const colorMap={'1':'var(--accent)','2':'var(--state-rejected)','3':'var(--state-active)','4':'oklch(0.62 0.16 170)','5':'oklch(0.62 0.16 170)','6':'var(--ink-secondary)'};
      const c=colorMap[n.color]||statusColors[n.status]||'var(--ink-secondary)';
      el.style.borderColor=c;el.style.color=c;
      el.innerHTML='<span class="cn-id">'+escHtml(n.id)+'</span><span class="cn-label">'+escHtml((n.label||n.id).slice(0,40))+'</span>';
      el.onclick=(e)=>{e.stopPropagation();openNode(n.id);};
      inner.appendChild(el);
    });
    stage.appendChild(inner);
    wrap.appendChild(stage);
    container.appendChild(wrap);

    let scale=baseScale,tx=0,ty=0;
    function apply(){inner.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';}
    apply();
    ctrls.querySelector('[data-act=zoom-in]').onclick=()=>{scale=Math.min(2.5,scale*1.2);apply();};
    ctrls.querySelector('[data-act=zoom-out]').onclick=()=>{scale=Math.max(0.05,scale/1.2);apply();};
    ctrls.querySelector('[data-act=reset]').onclick=()=>{scale=baseScale;tx=0;ty=0;apply();};
    let dragging=false,sx=0,sy=0,ox=0,oy=0;
    stage.onmousedown=e=>{dragging=true;sx=e.clientX;sy=e.clientY;ox=tx;oy=ty;stage.style.cursor='grabbing';};
    window.addEventListener('mouseup',()=>{dragging=false;stage.style.cursor='grab';});
    window.addEventListener('mousemove',e=>{if(!dragging)return;tx=ox+(e.clientX-sx);ty=oy+(e.clientY-sy);apply();});
    stage.onwheel=e=>{e.preventDefault();const d=e.deltaY<0?1.1:1/1.1;scale=Math.max(0.05,Math.min(2.5,scale*d));apply();};
    stage.style.cursor='grab';
  }

  function renderAllNodesView(container){
    const nodes=brainTree.nodes||[];
    const filtered=treeSearchTerm?nodes.filter(n=>(n.label||'').toLowerCase().includes(treeSearchTerm)||n.id.includes(treeSearchTerm)):nodes;
    const list=document.createElement('div');list.className='all-nodes';
    const grouped={};
    filtered.forEach(n=>{const k=n.super_category||'root';if(!grouped[k])grouped[k]=[];grouped[k].push(n);});
    const order=['cat-faith','cat-mind','cat-body','cat-money','cat-life','cat-tools','root'];
    order.forEach(cat=>{
      if(!grouped[cat]||!grouped[cat].length)return;
      const catNode=grouped[cat].find(n=>n.id===cat);
      const sec=document.createElement('div');sec.className='all-cat';
      sec.innerHTML='<div class="all-cat-title">'+escHtml(catNode?catNode.label:cat)+' <span class="brain-badge">'+grouped[cat].length+'</span></div>';
      grouped[cat].forEach(n=>{
        if(n.type==='category')return;
        const row=document.createElement('div');
        row.className='all-row clickable';
        row.dataset.id=n.id;
        let statusBadge='';
        if(n.status)statusBadge='<span class="tb-status s-'+escHtml(n.status)+'">'+escHtml(n.status)+'</span>';
        row.innerHTML='<span class="all-id">'+escHtml(n.id)+'</span><span class="all-type t-'+n.type+'">'+n.type+'</span><span class="all-label">'+escHtml(n.label||n.id)+'</span>'+statusBadge;
        row.onclick=()=>openNode(n.id);
        sec.appendChild(row);
      });
      list.appendChild(sec);
    });
    container.appendChild(list);
  }

  function openNode(id){
    if(!id)return;
    if(currentNode&&currentNode.node&&currentNode.node.id!==id)nodeHistory.push(currentNode.node.id);
    const container=document.getElementById('tree-view-container');
    if(!container)return;
    container.innerHTML='<div class="empty">Loading '+escHtml(id)+'...</div>';
    fetch('/brain/node/'+encodeURIComponent(id)).then(r=>r.json()).then(d=>{
      if(d.error){container.innerHTML='<div class="empty">'+escHtml(d.error)+'</div>';return;}
      currentNode=d;
      renderNodeDetail(container, d);
    });
  }

  function renderNodeDetail(container, d){
    if(!d)return;
    const node=d.node;
    const wrap=document.createElement('div');wrap.className='node-detail';
    const bc=document.createElement('div');bc.className='breadcrumb';
    let bcHtml='<a class="bc-link" data-act="home">← Tree</a>';
    if(d.parents){
      d.parents.slice().reverse().forEach(p=>{
        bcHtml+='<span class="bc-sep">/</span><a class="bc-link" data-id="'+escHtml(p.id)+'">'+escHtml(p.label||p.id)+'</a>';
      });
    }
    bc.innerHTML=bcHtml;
    wrap.appendChild(bc);
    bc.querySelectorAll('.bc-link').forEach(el=>{
      el.onclick=()=>{
        if(el.dataset.act==='home'){currentNode=null;renderTreeView('categories',document.getElementById('tree-view-container'));return;}
        openNode(el.dataset.id);
      };
    });

    const head=document.createElement('div');head.className='node-header';
    let headHtml='<div class="node-id-row"><span class="node-type-badge t-'+node.type+'">'+node.type+'</span><span class="node-id-big">'+escHtml(node.id)+'</span>';
    if(node.status)headHtml+='<span class="tb-status s-'+escHtml(node.status)+'">'+escHtml(node.status)+'</span>';
    headHtml+='</div><div class="node-label-big">'+escHtml(node.label||node.id)+'</div><div class="node-meta-row">';
    if(node.super_category)headHtml+='<span class="node-meta">in <b>'+escHtml(node.super_category.replace('cat-',''))+'</b></span>';
    if(node.parent_id)headHtml+='<span class="node-meta">parent: <a class="bc-link" data-id="'+escHtml(node.parent_id)+'">'+escHtml(node.parent_id)+'</a></span>';
    headHtml+='</div>';
    head.innerHTML=headHtml;
    wrap.appendChild(head);
    head.querySelectorAll('.bc-link').forEach(el=>{el.onclick=()=>openNode(el.dataset.id);});

    if(d.children&&d.children.length){
      const ch=document.createElement('div');ch.className='brain-card';
      let h='<div class="brain-card-title">Children <span class="brain-badge">'+d.children.length+'</span></div><div class="children-grid">';
      d.children.forEach(c=>{
        h+='<div class="child-card clickable" data-id="'+escHtml(c.id)+'"><div class="child-head"><span class="child-type t-'+c.type+'">'+c.type+'</span><span class="child-id">'+escHtml(c.id)+'</span>'+(c.status?'<span class="tb-status s-'+escHtml(c.status)+'">'+escHtml(c.status)+'</span>':'')+'</div><div class="child-label">'+escHtml(c.label||c.id)+'</div></div>';
      });
      h+='</div>';
      ch.innerHTML=h;wrap.appendChild(ch);
      ch.querySelectorAll('.child-card.clickable').forEach(el=>{el.onclick=()=>openNode(el.dataset.id);});
    }

    if(d.related_recs&&d.related_recs.length){
      const rec=document.createElement('div');rec.className='brain-card';
      let h='<div class="brain-card-title">Recommendations in this branch <span class="brain-badge">'+d.related_recs.length+'</span></div><div class="rec-list">';
      d.related_recs.forEach(r=>{
        let meta=escHtml(r.creator||'');
        if(r.user_rating&&r.user_rating!=='unset')meta+=' · '+escHtml(r.user_rating);
        if(r.consumed_date&&r.consumed_date!=='unset')meta+=' · '+escHtml(r.consumed_date);
        h+='<div class="rec-row '+escHtml(r.status)+'"><div class="rec-status-dot status-'+escHtml(r.status)+'"></div><div class="rec-info"><div class="rec-title">'+escHtml(r.video_title||'Untitled')+'</div><div class="rec-meta">'+meta+'</div></div>'+(r.video_url?'<a class="rec-link" href="'+escHtml(r.video_url)+'" target="_blank" rel="noopener">↗</a>':'')+'</div>';
      });
      h+='</div>';
      rec.innerHTML=h;wrap.appendChild(rec);
    }

    if(d.siblings&&d.siblings.length){
      const sib=document.createElement('div');sib.className='brain-card';
      let h='<div class="brain-card-title">Siblings <span class="brain-badge">'+d.siblings.length+'</span></div><div class="children-grid">';
      d.siblings.forEach(s=>{
        h+='<div class="child-card clickable" data-id="'+escHtml(s.id)+'"><div class="child-head"><span class="child-type t-'+s.type+'">'+s.type+'</span><span class="child-id">'+escHtml(s.id)+'</span>'+(s.status?'<span class="tb-status s-'+escHtml(s.status)+'">'+escHtml(s.status)+'</span>':'')+'</div><div class="child-label">'+escHtml(s.label||s.id)+'</div></div>';
      });
      h+='</div>';
      sib.innerHTML=h;wrap.appendChild(sib);
      sib.querySelectorAll('.child-card.clickable').forEach(el=>{el.onclick=()=>openNode(el.dataset.id);});
    }

    container.innerHTML='';
    container.appendChild(wrap);
  }
})();
