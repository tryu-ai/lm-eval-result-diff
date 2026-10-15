// Synthetic data only. This script never calls an evaluation harness or model.
const fs=require('node:fs');const path=require('node:path');
require('../src/core.js');const E=globalThis.EvalDiff;
const clone=x=>JSON.parse(JSON.stringify(x));
function base() {
 const tasks=['synthetic_qa','synthetic_math'];
 const data={synthetic_notice:'合成数据 — 非真实模型成绩',model_name:'SYNTHETIC / model-A',model_source:'synthetic',config:{model:'synthetic-local',model_args:'SYNTHETIC_SECRET_MUST_NOT_EXPORT',gen_kwargs:null,random_seed:0,numpy_seed:1234,torch_seed:1234,fewshot_seed:1234,limit:null,model_dtype:'float32',model_revision:'synthetic-r1',model_sha:'synthetic-sha'},git_hash:'SYNTHETIC-harness-commit',lm_eval_version:'SYNTHETIC-0.4.x',transformers_version:'SYNTHETIC-4.x',chat_template:null,chat_template_sha:null,system_instruction:null,system_instruction_sha:null,fewshot_as_multiturn:false,pretty_env_info:'SYNTHETIC_PRIVATE_ENV_MUST_NOT_EXPORT',versions:{},'n-shot':{},'n-samples':{},configs:{},higher_is_better:{},group_subtasks:{synthetic_suite:tasks},results:{synthetic_qa:{alias:'合成数据 QA',sample_len:100,'acc,none':.5,'acc_stderr,none':.04,'acc,strict-match':.45,'acc_stderr,strict-match':.05},synthetic_math:{sample_len:100,'exact_match,none':.3,'exact_match_stderr,none':'N/A'}},groups:{synthetic_suite:{'acc,none':.4,'acc_stderr,none':.03,sample_count:{'acc,none':200}}}};
 for(const task of tasks) {
  data.versions[task]='synthetic-v1';data['n-shot'][task]=0;data['n-samples'][task]={original:100,effective:100};data.higher_is_better[task]={acc:true,exact_match:true};
  const cfg=data.configs[task]={};for(const k of E.TASK_FIELDS)cfg[k]=null;
  Object.assign(cfg,{dataset_path:'SYNTHETIC/toy_dataset',test_split:'test',num_fewshot:0,doc_to_text:'Question: {{question}}',doc_to_target:'{{answer}}',fewshot_delimiter:'\n\n',target_delimiter:' ',output_type:'multiple_choice',repeats:1,filter_list:[{name:'none',filter:[{function:'take_first'}]},{name:'strict-match',filter:[{function:'take_first'}]}],metric_list:[{metric:'acc',aggregation:'mean',higher_is_better:true}],should_decontaminate:false});
 }
 return data;
}
const a=base(),b=clone(a);b.model_name='SYNTHETIC / model-B';b.results.synthetic_qa['acc,none']=.55;b.results.synthetic_qa['acc,strict-match']=.46;
const c=clone(b);for(const t of Object.keys(c.configs)){c['n-shot'][t]=5;c.configs[t].num_fewshot=5;c.configs[t].fewshot_split='train';}c.versions.synthetic_math='synthetic-v2';
const d={synthetic_notice:'合成数据 — 元数据刻意缺失',model_name:'SYNTHETIC / metadata-unknown',results:{synthetic_qa:{'acc,none':.55,'acc_stderr,none':null,'acc,strict-match':.46}}};
const demos={same:[{name:'SYNTHETIC-01-baseline.json',data:a},{name:'SYNTHETIC-01-candidate.json',data:b}],fewshot:[{name:'SYNTHETIC-02-0shot.json',data:a},{name:'SYNTHETIC-02-5shot.json',data:c}],missing:[{name:'SYNTHETIC-03-known.json',data:a},{name:'SYNTHETIC-03-missing.json',data:d}]};
const dir=path.join(__dirname,'../fixtures');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'demos.json'),JSON.stringify(demos,null,2));
for(const pair of Object.values(demos))for(const f of pair)fs.writeFileSync(path.join(dir,f.name),JSON.stringify(f.data,null,2));
module.exports=demos;
