(() => {
  'use strict';
  const E = globalThis.EvalDiff, $ = id => document.getElementById(id), safe = E.esc;
  const demos = JSON.parse($('demo-data').textContent);
  let runs = [], baseline = 0, rows = [], page = 0, selected = null, busy = false;
  const preview = v => { const s = E.raw(v); return s.length > 240 ? s.slice(0,240)+'…（显示截断；本地按完整值比较）' : s; };
  function error(message) { $('error').textContent = message; $('error').hidden = !message; }
  function locked(value) { busy = value; $('import').disabled = value; document.querySelectorAll('[data-demo]').forEach(b => b.disabled = value); $('clear').disabled = value; }
  function load(next, demo = '') {
    E.compare(next,0); // Validate the aggregate bound before committing the new session.
    runs = next; baseline = 0; page = 0; selected = null;
    $('baseline').innerHTML = runs.map((r,i)=>'<option value="'+i+'">Run '+(i+1)+' · '+safe(r.name)+'</option>').join('');
    $('baseline').disabled = false; $('clear').hidden = false; $('csv').disabled = false; $('html').disabled = false;
    $('search').value = ''; $('changed').checked = false; $('conditions').checked = false;
    document.querySelectorAll('[data-demo]').forEach(b=>b.classList.toggle('active',b.dataset.demo===demo));
    error(''); recalculate(); $('status').textContent = demo ? '已载入合成数据演示 · 不代表真实模型成绩。' : '导入成功 · 数据仅保留于当前标签页内存。';
  }
  function recalculate() { rows = E.compare(runs,baseline); page=0; render(); }
  function render() {
    $('run-count').textContent = runs.length+' / 6';
    $('runs').innerHTML = runs.map((r,i)=>'<div class="run '+(i===baseline?'baseline':'')+'"><span class="eyebrow">RUN '+(i+1)+(i===baseline?' · BASELINE':'')+'</span><strong>'+safe(r.name)+'</strong><small class="model">模型 '+safe(preview(E.at(r.data,['model_name']).present?E.at(r.data,['model_name']):E.at(r.data,['config','model'])))+'</small><small>导入 '+safe(r.importedAt)+'<br>'+r.records.size+' 主指标 · '+r.ignored+' 个 stderr 键</small></div>').join('');
    const states = {same:0,different:0,unknown:0};
    for(const r of rows) { const other=r.cells.filter(c=>c.index!==baseline); const state=other.some(c=>c.state==='different')?'different':other.some(c=>c.state==='unknown')?'unknown':'same'; states[state]++; }
    for(const s of Object.keys(states)) $(s+'-count').textContent = states[s];
    const term=$('search').value.trim().toLowerCase();
    const filtered=rows.filter(r=>(r.task+' '+r.key+' '+r.scope).toLowerCase().includes(term)&&(!$('changed').checked||r.cells.some(c=>c.index!==baseline&&c.changed))&&(!$('conditions').checked||r.cells.some(c=>c.index!==baseline&&c.state==='different')));
    page=Math.min(page,Math.max(0,Math.ceil(filtered.length/50)-1));
    $('row-count').textContent=filtered.length+' / '+rows.length+' 行 · '+runs.length+' 个运行'+(rows.some(r=>r.scope==='groups')?' · 含来源 GROUP 汇总':'');
    const head='<thead><tr><th class="sticky">Task / 完整 metric,filter</th>'+runs.map((r,i)=>'<th>Run '+(i+1)+' '+(i===baseline?'<span class="baseline-label">BASELINE</span>':'')+'<span class="metric-name">'+safe(r.name)+'</span></th>').join('')+'</tr></thead>';
    const body=filtered.slice(page*50,(page+1)*50).map(r=>'<tr><th class="sticky"><span class="scope">'+(r.scope==='groups'?'GROUP · 来源汇总':'TASK')+'</span>'+safe(r.task)+'<span class="metric-name">'+safe(r.key)+'</span><button class="inspect" data-row="'+rows.indexOf(r)+'">查看条件</button></th>'+r.cells.map(c=>'<td><strong class="value">'+safe(preview(c.value))+'</strong><span class="stderr">stderr '+safe(preview(c.stderr))+'</span><span class="delta">Δ '+safe(E.fmt(c.delta))+' · '+safe(c.direction)+'</span>'+(c.index===baseline?'<span class="badge">baseline</span>':'<span class="badge '+c.state+'">'+E.labels[c.state]+'</span>')+(c.missingRecord?'<span class="stderr">记录缺失；不计算分差</span>':'')+'</td>').join('')+'</tr>').join('');
    $('table').innerHTML=filtered.length?'<table class="matrix">'+head+'<tbody>'+body+'</tbody></table>':'<div class="empty"><strong>没有匹配行</strong>调整检索或取消筛选。</div>';
    $('pager').hidden=filtered.length<=50; $('page-info').textContent=(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/50)); $('prev').disabled=page===0; $('next').disabled=(page+1)*50>=filtered.length;
    if(selected!==null) showDetails(selected); else $('detail').hidden=true;
  }
  function showDetails(index) {
    selected=index; const row=rows[index]; if(!row) return;
    $('detail').hidden=false;
    $('detail').innerHTML='<div class="detail-head"><div><h2>'+safe(row.task)+' · 条件记录</h2><span class="metric-name">'+safe(row.key)+'</span></div><button id="close-detail">收起</button></div><p>下方原配置仅在本地查看。导出只记录字段状态与存在性。missing ≠ null；未记录字段不套用 harness 默认值。'+(row.scope==='groups'?'GROUP 的子任务配置未递归推断，缺少自身配置时保持信息不足。':'')+'</p><div class="detail-grid">'+row.cells.filter(c=>c.index!==baseline).map(c=>'<div class="detail-run"><h3>Run '+(c.index+1)+' <span class="badge '+c.state+'">'+E.labels[c.state]+'</span></h3>'+c.conditions.map(f=>'<div class="field"><span class="badge '+f.status+'">'+E.labels[f.status]+'</span><code>'+safe(f.field)+'</code><div class="raw">baseline: '+safe(preview(f.a))+'<br>当前: '+safe(preview(f.b))+'</div></div>').join('')+'</div>').join('')+'</div>';
    $('close-detail').onclick=()=>{ selected=null; $('detail').hidden=true; };
  }
  $('import').onclick=()=>{ if(!busy) $('files').click(); };
  $('files').onchange=async event=>{
    const files=[...event.target.files]; if(!files.length) return; locked(true); error('');
    try { E.checkBatch(files); const next=[]; const time=new Date().toISOString();
      for(const file of files) { try { next.push(E.parse(await file.text(),file.name,time)); } catch(e) { throw Error(file.name+': '+e.message); } }
      load(next);
    } catch(e) { error(e.message+' 当前会话未改变。'); } finally { $('files').value=''; locked(false); }
  };
  document.querySelectorAll('[data-demo]').forEach(button=>button.onclick=()=>{
    if(busy)return; try {const time=new Date().toISOString(); load(demos[button.dataset.demo].map(f=>E.parse(JSON.stringify(f.data),f.name,time)),button.dataset.demo); } catch(e) {error(e.message);}
  });
  $('baseline').onchange=()=>{ baseline=Number($('baseline').value); selected=null; recalculate(); $('status').textContent='Baseline 已切换为 Run '+(baseline+1)+'，所有分差和条件状态已重新计算。'; };
  for(const id of ['search','changed','conditions']) $(id).addEventListener(id==='search'?'input':'change',()=>{page=0;if(runs.length)render();});
  $('table').onclick=event=>{const b=event.target.closest('[data-row]');if(b){showDetails(Number(b.dataset.row));$('detail').scrollIntoView({block:'start',behavior:'smooth'});}};
  $('prev').onclick=()=>{page--;render();}; $('next').onclick=()=>{page++;render();};
  function download(type) {
    try { const rep=E.report(runs,baseline,rows), content=type==='csv'?E.csv(rep):E.html(rep); const blob=new Blob([content],{type:type==='csv'?'text/csv;charset=utf-8':'text/html;charset=utf-8'}); const url=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url;a.download='lm-eval-result-diff-'+(type==='csv'?'comparison.csv':'report.html'); document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      $('status').textContent='已生成全量 '+rows.length+' 行'+(type==='csv'?' CSV':'独立 HTML')+'。下载由浏览器保存；请检查来源文件名、模型名和指标文本中是否含敏感内容。';
    }catch(e){error('导出失败：'+e.message);}
  }
  $('csv').onclick=()=>download('csv'); $('html').onclick=()=>download('html');
  $('clear').onclick=()=>location.reload();
})();
