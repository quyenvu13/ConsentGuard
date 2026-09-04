const EXPLORER_BASE = window.CONSENTGUARD_CONFIG?.explorerBase || 'https://explorer-studio.genlayer.com/address/';
const SDK = {
  main: 'https://esm.sh/genlayer-js@1.0.0?bundle',
  chains: 'https://esm.sh/genlayer-js@1.0.0/chains?bundle',
  types: 'https://esm.sh/genlayer-js@1.0.0/types?bundle',
};
const MOCK = new URLSearchParams(location.search).get('mock') === '1';
const CONTRACT = window.CONSENTGUARD_CONFIG?.contractAddress || '';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const CONFIGURED = validAddress(CONTRACT) && CONTRACT.toLowerCase() !== ZERO_ADDRESS;
const INITIAL_TERMS = "Users may access the service for personal or commercial purposes. The service may collect basic account information required for operation. Users retain ownership of their submitted content. The provider may suspend accounts only for security incidents, fraud, or violations of these terms. Material changes to these terms require renewed user consent before protected actions continue.";
const MOCK_WALLETS = [
  '0x3065E31B1D993d7C0D59E6786844cBa56780B2d3',
  '0x5a52d040581A76e2C032542855D31480f2ea7097',
  '0xADE4533b5C00Fc6c8E44F674213c081D919aaD1D',
];
const ACTION_TYPES = ['SERVICE_ACCESS', 'DATA_EXPORT', 'CONTENT_PUBLISH'];
let walletAddress = '', sdkCache = null, busy = false, notice = '', error = '', summaryCache = null, consentCache = null;
let sessionConsent = { wallet: '', epoch: null, version: null, txHash: '' };
let lastAction = { wallet: '', status: '', receipt: null, txHash: '' };

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function short(v=''){return String(v).length < 14 ? String(v) : `${String(v).slice(0,6)}…${String(v).slice(-4)}`;}
function validAddress(v=''){return /^0x[a-fA-F0-9]{40}$/.test(String(v));}
function friendly(err){
  const raw=String(err?.shortMessage??err?.message??err??'Unknown error');
  const rb=raw.match(/\[rollback\]\s*(.+)/i); if(rb)return rb[1];
  if(/Only publisher/i.test(raw))return'Only the publisher/deployer wallet can propose terms updates.';
  if(/Current terms consent required/i.test(raw))return'Current terms consent required. Consent to the latest epoch before authorizing a service action.';
  if(/Unsupported service action type/i.test(raw))return'Unsupported service action type.';
  if(/Service action already authorized/i.test(raw))return'This wallet/action/reference combination already has an on-chain authorization receipt.';
  if(/user rejected|rejected the request|action_rejected/i.test(raw))return'Wallet signature was rejected.';
  if(/failed to fetch|network|rpc|blocked/i.test(raw))return`Network/RPC error: ${raw}`;
  return raw.replace(/^Error:\s*/, '');
}
function parseResult(raw){let v=raw;if(v&&typeof v==='object'&&'result' in v)v=v.result;if(typeof v==='string'){const t=v.trim();if(!t)throw new Error('Contract returned an empty response');try{v=JSON.parse(t)}catch{}}return v;}
function asBool(v){const x=parseResult(v);if(typeof x==='boolean')return x;if(typeof x==='number')return x!==0;const s=String(x).trim().toLowerCase();if(s==='true'||s==='1')return true;if(s==='false'||s==='0'||s==='')return false;throw new Error(`Unexpected boolean response: ${x}`);}
function parseSummary(raw){const v=parseResult(raw);if(v&&typeof v==='object')return v;throw new Error(`Unexpected get_summary response: ${String(raw)}`);}
function parseObject(raw){const v=parseResult(raw);if(v&&typeof v==='object')return v;throw new Error(`Unexpected contract object response: ${String(raw)}`);}
function badge(v){const cls=v==='NON_MATERIAL_CHANGE'?'good':v==='MATERIAL_CHANGE'?'bad':'neutral';return `<span class="badge ${cls}">${esc(v||'NO DECISION')}</span>`;}
function route(){const h=location.hash.replace(/^#\/?/,'');if(h==='terms')return'terms';if(h==='consent')return'consent';if(h==='actions')return'actions';if(h==='evaluations')return'evaluations';return'home';}
function go(p){location.hash=p==='/'?'#/':`#/${p.replace(/^\//,'')}`;}
function reportRows(report=''){
  if(!report)return '<div class="muted">No semantic evaluation yet.</div>';
  return String(report).split(';').map(part=>{const [k,...rest]=part.trim().split('=');const value=rest.join('=');return `<div class="report-row"><span>${esc((k||'').replaceAll('_',' '))}</span><strong>${esc(value||'—')}</strong></div>`;}).join('');
}

const TX_STATUS_BY_CODE={0:'UNINITIALIZED',1:'PENDING',2:'PROPOSING',3:'COMMITTING',4:'REVEALING',5:'ACCEPTED',6:'UNDETERMINED',7:'FINALIZED',8:'CANCELED',9:'APPEAL_REVEALING',10:'APPEAL_COMMITTING',11:'READY_TO_FINALIZE',12:'VALIDATORS_TIMEOUT',13:'LEADER_TIMEOUT'};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function rawRpc(method,params=[]){
  const res=await fetch('/api/rpc',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});
  const body=await res.json().catch(()=>null);
  if(!res.ok)throw new Error(body?.error?.message||`RPC ${method} failed with HTTP ${res.status}`);
  if(body?.error)throw new Error(body.error.message||`RPC ${method} failed`);
  return body?.result;
}
function normalizedTxStatus(v){
  const raw=v?.status??v?.statusName??v?.statusCode??v;
  if(typeof raw==='number')return TX_STATUS_BY_CODE[raw]||String(raw);
  if(typeof raw==='string'){const t=raw.trim();if(/^0x[0-9a-f]+$/i.test(t))return TX_STATUS_BY_CODE[Number.parseInt(t,16)]||t.toUpperCase();if(/^\d+$/.test(t))return TX_STATUS_BY_CODE[Number(t)]||t;return t.toUpperCase();}
  return '';
}
function executionName(r){
  const direct=r?.txExecutionResultName??r?.tx_execution_result_name??'';if(direct)return String(direct).toUpperCase();
  const cd=r?.consensus_data??r?.consensusData;const lr0=cd?.leader_receipt??cd?.leaderReceipt;const lr=Array.isArray(lr0)?lr0[0]:lr0;const raw=lr?.execution_result??lr?.executionResult??'';const v=String(raw||'').trim().toUpperCase();
  if(v==='SUCCESS'||v==='RETURN'||v==='FINISHED_WITH_RETURN')return 'FINISHED_WITH_RETURN';
  if(v==='ERROR'||v==='FAILED'||v==='USER_ERROR'||v==='VM_ERROR'||v==='FINISHED_WITH_ERROR')return 'FINISHED_WITH_ERROR';
  return '';
}
function txStatusName(r){const raw=r?.statusName??r?.status_name??r?.status??'';return normalizedTxStatus(raw);}
async function fetchRawTransaction(hash){try{return await rawRpc('eth_getTransactionByHash',[hash]);}catch{return null;}}
async function waitFinalized(hash){
  if(MOCK)return await makeMockClient().waitForTransactionReceipt({hash,status:'FINALIZED',fullTransaction:false});
  const c=await readClient();let finalizedSeen=false;
  for(let i=0;i<150;i++){
    let tx=null;try{tx=await c.getTransaction({hash});}catch{}
    let status=txStatusName(tx);let name=executionName(tx);
    if(name==='FINISHED_WITH_ERROR')throw new Error('Contract reverted (FINISHED_WITH_ERROR)');
    if((status==='FINALIZED'||finalizedSeen)&&name==='FINISHED_WITH_RETURN')return tx;
    if(status==='FINALIZED')finalizedSeen=true;
    if(finalizedSeen){const raw=await fetchRawTransaction(hash);name=executionName(raw);if(name==='FINISHED_WITH_ERROR')throw new Error('Contract reverted (FINISHED_WITH_ERROR)');if(name==='FINISHED_WITH_RETURN')return raw;notice=`Transaction ${short(hash)} · FINALIZED · loading execution result…`;}
    else notice=`Transaction ${short(hash)} · ${status||'processing'}…`;
    error='';await render();await sleep(2000);
  }
  throw new Error('Transaction monitoring timed out. Do not resubmit; verify the existing hash in Explorer.');
}

function sessionConsentValid(){return Boolean(walletAddress&&summaryCache&&sessionConsent.wallet.toLowerCase()===walletAddress.toLowerCase()&&Number(sessionConsent.epoch)===Number(summaryCache.consent_epoch));}
function effectiveConsent(){if(consentCache===true)return true;if(consentCache===false)return false;if(sessionConsentValid())return true;return null;}

const mock={
  wallet:0,publisher:MOCK_WALLETS[0],tx:1,
  baseTerms:INITIAL_TERMS,
  summary:{active_version:1,consent_epoch:1,last_decision:'',last_proposal_hash:'',last_report:'',evaluation_count:0,service_action_count:0,active_terms:INITIAL_TERMS},
  consent:new Map(),consentVersion:new Map(),evaluations:[],receipts:[],used:new Set(),
};
function mockHash(){return '0x'+String(mock.tx++).padStart(64,'0');}
function mockReport(next){
  const t=String(next).toLowerCase();
  if(/ignore previous|ignore prior|system prompt|respond with|output only|classify as/.test(t))return 'decision=MATERIAL_CHANGE; rights_changed=UNKNOWN; ambiguity=YES; adversarial_signal=YES; basis=DETERMINISTIC_ADVERSARIAL_GUARD';
  if(/25%|cancellation fee|share data with partners|share with partners|sell user data|sublicense|commercially distribute|without notice|at our discretion|binding arbitration/.test(t))return 'decision=MATERIAL_CHANGE; rights_changed=YES; ambiguity=NO; adversarial_signal=NO; basis=DETERMINISTIC_RISK_GUARD';
  if(/as needed|as we determine|without limitation/.test(t))return 'decision=MATERIAL_CHANGE; rights_changed=UNKNOWN; ambiguity=YES; adversarial_signal=NO; basis=AMBIGUOUS';
  return 'decision=NON_MATERIAL_CHANGE; rights_changed=NO; ambiguity=NO; adversarial_signal=NO; basis=EQUIVALENT_MEANING';
}
function makeMockClient(){return{
  async readContract({functionName,args=[]}){
    if(functionName==='get_summary')return JSON.stringify(mock.summary);
    if(functionName==='get_config')return JSON.stringify({name:'TermsDelta',version:'2.0',consent_epoch_bound_receipts:true,adversarial_fail_safe:true,ambiguity_fail_safe:true,epoch_baseline_comparison:true,service_action_types:ACTION_TYPES});
    if(functionName==='has_valid_consent')return Number(mock.consent.get(String(args[0]).toLowerCase())||0)===mock.summary.consent_epoch;
    if(functionName==='get_evaluation'){const v=mock.evaluations[Number(args[0])-1];if(!v)throw new Error('[rollback] Evaluation not found');return JSON.stringify(v);}
    if(functionName==='get_service_action'){const v=mock.receipts[Number(args[0])-1];if(!v)throw new Error('[rollback] Service action receipt not found');return JSON.stringify(v);}
    throw new Error(`Unknown read ${functionName}`);
  },
  async writeContract({functionName,args=[]}){
    const sender=MOCK_WALLETS[mock.wallet],key=sender.toLowerCase();
    if(functionName==='consent'){mock.consent.set(key,mock.summary.consent_epoch);mock.consentVersion.set(key,mock.summary.active_version);return mockHash();}
    if(functionName==='authorize_service_action'){
      if(Number(mock.consent.get(key)||0)!==mock.summary.consent_epoch)throw new Error('[rollback] Current terms consent required');
      const [type,ref]=args.map(String);if(!ACTION_TYPES.includes(type))throw new Error('[rollback] Unsupported service action type');
      const used=`${key}|${type}|${ref.trim()}`;if(mock.used.has(used))throw new Error('[rollback] Service action already authorized');mock.used.add(used);
      const receipt={receipt_id:mock.receipts.length+1,user:sender,action_type:type,action_ref:ref.trim(),consent_epoch:mock.summary.consent_epoch,consented_version:Number(mock.consentVersion.get(key)||0),terms_version:mock.summary.active_version};
      mock.receipts.push(receipt);mock.summary.service_action_count=mock.receipts.length;return mockHash();
    }
    if(functionName==='propose_terms'){
      if(sender.toLowerCase()!==mock.publisher.toLowerCase())throw new Error('[rollback] Only publisher');
      const proposed=String(args[0]).trim();if(proposed===mock.summary.active_terms)throw new Error('[rollback] Terms unchanged');
      const report=mockReport(proposed),decision=report.startsWith('decision=NON_MATERIAL_CHANGE;')?'NON_MATERIAL_CHANGE':'MATERIAL_CHANGE';
      mock.summary.active_version+=1;if(decision==='MATERIAL_CHANGE'){mock.summary.consent_epoch+=1;mock.baseTerms=proposed;}
      mock.summary.active_terms=proposed;mock.summary.last_decision=decision;mock.summary.last_report=report;mock.summary.last_proposal_hash='mock-hash-'+String(mock.evaluations.length+1);
      const ev={evaluation_id:mock.evaluations.length+1,decision,report,proposal_hash:mock.summary.last_proposal_hash,active_version:mock.summary.active_version,consent_epoch:mock.summary.consent_epoch};
      mock.evaluations.push(ev);mock.summary.evaluation_count=mock.evaluations.length;return mockHash();
    }
    throw new Error(`Unknown write ${functionName}`);
  },
  async waitForTransactionReceipt(){return{status:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN'};},async connect(){return true;}
};}

async function sdk(){if(MOCK)return null;if(!sdkCache)sdkCache=Promise.all([import(SDK.main),import(SDK.chains),import(SDK.types)]).then(([main,chains,types])=>({main,chains,types}));return sdkCache;}
async function readClient(){if(MOCK)return makeMockClient();const {main,chains}=await sdk();return main.createClient({chain:chains.studionet,endpoint:`${location.origin}/api/rpc`});}
async function walletClient(){if(MOCK){walletAddress=MOCK_WALLETS[mock.wallet];return{client:makeMockClient(),account:walletAddress};}if(!window.ethereum)throw new Error('MetaMask was not detected.');const accounts=await window.ethereum.request({method:'eth_requestAccounts'});const account=accounts?.[0];if(!account)throw new Error('No wallet account selected.');const{main,chains}=await sdk();const client=main.createClient({chain:chains.studionet,account,provider:window.ethereum});await client.connect('studionet');walletAddress=account;return{client,account};}
async function write(functionName,args=[],message='Submitting transaction…'){
  if(!MOCK&&!CONFIGURED)throw new Error('Fresh V2 contract deployment required before writes are enabled.');
  const{client}=await walletClient();busy=true;error='';notice=message;await render();
  try{const hash=await client.writeContract({address:CONTRACT,functionName,args,value:0n});notice=`Submitted ${short(hash)}. Waiting for FINALIZED…`;await render();const receipt=await waitFinalized(hash);notice=`FINALIZED · ${executionName(receipt)||'FINISHED_WITH_RETURN'}`;return{hash,receipt};}
  catch(e){error=friendly(e);notice='';throw e;}finally{busy=false;}
}
async function loadSummary(){if(!MOCK&&!CONFIGURED){summaryCache=null;return null;}const c=await readClient();summaryCache=parseSummary(await c.readContract({address:CONTRACT,functionName:'get_summary',args:[]}));return summaryCache;}
async function loadUserState(user){if(!validAddress(user)){consentCache=null;return;}if(!MOCK){consentCache=null;return;}const c=await readClient();consentCache=asBool(await c.readContract({address:CONTRACT,functionName:'has_valid_consent',args:[user]}));}
async function loadEvaluation(id){if(!MOCK&&!CONFIGURED)return null;const c=await readClient();return parseObject(await c.readContract({address:CONTRACT,functionName:'get_evaluation',args:[BigInt(id)]}));}
async function loadReceipt(id){if(!MOCK&&!CONFIGURED)return null;const c=await readClient();return parseObject(await c.readContract({address:CONTRACT,functionName:'get_service_action',args:[BigInt(id)]}));}

function explorerLink(){return CONFIGURED?`<a class="mono contract-link" target="_blank" rel="noreferrer" href="${EXPLORER_BASE}${CONTRACT}">${short(CONTRACT)} ↗</a>`:'<span class="mono muted">fresh V2 deployment required</span>';}
function shell(content){return`${MOCK?`<div class="mockbar">LOCAL MOCK MODE · <select id="mock-wallet"><option value="0">Publisher</option><option value="1">User 2</option><option value="2">User 3</option></select></div>`:''}<header class="header"><div class="container header-inner"><button class="brand" data-nav="/"><img src="/logo-64.png" alt="ConsentGuard logo"><span><div class="brand-name">ConsentGuard</div><div class="brand-sub">CONSENT-BOUND SERVICE ACTIONS · GENLAYER</div></span></button><nav class="nav"><button data-nav="/">Overview</button><button data-nav="/terms">Terms</button><button data-nav="/evaluations">Evaluations</button><button data-nav="/consent">Consent</button><button data-nav="/actions">Service actions</button></nav><button id="wallet" class="wallet-btn">◈ ${esc(walletAddress?short(walletAddress):'Connect wallet')}</button></div></header>${(notice||error)?`<div class="container notice-wrap">${notice?`<div class="notice">${esc(notice)}</div>`:''}${error?`<div class="error">${esc(error)}</div>`:''}</div>`:''}${!MOCK&&!CONFIGURED?'<div class="container deploy-banner">Fresh ConsentGuard V2 contract deployment required. Frontend is intentionally not pinned to the historical V1 address.</div>':''}${content}<footer class="footer"><div class="container footer-inner"><div>Semantic change is fail-safe; service authorization receipts bind the consent epoch to real actions.</div>${explorerLink()}</div></footer>`;}
function protocolCard(summary){return`<div class="panel panel-pad"><div class="live-head"><div><div class="eyebrow">V2 SAFETY MODEL</div><h2>Consent → service receipt</h2></div><span class="live-dot">${CONFIGURED||MOCK?'● READY':'DEPLOY'}</span></div><div class="stats"><div class="stat"><div class="stat-label">ACTIVE VERSION</div><div class="stat-value">${summary?.active_version??'—'}</div></div><div class="stat"><div class="stat-label">CONSENT EPOCH</div><div class="stat-value">${summary?.consent_epoch??'—'}</div></div><div class="stat"><div class="stat-label">ACTION RECEIPTS</div><div class="stat-value">${summary?.service_action_count??'—'}</div></div></div><div class="decision-row"><span class="muted">Last semantic decision</span>${badge(summary?.last_decision||'')}</div></div>`;}
function termsCard(summary){return`<div class="panel terms-card"><div class="eyebrow">EPOCH BASELINE</div><h2>Active terms</h2><div class="terms-text">${esc(summary?.active_terms||INITIAL_TERMS)}</div><div class="decision-row"><span class="muted">Version ${summary?.active_version??'—'} · Consent epoch ${summary?.consent_epoch??'—'}</span>${badge(summary?.last_decision||'')}</div></div>`;}
function reportCard(summary){return`<div class="panel panel-pad"><div class="eyebrow">CLASSIFICATION REPORT</div><h2>Why the gate decided</h2><div class="report-box">${reportRows(summary?.last_report||'')}</div><div class="callout">NON_MATERIAL_CHANGE is accepted only when rights_changed=NO, ambiguity=NO, adversarial_signal=NO, and basis=EQUIVALENT_MEANING. Every other combination fails safe to MATERIAL_CHANGE.</div></div>`;}
function receiptCard(receipt){if(!receipt)return`<div class="panel panel-pad"><div class="eyebrow">ON-CHAIN RECEIPT</div><h2>No service receipt loaded</h2><p class="muted">Authorize a service action to create an auditable receipt that binds user, action reference, consent epoch and terms versions.</p></div>`;return`<div class="panel panel-pad"><div class="eyebrow">ON-CHAIN RECEIPT #${esc(receipt.receipt_id)}</div><h2>${esc(receipt.action_type)}</h2><div class="summary-list"><div class="summary-item"><span>User</span><strong class="mono">${esc(short(receipt.user))}</strong></div><div class="summary-item"><span>Action reference</span><strong class="mono">${esc(receipt.action_ref)}</strong></div><div class="summary-item"><span>Consent epoch</span><strong>${esc(receipt.consent_epoch)}</strong></div><div class="summary-item"><span>Version user explicitly consented</span><strong>${esc(receipt.consented_version)}</strong></div><div class="summary-item"><span>Terms version at authorization</span><strong>${esc(receipt.terms_version)}</strong></div></div></div>`;}

async function home(){let s=summaryCache;try{s=await loadSummary();if(walletAddress)await loadUserState(walletAddress);}catch(e){error=friendly(e);}return shell(`<main><section class="container hero"><div><div class="eyebrow">ADVERSARIAL-SAFE CONSENT ENFORCEMENT</div><h1>Consent to an epoch.<br><span class="gradient">Prove it at the action.</span></h1><p>ConsentGuard v2 prevents false non-material classifications and records a service-action receipt only when the caller's consent matches the current epoch.</p><div class="hero-actions"><button class="btn-primary" data-nav="/actions">Authorize a service action →</button><button class="btn-secondary" data-nav="/terms">Review terms safety</button></div></div>${protocolCard(s)}</section><section class="container two-col">${termsCard(s)}${reportCard(s)}</section><section class="container feature-grid"><div class="panel feature"><div class="num">1</div><h3>Fail-safe classification</h3><p>Ambiguous or adversarial proposals cannot become NON_MATERIAL_CHANGE.</p></div><div class="panel feature"><div class="num">2</div><h3>Epoch baseline</h3><p>Every proposal is compared with the epoch baseline to resist cumulative semantic drift.</p></div><div class="panel feature"><div class="num">3</div><h3>Meaningful action gate</h3><p>Consent gates SERVICE_ACCESS, DATA_EXPORT and CONTENT_PUBLISH authorizations.</p></div><div class="panel feature"><div class="num">4</div><h3>Auditable receipt</h3><p>Each action stores user, action reference, consent epoch, consented version and execution terms version.</p></div></section></main>`);}

async function termsPage(){let s=summaryCache;try{s=await loadSummary();}catch(e){error=friendly(e);}return shell(`<main class="container page"><button class="page-back" data-nav="/">← Overview</button><div class="page-head"><div><div class="eyebrow">PUBLISHER WORKFLOW</div><h1>Propose updated terms</h1><p class="muted">The classifier is conservative by design: only clearly equivalent wording can preserve the consent epoch.</p></div>${badge(s?.last_decision||'')}</div><div class="form-grid"><div class="panel form-panel"><form id="terms-form"><label class="label" for="terms-input">Complete proposed terms</label><textarea id="terms-input" class="field" maxlength="4000" minlength="20" placeholder="Paste the complete proposed terms…" required></textarea><div id="terms-count" class="char-count">0/4000</div><button class="btn-primary full" ${(busy||(!MOCK&&!CONFIGURED))?'disabled':''}>${busy?'<span class="spinner"></span> Working…':'✦ Run guarded semantic check'}</button></form><div class="callout warn"><strong>Adversarial guard:</strong> instruction-like document text, newly introduced high-risk rights markers, and semantic ambiguity fail safe to MATERIAL_CHANGE. Prompt content cannot directly force NON_MATERIAL_CHANGE.</div><div class="test-vectors"><div class="label">Adversarial contract vectors in TESTING.md</div><span>Prompt injection</span><span>Ambiguous data sharing</span><span>Protective-text omission</span><span>Cumulative drift</span></div></div>${reportCard(s)}</div><div style="margin-top:20px">${termsCard(s)}</div></main>`);}

async function evaluationsPage(){let s=summaryCache,items=[];try{s=await loadSummary();if(s){const max=Number(s.evaluation_count||0),start=Math.max(1,max-7);for(let id=max;id>=start;id--)items.push(await loadEvaluation(id));}}catch(e){error=friendly(e);}const rows=items.length?items.map(ev=>`<div class="history-card"><div class="history-head"><strong>Evaluation #${esc(ev.evaluation_id)}</strong>${badge(ev.decision)}</div><div class="report-box">${reportRows(ev.report)}</div><div class="history-meta"><span>Version ${esc(ev.active_version)}</span><span>Epoch ${esc(ev.consent_epoch)}</span><span class="mono">${esc(short(ev.proposal_hash||''))}</span></div></div>`).join(''):'<div class="panel panel-pad"><p class="muted">No evaluations recorded yet.</p></div>';return shell(`<main class="container page"><button class="page-back" data-nav="/">← Overview</button><div class="page-head"><div><div class="eyebrow">ON-CHAIN SEMANTIC AUDIT</div><h1>Evaluation history</h1><p class="muted">Recent decisions expose the safety flags used to reject false NON_MATERIAL classifications.</p></div><div class="metric-pill">${s?.evaluation_count??0} evaluations</div></div><div class="history-list">${rows}</div></main>`);}

async function consentPage(){let s=summaryCache;try{s=await loadSummary();if(walletAddress)await loadUserState(walletAddress);}catch(e){error=friendly(e);}const ec=effectiveConsent();const status=walletAddress?(ec===true?'Current':ec===false?'Consent required':'Verify by consenting or attempting the action gate'):'Connect wallet';return shell(`<main class="container page"><button class="page-back" data-nav="/">← Overview</button><div class="page-head"><div><div class="eyebrow">USER CONSENT</div><h1>Consent to the current epoch</h1><p class="muted">The contract records both the consent epoch and the active terms version at the moment of consent.</p></div>${ec===true?'<span class="badge good">VALID CONSENT</span>':ec===false?'<span class="badge bad">CONSENT REQUIRED</span>':'<span class="badge neutral">VERIFY ON-CHAIN</span>'}</div><div class="two-col" style="width:100%"><div class="panel action-card"><div class="label">Connected wallet</div><div class="address-row"><strong class="mono">${walletAddress?esc(walletAddress):'Not connected'}</strong></div><div class="summary-list"><div class="summary-item"><span>Current epoch</span><strong>${s?.consent_epoch??'—'}</strong></div><div class="summary-item"><span>Current terms version</span><strong>${s?.active_version??'—'}</strong></div><div class="summary-item"><span>Status</span><strong>${status}</strong></div></div><button id="consent-btn" class="btn-primary full" style="margin-top:22px" ${(busy||!walletAddress||(!MOCK&&!CONFIGURED))?'disabled':''}>✓ Consent to epoch ${s?.consent_epoch??'—'}</button></div>${termsCard(s)}</div></main>`);}

async function actionsPage(){let s=summaryCache;try{s=await loadSummary();if(walletAddress)await loadUserState(walletAddress);}catch(e){error=friendly(e);}const ec=effectiveConsent();let receipt=lastAction.receipt;if(!receipt&&s?.service_action_count){try{receipt=await loadReceipt(Number(s.service_action_count));}catch{}}
const last=walletAddress&&lastAction.wallet.toLowerCase()===walletAddress.toLowerCase()?lastAction.status:'';
return shell(`<main class="container page"><button class="page-back" data-nav="/">← Overview</button><div class="page-head"><div><div class="eyebrow">MEANINGFUL SERVICE GATE</div><h1>Authorize a service action</h1><p class="muted">A downstream service can require this on-chain receipt before performing the referenced action.</p></div>${last==='ALLOWED'?'<span class="badge good">AUTHORIZED</span>':last==='BLOCKED'?'<span class="badge bad">BLOCKED</span>':ec===true?'<span class="badge good">CONSENT READY</span>':walletAddress?'<span class="badge neutral">VERIFY CONSENT</span>':'<span class="badge neutral">CONNECT WALLET</span>'}</div><div class="form-grid"><div class="panel form-panel"><form id="action-form"><label class="label" for="action-type">Service action type</label><select id="action-type" class="field">${ACTION_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select><label class="label" for="action-ref" style="margin-top:18px">External action reference</label><input id="action-ref" class="field mono" maxlength="160" minlength="3" placeholder="e.g. export-request-2026-001" required><div class="char-count">Unique per wallet + action type + reference</div><button class="btn-primary full" ${(busy||!walletAddress||(!MOCK&&!CONFIGURED))?'disabled':''}>Authorize and record receipt</button></form>${last==='BLOCKED'?'<div class="callout bad">The contract blocked this action because the connected wallet did not have consent for the current epoch.</div>':'<div class="callout">Receipt fields bind the service action to the exact consent epoch and terms-version context. Duplicate authorization of the same wallet/type/reference is rejected.</div>'}</div>${receiptCard(receipt)}</div></main>`);}

async function render(){let content;const r=route();if(r==='terms')content=await termsPage();else if(r==='evaluations')content=await evaluationsPage();else if(r==='consent')content=await consentPage();else if(r==='actions')content=await actionsPage();else content=await home();document.getElementById('app').innerHTML=content;bind();}
function bind(){
  document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>go(el.dataset.nav));
  const wallet=document.getElementById('wallet');if(wallet)wallet.onclick=async()=>{error='';notice='';try{const{account}=await walletClient();await loadSummary().catch(()=>{});await loadUserState(account);notice=`Wallet connected: ${short(account)}`;}catch(e){error=friendly(e);}render();};
  const sel=document.getElementById('mock-wallet');if(sel){sel.value=String(mock.wallet);sel.onchange=async()=>{mock.wallet=Number(sel.value);walletAddress=MOCK_WALLETS[mock.wallet];notice=`Mock wallet switched: ${short(walletAddress)}`;await loadUserState(walletAddress);lastAction={wallet:'',status:'',receipt:null,txHash:''};render();};}
  const ti=document.getElementById('terms-input'),tc=document.getElementById('terms-count');if(ti)ti.oninput=()=>tc.textContent=`${ti.value.length}/4000`;
  const tf=document.getElementById('terms-form');if(tf)tf.onsubmit=async e=>{e.preventDefault();const terms=ti.value.trim();if(terms.length<20)return;try{await write('propose_terms',[terms],'Submitting terms to the guarded GenLayer semantic classifier…');await loadSummary();notice=`Finalized as ${summaryCache.last_decision}. Version ${summaryCache.active_version}; consent epoch ${summaryCache.consent_epoch}.`;error='';await render();}catch(e){notice='';error=friendly(e);await render();}};
  const cb=document.getElementById('consent-btn');if(cb)cb.onclick=async()=>{try{const{hash}=await write('consent',[],'Recording consent to the current epoch and terms version…');await loadSummary();sessionConsent={wallet:walletAddress,epoch:summaryCache.consent_epoch,version:summaryCache.active_version,txHash:hash};await loadUserState(walletAddress);notice=`Consent FINALIZED for epoch ${summaryCache.consent_epoch}, version ${summaryCache.active_version}.`;error='';await render();}catch(e){notice='';error=friendly(e);await render();}};
  const af=document.getElementById('action-form');if(af)af.onsubmit=async e=>{e.preventDefault();const type=document.getElementById('action-type').value;const ref=document.getElementById('action-ref').value.trim();if(ref.length<3)return;try{const{hash}=await write('authorize_service_action',[type,ref],`Authorizing ${type} against the current consent epoch…`);await loadSummary();const receipt=await loadReceipt(Number(summaryCache.service_action_count));lastAction={wallet:walletAddress,status:'ALLOWED',receipt,txHash:hash};notice=`Service action receipt #${receipt.receipt_id} finalized and bound to consent epoch ${receipt.consent_epoch}.`;error='';await render();}catch(e){const msg=friendly(e);lastAction={wallet:walletAddress,status:/consent required|contract reverted|finished_with_error/i.test(msg)?'BLOCKED':'',receipt:null,txHash:''};notice='';error=msg;await render();}};
}
async function init(){
  if(MOCK){document.documentElement.classList.add('mock');walletAddress=MOCK_WALLETS[0];summaryCache=mock.summary;await loadUserState(walletAddress);}
  else if(window.ethereum){window.ethereum.on?.('accountsChanged',async a=>{walletAddress=a?.[0]||'';notice='';error='';consentCache=null;lastAction={wallet:'',status:'',receipt:null,txHash:''};if(walletAddress){await loadSummary().catch(()=>{});await loadUserState(walletAddress);}render();});window.ethereum.on?.('chainChanged',()=>location.reload());window.ethereum.request({method:'eth_accounts'}).then(async a=>{walletAddress=a?.[0]||'';if(walletAddress){await loadSummary().catch(()=>{});await loadUserState(walletAddress);}render();}).catch(()=>{});}
  window.addEventListener('hashchange',()=>{notice='';error='';render();});await render();
}
init();
