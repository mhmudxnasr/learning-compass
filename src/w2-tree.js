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

  // ====== W6: Inline Preview ======
  window.showVaultPreview = function(id, filename, htmlId) {
    var panel = document.getElementById('vault-preview');
    var fnameEl = document.getElementById('vault-preview-filename');
    var iframe = document.getElementById('vault-preview-iframe');
    if (!panel || !fnameEl || !iframe) return;
    var fileUrl = '/html/download/' + id;
    fnameEl.textContent = filename;
    fnameEl.dataset.url = fileUrl;
    iframe.src = fileUrl;
    panel.classList.add('open');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window.closeVaultPreview = function() {
    var panel = document.getElementById('vault-preview');
    var iframe = document.getElementById('vault-preview-iframe');
    if (panel) panel.classList.remove('open');
    if (iframe) iframe.src = '';
  };

  // ====== W6: Theme Switcher ======
  window.setTheme = function(theme) {
    var b = document.body;
    b.classList.remove('theme-dark', 'theme-light', 'theme-reader');
    if (theme !== 'dark') b.classList.add('theme-' + theme);
    // Update button active states
    var btns = document.querySelectorAll('#theme-prefs .prefs-btn');
    btns.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    localStorage.setItem('tme-theme', theme);
  };

  // ====== W6: Density Control ======
  window.setDensity = function(density) {
    document.body.setAttribute('data-density', density);
    var btns = document.querySelectorAll('#density-prefs .prefs-btn');
    btns.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.density === density);
    });
    localStorage.setItem('tme-density', density);
  };

  // ====== W6: Restore Preferences on Load ======
  (function() {
    var savedTheme = localStorage.getItem('tme-theme');
    if (savedTheme) window.setTheme(savedTheme);
    var savedDensity = localStorage.getItem('tme-density');
    if (savedDensity) window.setDensity(savedDensity);
  })();

  // ============================================================
  // W3 — Pattern Surfacing Panel (Profile tab enhancement)
  // ============================================================

  window.__w3FetchResurfacing = function() {
    return fetch('/brain/resurfacing').then(function(r) { return r.json(); }).catch(function() { return { items: [] }; });
  };

  window.__w3FetchContradictions = function() {
    return fetch('/brain/contradictions').then(function(r) { return r.json(); }).catch(function() { return { contradictions: [] }; });
  };

  function w3HealthClass(avg, count) {
    if (!avg || !count) return 'h-unknown';
    if (avg >= 4.0) return 'h-thriving';
    if (avg >= 3.0) return 'h-healthy';
    if (avg >= 2.0) return 'h-struggling';
    return 'h-atrisk';
  }

  window.__w3PatternPanel = function(body) {
    var existing = document.getElementById('w3-pattern-surf');
    if (existing) existing.remove();

    var wrap = document.createElement('div');
    wrap.className = 'pattern-surf';
    wrap.id = 'w3-pattern-surf';

    var card = document.createElement('div');
    card.className = 'ps-card';
    card.innerHTML = '<div class="ps-title">Pattern Surfacing <span class="ps-badge">W3</span></div>';

    var tabs = document.createElement('div');
    tabs.className = 'ps-tabs';
    var tabDefs = [
      { id: 'resurf', label: 'Resurfacing' },
      { id: 'contradict', label: 'Contradictions' },
      { id: 'health', label: 'Branch Health' },
      { id: 'creep', label: 'Mastery Creep' },
      { id: 'diminish', label: 'Diminishing Returns' }
    ];
    tabDefs.forEach(function(t, i) {
      var btn = document.createElement('button');
      btn.className = 'ps-tab' + (i === 0 ? ' active' : '');
      btn.textContent = t.label;
      btn.dataset.pstab = t.id;
      tabs.appendChild(btn);
    });
    card.appendChild(tabs);

    var content = document.createElement('div');
    content.id = 'w3-ps-content';
    card.appendChild(content);
    wrap.appendChild(card);
    body.appendChild(wrap);

    var currentPSTab = 'resurf';
    var resurfData = null;
    var contradictData = null;

    tabs.addEventListener('click', function(e) {
      var btn = e.target.closest('.ps-tab');
      if (!btn) return;
      tabs.querySelectorAll('.ps-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentPSTab = btn.dataset.pstab;
      renderPSTab(currentPSTab);
    });

    function renderPSTab(tab) {
      content.innerHTML = '';
      if (tab === 'resurf') renderResurfacing(content);
      else if (tab === 'contradict') renderContradictions(content);
      else if (tab === 'health') renderBranchHealth(content);
      else if (tab === 'creep') renderMasteryCreep(content);
      else if (tab === 'diminish') renderDiminishingReturns(content);
    }

    function renderResurfacing(el) {
      if (resurfData) { renderResurfList(el, resurfData); return; }
      el.innerHTML = '<div class="empty-pattern">Loading resurfacing data...</div>';
      window.__w3FetchResurfacing().then(function(d) { resurfData = d; renderResurfList(el, d); });
    }

    function renderResurfList(el, d) {
      var items = d.items || [];
      var overdue = items.filter(function(i) { return (i.status === 'overdue' || i.due_status === 'overdue'); });
      var upcoming = items.filter(function(i) { return (i.status === 'upcoming' || i.due_status === 'upcoming'); });

      if (!items.length) {
        el.innerHTML = '<div class="empty-pattern">No resurfacing items. All caught up.</div>';
        return;
      }

      var html = '<div class="ps-sub">Overdue (' + overdue.length + ') \u00B7 Upcoming (' + upcoming.length + ')</div>';

      if (overdue.length) {
        html += '<div class="resurf-list">';
        overdue.forEach(function(item) {
          var wl = item.window_days ? item.window_days + 'd' : '';
          var wc = 'resurf-window';
          if (item.window_days <= 30) wc += ' w-30';
          else if (item.window_days <= 90) wc += ' w-90';
          else wc += ' w-180';
          html += '<div class="resurf-row overdue">';
          if (wl) html += '<span class="' + wc + '">' + wl + '</span>';
          html += '<span class="resurf-label">' + escHtml(item.title || item.video_title || item.id || 'Unknown') + '</span>';
          if (item.branch || item.branch_id) html += '<span class="resurf-branch">' + escHtml(item.branch || item.branch_id) + '</span>';
          if (item.due_date || item.next_due) html += '<span class="resurf-due">' + escHtml((item.due_date || item.next_due || '').slice(0, 10)) + '</span>';
          html += '</div>';
        });
        html += '</div>';
      }

      if (upcoming.length) {
        if (overdue.length) html += '<div class="ps-sub" style="margin-top:12px">Upcoming</div>';
        html += '<div class="resurf-list">';
        upcoming.forEach(function(item) {
          var wl = item.window_days ? item.window_days + 'd' : '';
          var wc = 'resurf-window';
          if (item.window_days <= 30) wc += ' w-30';
          else if (item.window_days <= 90) wc += ' w-90';
          else wc += ' w-180';
          html += '<div class="resurf-row upcoming">';
          if (wl) html += '<span class="' + wc + '">' + wl + '</span>';
          html += '<span class="resurf-label">' + escHtml(item.title || item.video_title || item.id || 'Unknown') + '</span>';
          if (item.branch || item.branch_id) html += '<span class="resurf-branch">' + escHtml(item.branch || item.branch_id) + '</span>';
          if (item.due_date || item.next_due) html += '<span class="resurf-due">' + escHtml((item.due_date || item.next_due || '').slice(0, 10)) + '</span>';
          html += '</div>';
        });
        html += '</div>';
      }

      el.innerHTML = html;
    }

    function renderContradictions(el) {
      if (contradictData) { renderContradictList(el, contradictData); return; }
      el.innerHTML = '<div class="empty-pattern">Loading contradictions...</div>';
      window.__w3FetchContradictions().then(function(d) { contradictData = d; renderContradictList(el, d); });
    }

    function renderContradictList(el, d) {
      var items = d.contradictions || d.items || [];
      if (!items.length) {
        el.innerHTML = '<div class="empty-pattern">No contradictions detected. Taste profile is consistent.</div>';
        return;
      }
      var html = '<div class="resurf-list">';
      items.forEach(function(c) {
        var sev = (c.severity || 'low').toLowerCase();
        var sc = 'contradict-sev';
        if (sev === 'high') sc += ' sev-high';
        else if (sev === 'medium') sc += ' sev-medium';
        else sc += ' sev-low';
        html += '<div class="contradict-row">';
        html += '<div class="contradict-head">';
        html += '<span class="' + sc + '">' + escHtml(sev) + '</span>';
        if (c.id) html += '<span class="resurf-branch">' + escHtml(c.id) + '</span>';
        html += '</div>';
        html += '<div class="contradict-desc">' + escHtml(c.description || c.text || c.summary || '') + '</div>';
        if (c.branch_a || c.branch_b) {
          html += '<div class="contradict-meta">' + escHtml(c.branch_a || '') + ' vs ' + escHtml(c.branch_b || '') + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }

    function renderBranchHealth(el) {
      if (typeof brainHealth === 'undefined' || !brainHealth || !brainHealth.byBranch || !brainHealth.byBranch.length) {
        el.innerHTML = '<div class="empty-pattern">No branch health data available.</div>';
        return;
      }
      var html = '<div class="ps-sub">Color-coded by avg rating</div>';
      html += '<div class="bh-grid">';
      brainHealth.byBranch.forEach(function(b) {
        var avg = b.avg_rating ? Number(b.avg_rating) : 0;
        var avgStr = avg ? avg.toFixed(1) : '\u2014';
        var hClass = w3HealthClass(avg, b.consumed_count);
        var hLabel = 'Unknown';
        if (hClass === 'h-thriving') hLabel = 'Thriving';
        else if (hClass === 'h-healthy') hLabel = 'Healthy';
        else if (hClass === 'h-struggling') hLabel = 'Struggling';
        else if (hClass === 'h-atrisk') hLabel = 'At Risk';
        html += '<div class="bh-cell clickable" data-branch="' + escHtml(b.branch) + '">';
        html += '<span class="bh-branch"><span class="health-color ' + hClass + '"></span>' + escHtml(b.branch) + '</span>';
        html += '<span class="bh-count">' + b.consumed_count + ' consumed</span>';
        html += '<span class="bh-avg">avg ' + avgStr + ' \u00B7 ' + hLabel + '</span>';
        html += '<span class="bh-last">' + escHtml((b.last_consumed || '').slice(0, 10)) + '</span>';
        html += '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
      el.querySelectorAll('.bh-cell.clickable').forEach(function(cell) {
        cell.onclick = function() {
          var branch = cell.dataset.branch;
          var treeTab = document.querySelector('.tab[onclick*="tree"]');
          if (treeTab) {
            setTab('tree', treeTab);
            setTimeout(function() { openNode(branch); }, 200);
          }
        };
      });
    }

    function renderMasteryCreep(el) {
      if (typeof brainHealth === 'undefined' || !brainHealth || !brainHealth.byBranch) {
        el.innerHTML = '<div class="empty-pattern">Insufficient data for mastery creep analysis.</div>';
        return;
      }
      var branches = brainHealth.byBranch;
      var creepBranches = branches.filter(function(b) {
        return b.consumed_count >= 5 && b.avg_rating && Number(b.avg_rating) < 3.5;
      });
      if (!creepBranches.length) {
        el.innerHTML = '<div class="empty-pattern">No mastery creep detected. All branches show healthy growth.</div>';
        return;
      }
      var html = '<div class="ps-sub">Branches with high consumption but low avg rating</div>';
      html += '<div class="creep-list">';
      creepBranches.forEach(function(b) {
        var avg = Number(b.avg_rating).toFixed(1);
        html += '<div class="creep-row">';
        html += '<span class="creep-branch">' + escHtml(b.branch) + '</span>';
        html += '<span class="creep-detail">' + b.consumed_count + ' consumed \u00B7 avg ' + avg + '</span>';
        html += '<span class="creep-flag">CREEP</span>';
        html += '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }

    function renderDiminishingReturns(el) {
      if (typeof brainHealth === 'undefined' || !brainHealth || !brainHealth.byBranch) {
        el.innerHTML = '<div class="empty-pattern">Insufficient data for diminishing returns analysis.</div>';
        return;
      }
      var branches = brainHealth.byBranch;
      var dimBranches = branches.filter(function(b) {
        var avg = b.avg_rating ? Number(b.avg_rating) : 0;
        return b.consumed_count >= 3 && avg <= 2.0;
      });
      if (!dimBranches.length) {
        el.innerHTML = '<div class="empty-pattern">No diminishing returns detected. All recommendations maintain value.</div>';
        return;
      }
      var html = '<div class="ps-sub">Branches where recommendations are losing signal</div>';
      html += '<div class="diminish-list">';
      dimBranches.forEach(function(b) {
        var avg = b.avg_rating ? Number(b.avg_rating).toFixed(1) : '\u2014';
        html += '<div class="diminish-row">';
        html += '<span class="diminish-branch">' + escHtml(b.branch) + '</span>';
        html += '<span class="diminish-detail">' + b.consumed_count + ' consumed \u00B7 avg ' + avg + '</span>';
        html += '<span class="diminish-flag">DROPPING</span>';
        html += '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }

    renderPSTab('resurf');
  };

  // ============================================================
  // W4 — Command Palette (Cmd+K / Ctrl+K)
  // ============================================================

  window.__initCommandPalette = function() {
    if (document.getElementById('cmd-overlay')) return;

    var overlay = document.createElement('div');
    overlay.className = 'cmd-overlay';
    overlay.id = 'cmd-overlay';

    var palette = document.createElement('div');
    palette.className = 'cmd-palette';

    var inputWrap = document.createElement('div');
    inputWrap.className = 'cmd-input-wrap';
    inputWrap.innerHTML = '<span class="cmd-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cmd-input';
    input.id = 'cmd-input';
    input.placeholder = 'Search, add, jump, rate...';
    inputWrap.appendChild(input);
    palette.appendChild(inputWrap);

    var results = document.createElement('div');
    results.className = 'cmd-results';
    results.id = 'cmd-results';
    palette.appendChild(results);

    var hint = document.createElement('div');
    hint.className = 'cmd-hint';
    hint.innerHTML = '<span><kbd>\u2191\u2193</kbd> navigate</span><span><kbd>\u23CE</kbd> select</span><span><kbd>esc</kbd> close</span><span>type URL to add</span>';
    palette.appendChild(hint);

    overlay.appendChild(palette);
    document.body.appendChild(overlay);

    var isOpen = false;
    var selectedIdx = 0;
    var filteredResults = [];

    function openPalette() {
      isOpen = true;
      overlay.classList.add('open');
      input.value = '';
      selectedIdx = 0;
      renderDefaultResults();
      setTimeout(function() { input.focus(); }, 50);
    }

    function closePalette() {
      isOpen = false;
      overlay.classList.remove('open');
      input.value = '';
    }

    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) closePalette();
        else openPalette();
      }
      if (e.key === 'Escape' && isOpen) {
        closePalette();
      }
    });

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closePalette();
    });

    function renderDefaultResults() {
      filteredResults = [];
      var html = '';

      html += '<div class="cmd-section-label">Quick Actions</div>';
      var actions = [
        { icon: '\uD83D\uDD17', title: 'Add new recommendation', sub: 'Push a URL or title', action: 'add' },
        { icon: '\u2605', title: 'Rate last consumed item', sub: 'Quick rate', action: 'rate' },
        { icon: '\uD83D\uDD0D', title: 'Search recommendations', sub: 'Filter by keyword', action: 'search' }
      ];
      actions.forEach(function(a, i) {
        filteredResults.push(a);
        html += '<div class="cmd-result' + (i === 0 ? ' selected' : '') + '" data-idx="' + i + '">';
        html += '<span class="cmd-result-icon">' + a.icon + '</span>';
        html += '<div class="cmd-result-text"><div class="cmd-result-title">' + a.title + '</div>';
        html += '<div class="cmd-result-sub">' + a.sub + '</div></div></div>';
      });

      html += '<div class="cmd-section-label">Jump to Tab</div>';
      var tabs = [
        { icon: '\u26A1', title: 'Active recommendations', sub: 'Review queue', action: 'tab:active', shortcut: '1' },
        { icon: '\u2705', title: 'Consumed', sub: 'Already watched', action: 'tab:consumed', shortcut: '2' },
        { icon: '\u274C', title: 'Rejected', sub: 'Passed over', action: 'tab:rejected', shortcut: '3' },
        { icon: '\uD83D\uDCDA', title: 'Profile', sub: 'Identity & patterns', action: 'tab:profile', shortcut: 'P' },
        { icon: '\uD83C\uDF33', title: 'Tree', sub: 'Knowledge tree', action: 'tab:tree', shortcut: 'T' },
        { icon: '\uD83D\uDCCA', title: 'Stats', sub: 'Statistics dashboard', action: 'tab:learning', shortcut: 'S' }
      ];
      tabs.forEach(function(t) {
        var idx = filteredResults.length;
        filteredResults.push(t);
        html += '<div class="cmd-result" data-idx="' + idx + '">';
        html += '<span class="cmd-result-icon">' + t.icon + '</span>';
        html += '<div class="cmd-result-text"><div class="cmd-result-title">' + t.title + '</div>';
        html += '<div class="cmd-result-sub">' + t.sub + '</div></div>';
        html += '<span class="cmd-result-shortcut">' + (t.shortcut || '') + '</span></div>';
      });

      var log = (typeof brainProfile !== 'undefined' && brainProfile) ? (brainProfile.recent || []) : [];
      if (log.length) {
        html += '<div class="cmd-section-label">Recent Activity</div>';
        log.slice(0, 5).forEach(function(l) {
          var idx = filteredResults.length;
          filteredResults.push({ icon: '\uD83D\uDCDD', title: l.summary || l.kind || 'Activity', sub: (l.ts || '').slice(0, 16), action: null });
          html += '<div class="cmd-result" data-idx="' + idx + '">';
          html += '<span class="cmd-result-icon">\uD83D\uDCDD</span>';
          html += '<div class="cmd-result-text"><div class="cmd-result-title">' + escHtml(l.summary || l.kind || 'Activity') + '</div>';
          html += '<div class="cmd-result-sub">' + escHtml((l.ts || '').slice(0, 16)) + '</div></div></div>';
        });
      }

      results.innerHTML = html;
      selectedIdx = 0;
      bindResultClicks();
    }

    function searchPalette(query) {
      if (!query.trim()) { renderDefaultResults(); return; }
      var q = query.toLowerCase();
      filteredResults = [];
      var html = '';

      if (/^https?:\/\//i.test(q)) {
        var urlIdx = filteredResults.length;
        filteredResults.push({ icon: '\uD83D\uDD17', title: 'Add: ' + query, sub: 'Push this URL as a recommendation', action: 'add-url:' + query });
        html += '<div class="cmd-section-label">Add Recommendation</div>';
        html += '<div class="cmd-result selected" data-idx="' + urlIdx + '">';
        html += '<span class="cmd-result-icon">\uD83D\uDD17</span>';
        html += '<div class="cmd-result-text"><div class="cmd-result-title">Add: ' + escHtml(query) + '</div>';
        html += '<div class="cmd-result-sub">Push this URL as a recommendation</div></div></div>';
      }

      if (typeof data !== 'undefined' && data) {
        var matches = data.filter(function(r) {
          return (r.video_title || '').toLowerCase().indexOf(q) !== -1 ||
                 (r.creator || '').toLowerCase().indexOf(q) !== -1 ||
                 (r.why_this || '').toLowerCase().indexOf(q) !== -1;
        }).slice(0, 10);
        if (matches.length) {
          html += '<div class="cmd-section-label">Recommendations (' + matches.length + ')</div>';
          matches.forEach(function(r) {
            var idx = filteredResults.length;
            var sub = (r.creator || 'Unknown') + ' \u00B7 ' + r.status;
            if (r.user_rating && r.user_rating !== 'unset') sub += ' \u00B7 \u2605 ' + r.user_rating;
            var icon = r.status === 'consumed' ? '\u2705' : r.status === 'active' ? '\u26A1' : '\u274C';
            filteredResults.push({ icon: icon, title: r.video_title || 'Untitled', sub: sub, action: 'open:' + r.id });
            html += '<div class="cmd-result" data-idx="' + idx + '">';
            html += '<span class="cmd-result-icon">' + icon + '</span>';
            html += '<div class="cmd-result-text"><div class="cmd-result-title">' + escHtml(r.video_title || 'Untitled') + '</div>';
            html += '<div class="cmd-result-sub">' + escHtml(sub) + '</div></div></div>';
          });
        }
      }

      if (typeof brainTree !== 'undefined' && brainTree && brainTree.nodes) {
        var nodeMatches = brainTree.nodes.filter(function(n) {
          return (n.label || '').toLowerCase().indexOf(q) !== -1 || n.id.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 8);
        if (nodeMatches.length) {
          html += '<div class="cmd-section-label">Tree Nodes (' + nodeMatches.length + ')</div>';
          nodeMatches.forEach(function(n) {
            var idx = filteredResults.length;
            filteredResults.push({ icon: n.type === 'branch' ? '\uD83C\uDF33' : '\uD83C\uDF3F', title: n.label || n.id, sub: n.id + ' \u00B7 ' + (n.type || 'node'), action: 'node:' + n.id });
            html += '<div class="cmd-result" data-idx="' + idx + '">';
            html += '<span class="cmd-result-icon">' + (n.type === 'branch' ? '\uD83C\uDF33' : '\uD83C\uDF3F') + '</span>';
            html += '<div class="cmd-result-text"><div class="cmd-result-title">' + escHtml(n.label || n.id) + '</div>';
            html += '<div class="cmd-result-sub">' + escHtml(n.id) + ' \u00B7 ' + escHtml(n.type || 'node') + '</div></div></div>';
          });
        }
      }

      if (typeof brainHealth !== 'undefined' && brainHealth && brainHealth.byBranch) {
        var branchMatches = brainHealth.byBranch.filter(function(b) {
          return b.branch.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 5);
        if (branchMatches.length) {
          html += '<div class="cmd-section-label">Branches</div>';
          branchMatches.forEach(function(b) {
            var idx = filteredResults.length;
            filteredResults.push({ icon: '\uD83C\uDF33', title: b.branch, sub: b.consumed_count + ' consumed', action: 'branch:' + b.branch });
            html += '<div class="cmd-result" data-idx="' + idx + '">';
            html += '<span class="cmd-result-icon">\uD83C\uDF33</span>';
            html += '<div class="cmd-result-text"><div class="cmd-result-title">' + escHtml(b.branch) + '</div>';
            html += '<div class="cmd-result-sub">' + b.consumed_count + ' consumed</div></div></div>';
          });
        }
      }

      if (!html) {
        html = '<div class="cmd-empty">No results for "' + escHtml(query) + '"</div>';
      }

      results.innerHTML = html;
      selectedIdx = 0;
      bindResultClicks();
    }

    function bindResultClicks() {
      results.querySelectorAll('.cmd-result').forEach(function(el) {
        el.onclick = function() {
          selectedIdx = parseInt(el.dataset.idx, 10);
          executeSelection();
        };
      });
    }

    function updateSelection() {
      results.querySelectorAll('.cmd-result').forEach(function(el, i) {
        el.classList.toggle('selected', i === selectedIdx);
      });
      var sel = results.querySelector('.cmd-result.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    function executeSelection() {
      var item = filteredResults[selectedIdx];
      if (!item || !item.action) return;
      closePalette();

      var act = item.action;
      if (act === 'add') {
        if (typeof openPushModal === 'function') openPushModal();
      } else if (act.indexOf('add-url:') === 0) {
        var url = act.substring(8);
        if (typeof openPushModal === 'function') openPushModal();
        setTimeout(function() {
          var urlInput = document.querySelector('#modal-push input[name="video_url"], #push-url, .push-url-input');
          if (urlInput) { urlInput.value = url; urlInput.dispatchEvent(new Event('input')); }
        }, 200);
      } else if (act === 'rate') {
        if (typeof data !== 'undefined' && data) {
          var consumed = data.filter(function(r) { return r.status === 'consumed'; })
            .sort(function(a, b) { return (b.consumed_date || '').localeCompare(a.consumed_date || ''); });
          if (consumed.length && typeof openReview === 'function') openReview(consumed[0].id, 'consumed');
        }
      } else if (act === 'search') {
        var si = document.getElementById('search');
        if (si) si.focus();
      } else if (act.indexOf('tab:') === 0) {
        var tabName = act.substring(4);
        var tabBtn = document.querySelector('.tab[onclick*="' + tabName + '"]');
        if (tabBtn && typeof setTab === 'function') setTab(tabName, tabBtn);
      } else if (act.indexOf('open:') === 0) {
        var recId = act.substring(5);
        if (typeof data !== 'undefined' && data && typeof openReview === 'function') {
          var rec = data.find(function(r) { return r.id === recId; });
          if (rec) openReview(rec.id, rec.status);
        }
      } else if (act.indexOf('node:') === 0) {
        var nodeId = act.substring(5);
        var treeBtn = document.querySelector('.tab[onclick*="tree"]');
        if (treeBtn && typeof setTab === 'function') {
          setTab('tree', treeBtn);
          setTimeout(function() { if (typeof openNode === 'function') openNode(nodeId); }, 200);
        }
      } else if (act.indexOf('branch:') === 0) {
        var branchName = act.substring(7);
        var treeBtn2 = document.querySelector('.tab[onclick*="tree"]');
        if (treeBtn2 && typeof setTab === 'function') {
          setTab('tree', treeBtn2);
          setTimeout(function() { if (typeof openNode === 'function') openNode(branchName); }, 200);
        }
      }
    }

    input.addEventListener('input', function() {
      searchPalette(input.value);
    });

    input.addEventListener('keydown', function(e) {
      var total = results.querySelectorAll('.cmd-result').length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, total - 1);
        updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelection();
      }
    });

    window.__cmdPaletteOpen = openPalette;
    window.__cmdPaletteClose = closePalette;
  };

  // ============================================================
  // W5 — Review Queue Sort Modes
  // ============================================================

  window.__w5CurrentSortMode = 'oldest-untouched';

  window.__w5InjectSortModes = function() {
    if (document.getElementById('w5-sort-modes')) return;
    var sortSelect = document.getElementById('sort');
    if (!sortSelect) return;

    var container = document.createElement('div');
    container.className = 'sort-modes';
    container.id = 'w5-sort-modes';

    var label = document.createElement('span');
    label.className = 'sort-modes-label';
    label.textContent = 'Review:';
    container.appendChild(label);

    var modes = [
      { id: 'oldest-untouched', label: 'Oldest untouched' },
      { id: 'about-to-expire', label: 'About to expire' },
      { id: 'needs-reaction', label: 'Needs reaction' },
      { id: 'highest-priority', label: 'Highest priority' }
    ];

    modes.forEach(function(m) {
      var btn = document.createElement('button');
      btn.className = 'sort-mode-btn' + (m.id === window.__w5CurrentSortMode ? ' active' : '');
      btn.dataset.sortMode = m.id;
      btn.textContent = m.label;
      container.appendChild(btn);
    });

    sortSelect.parentNode.insertBefore(container, sortSelect.nextSibling);

    container.addEventListener('click', function(e) {
      var btn = e.target.closest('.sort-mode-btn');
      if (!btn) return;
      container.querySelectorAll('.sort-mode-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      window.__w5CurrentSortMode = btn.dataset.sortMode;
      if (btn.dataset.sortMode === 'oldest-untouched') {
        sortSelect.value = 'oldest';
      } else {
        sortSelect.value = 'newest';
      }
      if (typeof handleSearch === 'function') handleSearch();
    });
  };

  // ============================================================
  // INITIALIZATION — hook into main app after load
  // ============================================================

  function w3w4w5Init() {
    // W3: Monkey-patch renderProfileTab to inject pattern panel
    if (typeof window.renderProfileTab === 'function') {
      var _origProfileTab = window.renderProfileTab;
      window.renderProfileTab = function() {
        _origProfileTab();
        var body = document.getElementById('list-body');
        if (body && window.__w3PatternPanel) {
          window.__w3PatternPanel(body);
        }
      };
    }

    // W4: Initialize command palette
    if (window.__initCommandPalette) window.__initCommandPalette();

    // W5: Hook into render to inject sort modes
    if (typeof window.render === 'function') {
      var _origRender = window.render;
      window.render = function() {
        _origRender();
        var sortSel = document.getElementById('sort');
        if (sortSel && typeof currentTab !== 'undefined' &&
            (currentTab === 'active' || currentTab === 'consumed' || currentTab === 'rejected' || currentTab === 'all')) {
          window.__w5InjectSortModes();
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(w3w4w5Init, 100);
    });
  } else {
    setTimeout(w3w4w5Init, 100);
  }

  // ====== W7: Agent Chat UI Shell ======
  var _chatMsgs = [];
  var _chatPanelOpen = false;
  var _chatUnread = 0;
  var _chatSlashCmds = [
    { cmd: '/add', desc: 'Add a new recommendation' },
    { cmd: '/rate', desc: 'Rate the last recommendation' },
    { cmd: '/jump', desc: 'Jump to a specific branch' },
    { cmd: '/recommend', desc: 'Get AI recommendations' },
    { cmd: '/status', desc: 'Show brain status overview' }
  ];

  function _chatLoadHistory() {
    try {
      var raw = localStorage.getItem('tme-chat-history');
      if (raw) _chatMsgs = JSON.parse(raw);
    } catch(e) { _chatMsgs = []; }
  }

  function _chatSaveHistory() {
    // Keep last 20
    if (_chatMsgs.length > 20) _chatMsgs = _chatMsgs.slice(-20);
    try { localStorage.setItem('tme-chat-history', JSON.stringify(_chatMsgs)); } catch(e) {}
  }

  function _chatAddMsg(role, text) {
    _chatMsgs.push({ role: role, text: text, ts: Date.now() });
    _chatSaveHistory();
  }

  function _chatRenderMessages(container) {
    container.innerHTML = '';
    if (_chatMsgs.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:var(--ink-tertiary);font-size:12px;padding:24px 0;';
      empty.textContent = 'Ask the Taste Map Agent anything...';
      container.appendChild(empty);
      return;
    }
    _chatMsgs.forEach(function(m) {
      var div = document.createElement('div');
      div.className = 'chat-msg ' + m.role;
      div.textContent = m.text;
      container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
  }

  // Agent config — tunnel URL (updated per session)
  var _agentUrl = '';

  function _chatSendMessage(text) {
    if (!text || !text.trim()) return;
    var trimmed = text.trim();
    _chatAddMsg('user', trimmed);

    // Render user msg immediately
    var msgsEl = document.getElementById('chat-messages');
    if (msgsEl) _chatRenderMessages(msgsEl);

    // Check for slash commands
    var response = '';
    var isCmd = trimmed.charAt(0) === '/';
    if (isCmd) {
      var parts = trimmed.split(' ');
      var cmd = parts[0].toLowerCase();
      switch(cmd) {
        case '/add':
          response = 'To add a recommendation, use the "New Entry" button in the top bar, or tell me the URL and title and I\'ll add it for you.';
          break;
        case '/rate':
          response = 'Rate the last consumed item. Tell me a rating (1-5) and optional review, e.g. "/rate 4 Great video on Rust ownership"';
          break;
        case '/jump':
          response = 'Which branch do you want to jump to? Give me a branch ID like "mind-creativity" or "faith-prayer" and I\'ll navigate there.';
          break;
        case '/recommend':
          response = 'Fetching recommendations...';
          break;
        case '/status':
          response = 'Brain status: checking...';
          break;
        default:
          response = 'Unknown command: ' + cmd + '. Available: /add, /rate, /jump, /recommend, /status';
      }
    }

    if (isCmd) {
      _chatAddMsg('agent', response);
      _chatUnread++;
      _chatUpdateBadge();
      if (msgsEl) _chatRenderMessages(msgsEl);
    } else {
      // Send to Hermes agent via webhook
      _chatAddMsg('agent', 'Thinking...');
      if (msgsEl) _chatRenderMessages(msgsEl);

      fetch(_agentUrl + '/webhooks/taste-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed })
      }).then(function(r) { return r.json(); }).then(function(d) {
        // Remove "Thinking..." and add real response
        _chatMsgs.pop();
        var reply = (d && d.response) ? d.response : (d && d.message) ? d.message : 'Agent response received. Check gateway logs for details.';
        _chatAddMsg('agent', reply);
        _chatUnread++;
        _chatUpdateBadge();
        if (msgsEl) _chatRenderMessages(msgsEl);
      }).catch(function(e) {
        _chatMsgs.pop();
        _chatAddMsg('agent', 'Connection error: ' + e.message + '. Make sure the Hermes gateway is running.');
        _chatUnread++;
        _chatUpdateBadge();
        if (msgsEl) _chatRenderMessages(msgsEl);
      });
    }
  }

  function _chatUpdateBadge() {
    var btn = document.getElementById('chat-float-btn');
    if (!btn) return;
    var badge = btn.querySelector('.chat-badge');
    if (_chatUnread > 0 && !_chatPanelOpen) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'chat-badge';
        btn.appendChild(badge);
      }
      badge.textContent = _chatUnread > 9 ? '9+' : String(_chatUnread);
      btn.classList.add('pulse');
    } else {
      if (badge) badge.remove();
      btn.classList.remove('pulse');
    }
  }

  function _chatTogglePanel() {
    var panel = document.getElementById('chat-panel');
    if (!panel) return;
    _chatPanelOpen = !_chatPanelOpen;
    if (_chatPanelOpen) {
      panel.classList.add('open');
      _chatUnread = 0;
      _chatUpdateBadge();
      var input = document.getElementById('chat-input');
      if (input) input.focus();
    } else {
      panel.classList.remove('open');
    }
  }

  function _chatShowSlashMenu(show) {
    var menu = document.getElementById('chat-slash-menu');
    if (!menu) return;
    if (show) {
      menu.classList.add('show');
    } else {
      menu.classList.remove('show');
    }
  }

  function _initChatUI() {
    _chatLoadHistory();

    // Floating button
    var btn = document.createElement('button');
    btn.id = 'chat-float-btn';
    btn.className = 'chat-float-btn';
    btn.title = 'Taste Map Agent';
    btn.innerHTML = '\uD83D\uDCAC';
    btn.onclick = _chatTogglePanel;
    document.body.appendChild(btn);

    // Chat panel
    var panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.className = 'chat-panel';

    // Header
    var header = document.createElement('div');
    header.className = 'chat-header';
    header.innerHTML = '<div class="chat-header-title">Taste Map Agent</div><div class="chat-header-btns">' +
      '<button id="chat-minimize" title="Minimize">\u2014</button>' +
      '<button id="chat-close" title="Close">\u2715</button></div>';
    panel.appendChild(header);

    header.querySelector('#chat-minimize').onclick = _chatTogglePanel;
    header.querySelector('#chat-close').onclick = function() {
      _chatPanelOpen = false;
      panel.classList.remove('open');
    };

    // Messages area
    var msgs = document.createElement('div');
    msgs.id = 'chat-messages';
    msgs.className = 'chat-messages';
    _chatRenderMessages(msgs);
    panel.appendChild(msgs);

    // Quick action chips
    var chips = document.createElement('div');
    chips.className = 'chat-chips';
    var chipActions = [
      { label: 'Add rec', cmd: '/add' },
      { label: 'Rate last', cmd: '/rate' },
      { label: 'My patterns', cmd: '/jump mind-creativity' },
      { label: 'Resurface', cmd: '/recommend' }
    ];
    chipActions.forEach(function(c) {
      var chip = document.createElement('span');
      chip.className = 'chat-chip';
      chip.textContent = c.label;
      chip.onclick = function() { _chatSendMessage(c.cmd); };
      chips.appendChild(chip);
    });
    panel.appendChild(chips);

    // Slash command menu
    var slashMenu = document.createElement('div');
    slashMenu.id = 'chat-slash-menu';
    slashMenu.className = 'chat-slash-menu';
    _chatSlashCmds.forEach(function(sc) {
      var item = document.createElement('div');
      item.className = 'chat-slash-item';
      item.innerHTML = '<span class="cmd">' + sc.cmd + '</span><span>' + sc.desc + '</span>';
      item.onclick = function() {
        var input = document.getElementById('chat-input');
        if (input) { input.value = sc.cmd + ' '; input.focus(); }
        _chatShowSlashMenu(false);
      };
      slashMenu.appendChild(item);
    });
    panel.appendChild(slashMenu);

    // Input area
    var inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    inputArea.innerHTML = '<div class="chat-input-wrapper">' +
      '<input type="text" id="chat-input" placeholder="Type a message or /command...">' +
      '</div><button class="chat-send-btn" id="chat-send" title="Send">\u2191</button>';
    panel.appendChild(inputArea);

    document.body.appendChild(panel);

    // Input handlers
    var chatInput = document.getElementById('chat-input');
    var chatSend = document.getElementById('chat-send');

    chatInput.onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _chatSendMessage(chatInput.value);
        chatInput.value = '';
        _chatShowSlashMenu(false);
      }
      if (e.key === 'Escape') {
        _chatShowSlashMenu(false);
      }
    };
    chatInput.oninput = function() {
      var val = chatInput.value;
      _chatShowSlashMenu(val.charAt(0) === '/' && val.indexOf(' ') === -1);
    };
    chatSend.onclick = function() {
      _chatSendMessage(chatInput.value);
      chatInput.value = '';
      _chatShowSlashMenu(false);
    };

    // Close slash menu on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#chat-slash-menu') && !e.target.closest('#chat-input')) {
        _chatShowSlashMenu(false);
      }
    });

    _chatUpdateBadge();
  }

  // ====== W9: Learning Notes Scaffold ======
  var _lnNotes = [];
  var _lnActiveTag = null;

  function _lnLoadNotes() {
    try {
      var raw = localStorage.getItem('tme-learning-notes');
      if (raw) _lnNotes = JSON.parse(raw);
    } catch(e) { _lnNotes = []; }
  }

  function _lnSaveNotes() {
    try { localStorage.setItem('tme-learning-notes', JSON.stringify(_lnNotes)); } catch(e) {}
  }

  function _lnGetAllTags() {
    var tags = {};
    _lnNotes.forEach(function(n) {
      if (n.tags && n.tags.length) {
        n.tags.forEach(function(t) { tags[t] = true; });
      }
    });
    return Object.keys(tags).sort();
  }

  function _lnDeleteNote(id, e) {
    if (e) e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    _lnNotes = _lnNotes.filter(function(n) { return n.id !== id; });
    _lnSaveNotes();
    _lnRenderNotes();
  }

  function _lnRenderNotes() {
    var container = document.getElementById('ln-notes-container');
    if (!container) return;

    var searchVal = '';
    var searchEl = document.getElementById('ln-search');
    if (searchEl) searchVal = searchEl.value.toLowerCase().trim();

    // Filter
    var filtered = _lnNotes.filter(function(n) {
      var matchTag = !_lnActiveTag || (n.tags && n.tags.indexOf(_lnActiveTag) !== -1);
      var matchSearch = !searchVal ||
        (n.title && n.title.toLowerCase().indexOf(searchVal) !== -1) ||
        (n.body && n.body.toLowerCase().indexOf(searchVal) !== -1) ||
        (n.tags && n.tags.join(',').toLowerCase().indexOf(searchVal) !== -1);
      return matchTag && matchSearch;
    });

    // Sort newest first
    filtered.sort(function(a, b) { return (b.created || 0) - (a.created || 0); });

    container.innerHTML = '';
    if (filtered.length === 0) {
      container.innerHTML = '<div class="ln-empty">' + (_lnNotes.length === 0 ? 'No notes yet. Click "New Note" to create one.' : 'No notes match your search.') + '</div>';
      return;
    }

    filtered.forEach(function(n) {
      var card = document.createElement('div');
      card.className = 'note-card';
      var excerpt = (n.body || '').substring(0, 100);
      if ((n.body || '').length > 100) excerpt += '...';
      var dateStr = n.created ? new Date(n.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

      var tagsHtml = '';
      if (n.tags && n.tags.length) {
        n.tags.forEach(function(t) {
          tagsHtml += '<span class="note-tag">' + escHtml(t) + '</span>';
        });
      }

      card.innerHTML = '<div class="note-card-title">' + escHtml(n.title || 'Untitled') + '</div>' +
        '<div class="note-card-excerpt">' + escHtml(excerpt) + '</div>' +
        '<div class="note-card-meta">' +
          '<div class="note-card-tags">' + tagsHtml + '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span class="note-card-date">' + dateStr + '</span>' +
            '<div class="note-card-actions"><button title="Delete" data-id="' + n.id + '">\u2715</button></div>' +
          '</div>' +
        '</div>';

      card.onclick = function() { _lnViewNote(n.id); };
      var delBtn = card.querySelector('[data-id]');
      if (delBtn) delBtn.onclick = function(e) { _lnDeleteNote(n.id, e); };

      container.appendChild(card);
    });
  }

  function _lnViewNote(id) {
    var note = _lnNotes.find(function(n) { return n.id === id; });
    if (!note) return;
    // Simple alert-based view for now (scaffold)
    var tagsStr = (note.tags || []).join(', ') || 'none';
    var branchStr = note.branch || 'none';
    var dateStr = note.created ? new Date(note.created).toLocaleDateString() : '';
    alert('Note: ' + (note.title || 'Untitled') + '\n\nBranch: ' + branchStr + '\nTags: ' + tagsStr + '\nDate: ' + dateStr + '\n\n' + (note.body || ''));
  }

  function _lnToggleForm(show) {
    var form = document.getElementById('ln-form');
    if (!form) return;
    if (show === undefined) show = !form.classList.contains('open');
    if (show) {
      form.classList.add('open');
      document.getElementById('ln-form-title').value = '';
      document.getElementById('ln-form-body').value = '';
      document.getElementById('ln-form-tags').value = '';
    } else {
      form.classList.remove('open');
    }
  }

  function _lnSaveNewNote() {
    var title = (document.getElementById('ln-form-title').value || '').trim();
    var body = (document.getElementById('ln-form-body').value || '').trim();
    var tagsRaw = (document.getElementById('ln-form-tags').value || '').trim();
    var branch = (document.getElementById('ln-form-branch').value || '').trim();

    if (!title) { alert('Title is required.'); return; }

    var tags = tagsRaw ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
    var note = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      title: title,
      body: body,
      tags: tags,
      branch: branch,
      created: Date.now()
    };
    _lnNotes.push(note);
    _lnSaveNotes();
    _lnToggleForm(false);
    _lnRenderNotes();
    _lnRenderTagFilter();
  }

  function _lnRenderTagFilter() {
    var container = document.getElementById('ln-tag-filter');
    if (!container) return;
    var tags = _lnGetAllTags();
    container.innerHTML = '';
    if (tags.length === 0) return;

    // "All" button
    var allBtn = document.createElement('span');
    allBtn.className = 'ln-tag-btn' + (!_lnActiveTag ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.onclick = function() { _lnActiveTag = null; _lnRenderNotes(); _lnRenderTagFilter(); };
    container.appendChild(allBtn);

    tags.forEach(function(t) {
      var btn = document.createElement('span');
      btn.className = 'ln-tag-btn' + (_lnActiveTag === t ? ' active' : '');
      btn.textContent = t;
      btn.onclick = function() { _lnActiveTag = (_lnActiveTag === t) ? null : t; _lnRenderNotes(); _lnRenderTagFilter(); };
      container.appendChild(btn);
    });
  }

  function _lnGetBranches() {
    // Try to get branches from brainTree if available
    var branches = [];
    if (typeof brainTree !== 'undefined' && brainTree && brainTree.nodes) {
      brainTree.nodes.forEach(function(n) {
        if (n.type === 'branch') branches.push({ id: n.id, label: n.label || n.id });
      });
    }
    return branches;
  }

  window.__renderLearningNotes = function() {
    _lnLoadNotes();

    var body = document.getElementById('list-body');
    if (!body) return;

    var section = document.createElement('div');
    section.className = 'learning-notes-section';

    // Header
    var header = document.createElement('div');
    header.className = 'ln-header';
    header.innerHTML = '<h3>Learning Notes</h3>';
    var newBtn = document.createElement('button');
    newBtn.className = 'btn btn-primary';
    newBtn.textContent = 'New Note';
    newBtn.onclick = function() { _lnToggleForm(); };
    header.appendChild(newBtn);
    section.appendChild(header);

    // New Note Form
    var form = document.createElement('div');
    form.id = 'ln-form';
    form.className = 'ln-form';
    form.innerHTML = '<h4>New Note</h4>' +
      '<div class="ln-form-row"><label>Title</label><input type="text" id="ln-form-title" placeholder="Note title..."></div>' +
      '<div class="ln-form-row"><label>Body</label><textarea id="ln-form-body" placeholder="What did you learn?"></textarea></div>' +
      '<div class="ln-form-row"><label>Tags (comma-separated)</label><input type="text" id="ln-form-tags" placeholder="e.g. rust, ownership, borrow-checker"></div>' +
      '<div class="ln-form-row"><label>Linked Branch</label><select id="ln-form-branch"><option value="">None</option></select></div>' +
      '<div class="ln-form-actions">' +
        '<button class="btn btn-ghost" onclick="document.getElementById(\'ln-form\').classList.remove(\'open\')">Cancel</button>' +
        '<button class="btn btn-primary" id="ln-save-btn">Save Note</button>' +
      '</div>';
    section.appendChild(form);

    // Populate branch dropdown
    setTimeout(function() {
      var branches = _lnGetBranches();
      var sel = document.getElementById('ln-form-branch');
      if (sel && branches.length) {
        branches.forEach(function(b) {
          var opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = b.label;
          sel.appendChild(opt);
        });
      }
      var saveBtn = document.getElementById('ln-save-btn');
      if (saveBtn) saveBtn.onclick = _lnSaveNewNote;
    }, 0);

    // Search row
    var searchRow = document.createElement('div');
    searchRow.className = 'ln-search-row';
    searchRow.innerHTML = '<input type="text" id="ln-search" placeholder="Search notes...">';
    section.appendChild(searchRow);

    // Tag filter
    var tagFilter = document.createElement('div');
    tagFilter.id = 'ln-tag-filter';
    tagFilter.className = 'ln-tag-filter';
    section.appendChild(tagFilter);

    // Notes container
    var notesContainer = document.createElement('div');
    notesContainer.id = 'ln-notes-container';
    section.appendChild(notesContainer);

    body.appendChild(section);

    // Wire up search
    var searchInput = document.getElementById('ln-search');
    if (searchInput) {
      searchInput.oninput = function() { _lnRenderNotes(); };
    }

    _lnRenderTagFilter();
    _lnRenderNotes();
  };

  // ====== Initialize on DOM ready ======
  document.addEventListener('DOMContentLoaded', function() {
    _initChatUI();

    // Hook into renderLearningTab if it exists
    if (typeof renderLearningTab === 'function') {
      var _origRenderLearningTab = window.renderLearningTab;
      window.renderLearningTab = function() {
        _origRenderLearningTab();
        if (window.__renderLearningNotes) window.__renderLearningNotes();
      };
    }
  });

})();
