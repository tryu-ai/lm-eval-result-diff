/* EvalDiff: dependency-free comparison and deliberately narrow export model. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ files: 6, bytes: 5 * 1024 * 1024, totalBytes: 20 * 1024 * 1024, depth: 32, nodes: 100000, tasks: 500, records: 2000, totalRecords: 2000, string: 262144 });
  const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const obj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
  const numeric = v => typeof v === 'number' && Number.isFinite(v);
  const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : obj(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function at(o, path) {
    for (const p of path) { if (!own(o, p)) return { present: false }; o = o[p]; }
    return { present: true, value: o };
  }
  function raw(v) { return !v.present ? '缺失' : JSON.stringify(v.value); }
  function scan(text) {
    let depth = 0, quote = false, escape = false;
    for (const c of text) {
      if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quote = false; }
      else if (c === '"') quote = true;
      else if (c === '[' || c === '{') { if (++depth > LIMITS.depth) throw Error('嵌套深度超过 32 层。'); }
      else if (c === ']' || c === '}') depth--;
    }
  }
  function validateTree(root) {
    const stack = [root]; let count = 0;
    while (stack.length) {
      const v = stack.pop();
      if (++count > LIMITS.nodes) throw Error('JSON 节点超过 100000 个。');
      if (typeof v === 'number' && !Number.isFinite(v)) throw Error('JSON 含非有限数值。');
      if (typeof v === 'string' && v.length > LIMITS.string) throw Error('单个字符串超过 262144 字符。');
      if (v && typeof v === 'object') for (const k of Object.keys(v)) {
        if (k.length > 1000) throw Error('字段名超过 1000 字符。'); stack.push(v[k]);
      }
    }
  }
  const splitKey = k => { const i = k.indexOf(','); return i > 0 && i < k.length - 1 ? [k.slice(0, i), k.slice(i)] : null; };
  const mainKey = k => { const p = splitKey(k); return p && !p[0].endsWith('_stderr'); };
  const stderrKey = k => { const p = splitKey(k); return p[0] + '_stderr' + p[1]; };
  // Only these paths are retained after parsing. No model_args, samples or environment text.
  const TASK_FIELDS = ['dataset_path','dataset_name','dataset_kwargs','custom_dataset','training_split','validation_split','test_split','fewshot_split','process_docs','use_prompt','description','doc_to_text','doc_to_target','doc_to_choice','fewshot_delimiter','target_delimiter','gen_prefix','num_fewshot','output_type','generation_kwargs','repeats','filter_list','metric_list','should_decontaminate','doc_to_decontamination_query'];
  const RUN_FIELDS = ['git_hash','lm_eval_version','transformers_version','chat_template','chat_template_sha','system_instruction','system_instruction_sha','fewshot_as_multiturn'];
  const CONFIG_FIELDS = ['gen_kwargs','random_seed','numpy_seed','torch_seed','fewshot_seed','limit','model_dtype','model_revision','model_sha'];
  function copyPaths(data) {
    const out = Object.create(null);
    for (const key of [...RUN_FIELDS,'model_name','model_source','versions','n-shot','n-samples','higher_is_better','group_subtasks','task_hashes']) if (own(data, key)) out[key] = data[key];
    out.config = Object.create(null);
    for (const key of [...CONFIG_FIELDS,'model']) if (own(data.config, key)) out.config[key] = data.config[key];
    out.configs = Object.create(null);
    if (obj(data.configs)) for (const task of Object.keys(data.configs)) {
      const c = out.configs[task] = Object.create(null);
      for (const key of TASK_FIELDS) if (own(data.configs[task], key)) c[key] = data.configs[task][key];
    }
    return out;
  }
  function parse(text, name = 'results.json', importedAt = new Date().toISOString()) {
    if (new TextEncoder().encode(text).length > LIMITS.bytes) throw Error('每份文件最多 5 MiB。');
    scan(text); let data;
    try { data = JSON.parse(text); } catch { throw Error('不是合法 JSON；请选择 results 汇总 JSON，不支持 JSONL。'); }
    validateTree(data);
    if (!obj(data) || !obj(data.results) || !Object.keys(data.results).length) throw Error('不是支持的 results 汇总：需要非空 results 对象。');
    if (own(data, 'groups') && !obj(data.groups)) throw Error('groups 必须是对象。');
    const records = new Map(); let tasks = 0, found = 0, ignored = 0;
    for (const scope of ['results', 'groups']) if (data[scope]) for (const task of Object.keys(data[scope])) {
      if (++tasks > LIMITS.tasks) throw Error('任务与 group 合计超过 500 个。');
      const values = data[scope][task];
      if (!obj(values)) throw Error('每个任务的指标必须是对象。');
      for (const key of Object.keys(values)) {
        if (!mainKey(key)) { if (splitKey(key)) ignored++; continue; }
        if (++found > LIMITS.records) throw Error('主指标记录超过 2000 行。');
        const id = JSON.stringify([scope, task, key]);
        records.set(id, { id, scope, task, key, value: at(values, [key]), stderr: at(values, [stderrKey(key)]), sampleLen:at(values,['sample_len']), sampleCount:at(values,['sample_count',key]) });
      }
    }
    if (!found) throw Error('未找到 metric,filter 主指标；name/alias/sample_len/stderr 不能充当主指标。');
    return { name: String(name).split(/[\\/]/).pop().slice(0, 200), importedAt, records, data: copyPaths(data), ignored, synthetic:typeof data.synthetic_notice==='string' && data.synthetic_notice.startsWith('合成数据') };
  }
  function checkBatch(files) {
    if (files.length < 2 || files.length > LIMITS.files) throw Error('请一次选择 2–6 份 JSON；本次导入会替换当前会话。');
    if (files.some(f => f.size > LIMITS.bytes)) throw Error('每份文件最多 5 MiB。');
    if (files.reduce((n, f) => n + f.size, 0) > LIMITS.totalBytes) throw Error('文件总大小最多 20 MiB。');
  }
  function field(path, type = 'any', nullKnown = true) { return { path, label: path.join('.'), type, nullKnown }; }
  function fields(task) {
    return [field(['versions',task],'version',false),field(['n-shot',task],'count',false),field(['n-samples',task,'effective'],'count',false),
      ...TASK_FIELDS.map(k => field(['configs',task,k], k === 'dataset_path' ? 'string' : 'any', k !== 'dataset_path')),
      ...RUN_FIELDS.map(k => field([k], 'any', !['git_hash','lm_eval_version','transformers_version'].includes(k))),
      ...CONFIG_FIELDS.map(k => field(['config',k])),
      // Hashes add evidence when present; their absence does not mask the required fields above.
    ];
  }
  function known(v, f) {
    if (!v.present) return false;
    if (v.value === null) return f.nullKnown;
    if (f.type === 'count') return Number.isInteger(v.value) && v.value >= 0;
    if (f.type === 'version') return typeof v.value === 'string' || numeric(v.value);
    if (f.type === 'string') return typeof v.value === 'string';
    return true;
  }
  function compareFields(a, b, task, scope) {
    const defs = fields(task);
    if (scope === 'groups') defs.push(field(['group_subtasks',task]));
    if (at(a,['task_hashes',task]).present || at(b,['task_hashes',task]).present) defs.push(field(['task_hashes',task]));
    return defs.map(f => {
      const av = at(a, f.path), bv = at(b, f.path);
      return { field: f.label, a: av, b: bv, status: !known(av,f) || !known(bv,f) ? 'unknown' : canonical(av.value) === canonical(bv.value) ? 'same' : 'different' };
    });
  }
  function direction(run, task, key) {
    const metric = splitKey(key)[0]; let v = at(run.data,['higher_is_better',task,key]);
    if (!v.present) v = at(run.data,['higher_is_better',task,metric]);
    return v.value === true ? '↑ higher' : v.value === false ? '↓ lower' : '方向未知';
  }
  function compare(runs, baseline = 0) {
    if (runs.length < 2 || runs.length > 6 || !runs[baseline]) throw Error('需要 2–6 个运行及有效 baseline。');
    if (runs.reduce((n,r)=>n+r.records.size,0) > LIMITS.totalRecords) throw Error('本次导入的主指标记录合计超过 2000 行（含各运行重复项）。');
    const union = new Map(); for (const run of runs) for (const [id, row] of run.records) union.set(id, row);
    const cache = new Map(); const rows = [];
    for (const template of union.values()) {
      const base = runs[baseline].records.get(template.id);
      const cells = runs.map((run, i) => {
        const record = run.records.get(template.id);
        const cacheKey = JSON.stringify([template.scope,template.task,i]);
        if (!cache.has(cacheKey)) cache.set(cacheKey, compareFields(runs[baseline].data,run.data,template.task,template.scope));
        const conditions = [...cache.get(cacheKey)];
        for(const [property,label] of [['sampleLen',template.scope+'.'+template.task+'.sample_len'],['sampleCount',template.scope+'.'+template.task+'.sample_count.'+template.key]]) {
          const av=base?base[property]:{present:false},bv=record?record[property]:{present:false};
          if(av.present || bv.present) conditions.push({field:label,a:av,b:bv,status:!known(av,{type:'count',nullKnown:false}) || !known(bv,{type:'count',nullKnown:false})?'unknown':av.value===bv.value?'same':'different'});
        }
        const state = !base || !record ? 'unknown' : conditions.some(f => f.status === 'different') ? 'different' : conditions.some(f => f.status === 'unknown') ? 'unknown' : 'same';
        return { index:i, value:record ? record.value : {present:false}, stderr:record ? record.stderr : {present:false}, delta:base && record && numeric(base.value.value) && numeric(record.value.value) ? record.value.value - base.value.value : null,
          direction:direction(run,template.task,template.key), conditions, state, missingRecord:!base || !record,
          changed:!base || !record || canonical(base.value.value) !== canonical(record.value.value) || canonical(base.stderr) !== canonical(record.stderr) };
      });
      rows.push({ id:template.id, scope:template.scope,task:template.task,key:template.key,cells });
    }
    return rows.sort((a,b) => a.scope.localeCompare(b.scope) || a.task.localeCompare(b.task) || a.key.localeCompare(b.key));
  }
  const labels = { same:'已记录字段一致', different:'存在差异', unknown:'信息不足' };
  const fmt = n => n === null ? '—' : (Object.is(n,-0) || n === 0 ? '0' : (n > 0 ? '+' : '−') + Number(Math.abs(n).toPrecision(12)).toString());
  // Report whitelist: exact condition path and its relation; never any raw condition values.
  function report(runs, baseline, rows, createdAt = new Date().toISOString()) {
    return { format:'EvalDiff report v1', createdAt, baseline:baseline + 1, sources:runs.map((r,i) => ({run:i+1,name:r.name,importedAt:r.importedAt,synthetic:r.synthetic,model:at(r.data,['model_name']).present ? raw(at(r.data,['model_name'])) : raw(at(r.data,['config','model']))})),
      rows:rows.map(r => ({scope:r.scope, task:r.task, key:r.key, values:r.cells.map(c => ({run:c.index+1, raw:raw(c.value),stderr:raw(c.stderr),delta:c.delta, direction:c.direction,state:labels[c.state],conditions:c.conditions.map(f => ({field:f.field,status:labels[f.status === 'different'?'different':f.status === 'unknown'?'unknown':'same'],baselinePresence:!f.a.present?'missing':f.a.value===null?'null':'value',runPresence:!f.b.present?'missing':f.b.value===null?'null':'value'}))}))})) };
  }
  function csvCell(value) {
    let s = String(value ?? '');
    if (/^[\s\uFEFF]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g,'""') + '"';
  }
  function csv(rep) {
    const header=['scope','task','metric_filter_key','run','source_file','imported_at','baseline_run','raw','stderr','delta_run_minus_baseline','direction_only','recorded_conditions','condition_whitelist_statuses'];
    const lines=[header];
    for (const row of rep.rows) for (const v of row.values) { const src=rep.sources[v.run-1]; lines.push([row.scope,row.task,row.key,v.run,src.name,src.importedAt,rep.baseline,v.raw,v.stderr,v.delta===null?'':Number(v.delta.toPrecision(12)).toString(),v.direction,v.state,JSON.stringify(v.conditions)]); }
    return '\uFEFF'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n');
  }
  function html(rep) {
    const sources=rep.sources.map(s=>'<li>Run '+s.run+' · '+esc(s.name)+' · 导入 '+esc(s.importedAt)+' · 模型 '+esc(s.model)+'</li>').join('');
    const body=rep.rows.map(r=>'<tr><th>'+esc(r.scope==='groups'?'GROUP · ':'TASK · ')+esc(r.task)+'<small>'+esc(r.key)+'</small></th>'+r.values.map(v=>'<td><strong>'+esc(v.raw)+'</strong><small>stderr '+esc(v.stderr)+' · Δ '+esc(fmt(v.delta))+'</small><small>'+esc(v.direction)+' · '+esc(v.state)+'</small><details><summary>条件记录</summary>'+v.conditions.map(f=>'<div>'+esc(f.field)+' · '+esc(f.status)+' · '+esc(f.baselinePresence)+' → '+esc(f.runPresence)+'</div>').join('')+'</details></td>').join('')+'</tr>').join('');
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>LM Eval Result Diff · 独立报告</title><style>body{font:15px system-ui;color:#183333;background:#f6f8f4;margin:0;padding:32px}h1{font-size:38px}small{display:block;margin-top:8px;overflow-wrap:anywhere}table{border-collapse:collapse;background:white;min-width:700px;width:100%}td,th{border:1px solid #d8e2d9;padding:16px;text-align:left;vertical-align:top;max-width:360px;overflow-wrap:anywhere}.scroll{overflow:auto}details{font-size:12px;line-height:1.8;margin-top:12px}li{margin:8px 0}</style><h1>LM Eval Result Diff <small>本地比较 · 独立报告</small></h1>'+ (rep.sources.some(s=>s.synthetic)?'<p><strong>合成数据演示 — 不代表真实模型成绩</strong></p>':'') +'<p>生成 '+esc(rep.createdAt)+' · baseline Run '+rep.baseline+' · 全量 '+rep.rows.length+' 行（不受页面筛选影响）</p><p>非 lm-evaluation-harness 官方产品。仅描述已记录字段；不证明公平可比、显著性或训练有效。Δ = 当前值 − baseline；缺失及非数值不计算。GROUP 为来源提供的汇总，无自创总分。</p><p>隐私白名单：来源、时间、模型标识、原指标、stderr、方向、条件路径/状态/存在性。原始条件值与 model_args、环境、samples 不导出。请自行检查文件名、模型名、指标文本中是否含敏感内容。</p><ul>'+sources+'</ul><div class="scroll"><table><thead><tr><th>Task / 完整 metric,filter</th>'+rep.sources.map(s=>'<th>Run '+s.run+(s.run===rep.baseline?' · BASELINE':'')+'<small>'+esc(s.name)+'</small></th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div></html>';
  }
  root.EvalDiff = Object.freeze({ LIMITS, parse,checkBatch,compare,report,csv,html,csvCell,raw,fmt,esc,numeric,canonical,labels,at,TASK_FIELDS,RUN_FIELDS,CONFIG_FIELDS });
})(typeof globalThis !== 'undefined' ? globalThis : this);
