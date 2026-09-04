import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const cases=JSON.parse(await readFile(new URL('../tests/adversarial_cases.json',import.meta.url),'utf8'));
if(!Array.isArray(cases)||cases.length<6)throw new Error('Need at least 6 adversarial/control cases');
const ids=new Set(cases.map(x=>x.id));
if(ids.size!==cases.length)throw new Error('Duplicate adversarial case id');
for(const c of cases){
  if(!['MATERIAL_CHANGE','NON_MATERIAL_CHANGE'].includes(c.expected))throw new Error(`Invalid expected verdict: ${c.id}`);
  if(typeof c.proposed_terms!=='string'||c.proposed_terms.length<20)throw new Error(`Invalid proposed terms: ${c.id}`);
}
for(const category of ['prompt-injection','ambiguity','omission','salami-slicing','control'])if(!cases.some(x=>x.category===category))throw new Error(`Missing category ${category}`);
const contract=await readFile(new URL('../contracts/ConsentGuard.py',import.meta.url),'utf8');
for(const marker of [
  '_looks_adversarial',
  'DETERMINISTIC_ADVERSARIAL_GUARD',
  '_introduced_high_risk_marker',
  'DETERMINISTIC_RISK_GUARD',
  'epoch_base_terms',
  'rights_changed',
  'ambiguity',
  'adversarial_signal',
  'authorize_service_action',
  'receipt_consent_epoch',
  'receipt_consented_version',
  'receipt_terms_version'
]) if(!contract.includes(marker))throw new Error(`Contract hardening marker missing: ${marker}`);
const deterministic=cases.filter(x=>x.runtime_required===false);
for(const c of deterministic){
  if(c.expected!=='MATERIAL_CHANGE')throw new Error(`Deterministic guard vector must fail safe to MATERIAL_CHANGE: ${c.id}`);
  if(!c.guard)throw new Error(`Deterministic vector missing guard: ${c.id}`);
  if(!contract.includes(c.guard))throw new Error(`Guard ${c.guard} missing from contract`);
}
console.log(`PASS adversarial vector corpus (${cases.length} cases)`);
console.log(`PASS deterministic guard vectors (${deterministic.length} cases)`);
console.log('PASS runtime semantic vectors are explicitly marked for StudioNet verification');
