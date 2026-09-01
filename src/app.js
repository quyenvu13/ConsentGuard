const EXPLORER_BASE = window.CONSENTGUARD_CONFIG?.explorerBase || 'https://explorer-studio.genlayer.com/address/';
const SDK = {
  main: 'https://esm.sh/genlayer-js@1.0.0?bundle',
  chains: 'https://esm.sh/genlayer-js@1.0.0/chains?bundle',
  types: 'https://esm.sh/genlayer-js@1.0.0/types?bundle',
};
const MOCK = new URLSearchParams(location.search).get('mock') === '1';
const CONTRACT = window.CONSENTGUARD_CONFIG?.contractAddress || '';
const INITIAL_TERMS = "Users may access the service for personal or commercial purposes. The service may collect basic account information required for operation. Users retain ownership of their submitted content. The provider may suspend accounts only for security incidents, fraud, or violations of these terms. Material changes to these terms require renewed user consent before protected actions continue.";
const MOCK_WALLETS = [
  '0x3065E31B1D993d7C0D59E6786844cBa56780B2d3',
  '0x5a52d040581A76e2C032542855D31480f2ea7097',
  '0xADE4533b5C00Fc6c8E44F674213c081D919aaD1D',
];
let walletAddress = '', sdkCache = null, busy = false, notice = '', error = '', summaryCache = null, consentCache = null, actionCountCache = null;
let parameterReadsAvailable = true;
let sessionConsent = { wallet: '', epoch: null, txHash: '' };
let lastAction = { wallet: '', epoch: null, status: '', txHash: '' };

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function short(v=''){return v.length < 14 ? v : `${v.slice(0,6)}…${v.slice(-4)}`;}
function validAddress(v=''){return /^0x[a-fA-F0-9]{40}$/.test(String(v));}
function friendly(err){const raw=String(err?.shortMessage??err?.message??err??'Unknown error');const rb=raw.match(/\[rollback\]\s*(.+)/i);if(rb)return rb[1];if(/Only publisher/i.test(raw))return'Only the publisher/deployer wallet can propose terms updates.';if(/Current terms consent required/i.test(raw))return'Current terms consent required. Consent to the latest epoch before using the protected action.';if(/user rejected|rejected the request|action_rejected/i.test(raw))return'Wallet signature was rejected.';if(/failed to fetch|network|rpc|blocked/i.test(raw))return`Network/RPC error: ${raw}`;return raw.replace(/^Error:\s*/,'');}
function parseResult(raw){let v=raw;if(v&&typeof v==='object'&&'result' in v)v=v.result;if(typeof v==='string'){const t=v.trim();if(!t)throw new Error('Contract returned an empty response');try{v=JSON.parse(t)}catch{}}return v;}
function asBool(v){const x=parseResult(v);if(typeof x==='boolean')return x;if(typeof x==='number')return x!==0;const s=String(x).trim().toLowerCase();if(s==='true'||s==='1')return true;if(s==='false'||s==='0'||s==='')return false;throw new Error(`Unexpected boolean response: ${x}`);}
function parseSummary(raw){const s=String(parseResult(raw));const m=s.match(/^active_version=(\d+); consent_epoch=(\d+); last_decision=([^;]*); active_terms=(.*)$/s);if(!m)throw new Error(`Unexpected get_summary response: ${s}`);return{active_version:Number(m[1]),consent_epoch:Number(m[2]),last_decision:m[3],active_terms:m[4]};}
function badge(v){const cls=v==='NON_MATERIAL_CHANGE'?'good':v==='MATERIAL_CHANGE'?'bad':'neutral';return `<span class="badge ${cls}">${esc(v||'NO DECISION')}</span>`;}
function route(){const h=location.hash.replace(/^#\/?/,'');if(h==='terms')return'terms';if(h==='consent')return'consent';if(h==='actions')return'actions';return'home';}
function go(p){location.hash=p==='/'?'#/':`#/${p.replace(/^\//,'')}`;}
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
  if(typeof raw==='string'){
    const t=raw.trim();
    if(/^0x[0-9a-f]+$/i.test(t))return TX_STATUS_BY_CODE[Number.parseInt(t,16)]||t.toUpperCase();
    if(/^\d+$/.test(t))return TX_STATUS_BY_CODE[Number(t)]||t;
    return t.toUpperCase();
  }
  return '';
}
async function getTransactionStatusRpc(hash){
  return normalizedTxStatus(await rawRpc('gen_getTransactionStatus',[{txId:hash}]));
}
async function getTransactionReceiptRpc(hash){
  return await rawRpc('gen_getTransactionReceipt',[{txId:hash}]);
}
function executionName(r){return r?.txExecutionResultName??'';}
function txExecutionFailed(r){return executionName(r)==='FINISHED_WITH_ERROR';}
function txExecutionSucceeded(r){return executionName(r)==='FINISHED_WITH_RETURN';}
async function resolveExecutionResult(client,hash,receipt){
 let name=executionName(receipt);
 if(name)return{name,receipt};
 try{const tx=await client.getTransaction({hash});name=executionName(tx);if(name)return{name,receipt:tx};}catch{}
 try{const trace=await client.debugTraceTransaction({hash,round:0});const code=Number(trace?.result_code);if(code===0)return{name:'FINISHED_WITH_RETURN',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_RETURN',traceResultCode:0}};if(code===1||code===2)return{name:'FINISHED_WITH_ERROR',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_ERROR',traceResultCode:code,traceStderr:trace?.stderr??''}};}catch{}
 try{const trace=await rawRpc('gen_dbg_traceTransaction',[{txID:hash,round:0}]);const code=Number(trace?.result_code);if(code===0)return{name:'FINISHED_WITH_RETURN',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_RETURN',traceResultCode:0}};if(code===1||code===2)return{name:'FINISHED_WITH_ERROR',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_ERROR',traceResultCode:code,traceStderr:trace?.stderr??''}};}catch{}
 return{name:'',receipt};
}
function sessionConsentValid(){return Boolean(walletAddress&&summaryCache&&sessionConsent.wallet.toLowerCase()===walletAddress.toLowerCase()&&Number(sessionConsent.epoch)===Number(summaryCache.consent_epoch));}
function effectiveConsent(){if(consentCache===true)return true;if(consentCache===false)return false;if(sessionConsentValid())return true;return null;}

const mock = {wallet:0, publisher:MOCK_WALLETS[0], summary:{active_version:1,consent_epoch:1,last_decision:'',active_terms:INITIAL_TERMS}, consent:new Map(), actions:new Map(), tx:1};
function mockHash(){return '0x'+String(mock.tx++).padStart(64,'0');}
function mockClassify(next){const t=String(next).toLowerCase();const material=/(25%|fee|share your data|data with partners|sell data|termination|suspend at any time|commercial purposes are prohibited|ownership transfers)/.test(t);return material?'MATERIAL_CHANGE':'NON_MATERIAL_CHANGE';}
function makeMockClient(){return{
 async readContract({functionName,args=[]}){if(functionName==='get_summary'){const s=mock.summary;return`active_version=${s.active_version}; consent_epoch=${s.consent_epoch}; last_decision=${s.last_decision}; active_terms=${s.active_terms}`;}if(functionName==='has_valid_consent')return Number(mock.consent.get(String(args[0]).toLowerCase())||0)===mock.summary.consent_epoch;if(functionName==='get_action_count')return Number(mock.actions.get(String(args[0]).toLowerCase())||0);throw new Error(`Unknown read ${functionName}`);},
 async writeContract({functionName,args=[]}){const sender=MOCK_WALLETS[mock.wallet];const key=sender.toLowerCase();if(functionName==='consent'){mock.consent.set(key,mock.summary.consent_epoch);return mockHash();}if(functionName==='protected_action'){if(Number(mock.consent.get(key)||0)!==mock.summary.consent_epoch)throw new Error('[rollback] Current terms consent required');mock.actions.set(key,Number(mock.actions.get(key)||0)+1);return mockHash();}if(functionName==='propose_terms'){if(sender.toLowerCase()!==mock.publisher.toLowerCase())throw new Error('[rollback] Only publisher');const proposed=String(args[0]).trim();if(proposed===mock.summary.active_terms)throw new Error('[rollback] Terms unchanged');const decision=mockClassify(proposed);mock.summary.active_version+=1;mock.summary.last_decision=decision;mock.summary.active_terms=proposed;if(decision==='MATERIAL_CHANGE')mock.summary.consent_epoch+=1;return mockHash();}throw new Error(`Unknown write ${functionName}`);},
 async waitForTransactionReceipt(){return{status:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN'};}, async connect(){return true;}
};}
async function sdk(){if(MOCK)return null;if(!sdkCache)sdkCache=Promise.all([import(SDK.main),import(SDK.chains),import(SDK.types)]).then(([main,chains,types])=>({main,chains,types}));return sdkCache;}
async function readClient(){if(MOCK)return makeMockClient();const {main,chains}=await sdk();return main.createClient({chain:chains.studionet,endpoint:`${location.origin}/api/rpc`});}
async function walletClient(){if(MOCK){walletAddress=MOCK_WALLETS[mock.wallet];return{client:makeMockClient(),account:walletAddress};}if(!window.ethereum)throw new Error('MetaMask was not detected.');const accounts=await window.ethereum.request({method:'eth_requestAccounts'});const account=accounts?.[0];if(!account)throw new Error('No wallet account selected.');const{main,chains}=await sdk();const client=main.createClient({chain:chains.studionet,account,provider:window.ethereum});await client.connect('studionet');walletAddress=account;return{client,account};}
async function walletRpc(method,params=[]){
  if(!window.ethereum?.request)throw new Error('Wallet provider is unavailable');
  return await window.ethereum.request({method,params});
}
async function resolveExecutionResultFromSubmitPath(submitClient,hash,receipt){
  let name=executionName(receipt);
  if(name)return{name,receipt};
  try{const tx=await submitClient.getTransaction({hash});name=executionName(tx);if(name)return{name,receipt:tx};}catch{}
  try{const trace=await submitClient.debugTraceTransaction({hash,round:0});const code=Number(trace?.result_code);if(code===0)return{name:'FINISHED_WITH_RETURN',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_RETURN',traceResultCode:0}};if(code===1||code===2)return{name:'FINISHED_WITH_ERROR',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_ERROR',traceResultCode:code,traceStderr:trace?.stderr??''}};}catch{}
  try{const trace=await walletRpc('gen_dbg_traceTransaction',[{txID:hash,round:0}]);const code=Number(trace?.result_code);if(code===0)return{name:'FINISHED_WITH_RETURN',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_RETURN',traceResultCode:0}};if(code===1||code===2)return{name:'FINISHED_WITH_ERROR',receipt:{...receipt,txExecutionResultName:'FINISHED_WITH_ERROR',traceResultCode:code,traceStderr:trace?.stderr??''}};}catch{}
  return{name:'',receipt};
}
async function waitFinalized(hash,submitClient){
  if(MOCK){
    const receipt=await submitClient.waitForTransactionReceipt({hash,status:'FINALIZED',fullTransaction:false});
    if(executionName(receipt)==='FINISHED_WITH_ERROR')throw new Error('Contract reverted (FINISHED_WITH_ERROR)');
    return receipt;
  }

  // Primary path: poll the SAME MetaMask/provider RPC that submitted the tx.
  // This avoids cross-node lag between the wallet RPC, Vercel proxy and Explorer.
  let providerSupportsGenStatus=true;
  let lastStatus='';
  for(let i=0;i<210;i++){
    if(providerSupportsGenStatus){
      try{
        const status=normalizedTxStatus(await walletRpc('gen_getTransactionStatus',[{txId:hash}]));
        if(status&&status!==lastStatus){
          lastStatus=status;
          notice=`Transaction ${short(hash)} · ${status}${status==='FINALIZED'?' · verifying GenVM result…':'…'}`;
          error='';
          await render();
        }
        if(['CANCELED','VALIDATORS_TIMEOUT','LEADER_TIMEOUT','UNDETERMINED'].includes(status))throw new Error(`Transaction ended with status ${status}`);
        if(status==='FINALIZED'){
          let receipt={status:'FINALIZED'};
          try{receipt=await walletRpc('gen_getTransactionReceipt',[{txId:hash}])||receipt;}catch{}
          for(let j=0;j<30;j++){
            const resolved=await resolveExecutionResultFromSubmitPath(submitClient,hash,receipt);
            if(resolved.name==='FINISHED_WITH_ERROR'){
              const detail=resolved.receipt?.traceStderr?`: ${resolved.receipt.traceStderr}`:'';
              throw new Error(`Contract reverted (FINISHED_WITH_ERROR)${detail}`);
            }
            if(resolved.name==='FINISHED_WITH_RETURN')return resolved.receipt;
            notice=`Transaction ${short(hash)} · FINALIZED · loading GenVM result…`;
            await render();
            await sleep(1200);
          }
          throw new Error('Transaction finalized, but GenVM execution result is not available from the submitting wallet RPC yet.');
        }
      }catch(e){
        const msg=String(e?.message??e).toLowerCase();
        // -32601 / unsupported method: fall back once to the official SDK waiter
        // on the same wallet client, not to the Vercel read proxy.
        if(/method not found|unsupported|does not exist|-32601/.test(msg))providerSupportsGenStatus=false;
        else if(/transaction ended with status|contract reverted/i.test(String(e?.message??e)))throw e;
      }
    }

    if(!providerSupportsGenStatus){
      try{
        const{types}=await sdk();
        const receipt=await submitClient.waitForTransactionReceipt({
          hash,
          status:types.TransactionStatus?.FINALIZED??'FINALIZED',
          fullTransaction:false,
          interval:2000,
          retries:210,
        });
        const resolved=await resolveExecutionResultFromSubmitPath(submitClient,hash,receipt);
        if(resolved.name==='FINISHED_WITH_ERROR')throw new Error('Contract reverted (FINISHED_WITH_ERROR)');
        if(resolved.name==='FINISHED_WITH_RETURN')return resolved.receipt;
        throw new Error('Transaction FINALIZED but execution result is unavailable from the wallet client.');
      }catch(e){
        if(/contract reverted|finalized but execution/i.test(String(e?.message??e)))throw e;
      }
    }
    await sleep(2000);
  }
  throw new Error(`Finalization timeout${lastStatus?` (last status: ${lastStatus})`:''}`);
}

async function write(functionName,args=[],message='Submitting transaction…'){const{client}=await walletClient();busy=true;error='';notice=message;await render();try{const hash=await client.writeContract({address:CONTRACT,functionName,args,value:0n});notice=`Submitted ${short(hash)}. Waiting for FINALIZED…`;await render();const receipt=await waitFinalized(hash,client);notice=`FINALIZED · ${executionName(receipt)||'FINISHED_WITH_RETURN'}`;return{hash,receipt};}catch(e){error=friendly(e);notice='';throw e;}finally{busy=false;}}
async function loadSummary(){const c=await readClient();summaryCache=parseSummary(await c.readContract({address:CONTRACT,functionName:'get_summary',args:[]}));return summaryCache;}
async function loadUserState(user){if(!validAddress(user)){consentCache=null;actionCountCache=null;return;}const c=await readClient();let anyOk=false;try{consentCache=asBool(await c.readContract({address:CONTRACT,functionName:'has_valid_consent',args:[user]}));anyOk=true;}catch{consentCache=null;}try{actionCountCache=Number(parseResult(await c.readContract({address:CONTRACT,functionName:'get_action_count',args:[user]})));anyOk=true;}catch{actionCountCache=null;}parameterReadsAvailable=anyOk;}

function shell(content){return`${MOCK?`<div class="mockbar">LOCAL MOCK MODE · <select id="mock-wallet"><option value="0">Publisher</option><option value="1">User 2</option><option value="2">User 3</option></select></div>`:''}<header class="header"><div class="container header-inner"><button class="brand" data-nav="/"><img src="/logo-64.png" alt="ConsentGuard logo"><span><div class="brand-name">ConsentGuard</div><div class="brand-sub">GenLayer StudioNet</div></span></button><nav class="nav"><button data-nav="/">Overview</button><button data-nav="/terms">Terms</button><button data-nav="/consent">Consent</button><button data-nav="/actions">Protected actions</button></nav><button id="wallet" class="wallet-btn">◈ ${esc(walletAddress?short(walletAddress):'Connect wallet')}</button></div></header>${(notice||error)?`<div class="container notice-wrap">${notice?`<div class="notice">${esc(notice)}</div>`:''}${error?`<div class="error">${esc(error)}</div>`:''}</div>`:''}${content}<footer class="footer"><div class="container footer-inner"><div>AI classifies semantic change. Consent epochs and action gates remain deterministic.</div><a class="mono" target="_blank" rel="noreferrer" href="${EXPLORER_BASE}${CONTRACT}">${short(CONTRACT)} ↗</a></div></footer>`;}
function protocolCard(summary){return`<div class="panel panel-pad"><div class="live-head"><div><div class="eyebrow">LIVE PROTOCOL</div><h2>Consent epoch guard</h2></div><span class="live-dot">● LIVE</span></div><div class="stats"><div class="stat"><div class="stat-label">ACTIVE VERSION</div><div class="stat-value">${summary?.active_version??'—'}</div></div><div class="stat"><div class="stat-label">CONSENT EPOCH</div><div class="stat-value">${summary?.consent_epoch??'—'}</div></div><div class="stat"><div class="stat-label">LAST DECISION</div><div style="margin-top:10px">${badge(summary?.last_decision||'')}</div></div></div><div class="decision-row"><span class="muted">Contract</span><a class="contract-link mono" target="_blank" rel="noreferrer" href="${EXPLORER_BASE}${CONTRACT}">${short(CONTRACT)} ↗</a></div></div>`;}
function termsCard(summary){return`<div class="panel terms-card"><div class="eyebrow">IMMUTABLE CONSENT ANCHOR</div><h2>Active terms</h2><div class="terms-text">${esc(summary?.active_terms||'Loading…')}</div><div class="decision-row"><span class="muted">Version ${summary?.active_version??'—'} · Consent epoch ${summary?.consent_epoch??'—'}</span>${badge(summary?.last_decision||'')}</div></div>`;}
async function home(){let s=summaryCache;try{s=await loadSummary();if(walletAddress)await loadUserState(walletAddress);}catch(e){error=friendly(e);}return shell(`<main><section class="container hero"><div><div class="eyebrow">CONSENT VERSIONING, ENFORCED</div><h1>Update the terms.<br><span class="gradient">Never carry stale consent.</span></h1><p>ConsentGuard lets GenLayer validators decide whether updated terms materially change user rights. Deterministic contract logic advances the consent epoch only when the meaning changes.</p><div class="hero-actions"><button class="btn-primary" data-nav="/consent">Check my consent →</button><button class="btn-secondary" data-nav="/terms">Review terms updates</button></div></div>${protocolCard(s)}</section><section class="container two-col">${termsCard(s)}<div class="panel panel-pad"><div class="eyebrow">CONNECTED USER</div><h2>Consent readiness</h2><div class="summary-list"><div class="summary-item"><span>Wallet</span><strong class="mono">${walletAddress?short(walletAddress):'Not connected'}</strong></div><div class="summary-item"><span>Current consent valid</span><strong>${walletAddress?(effectiveConsent()===true?'YES':effectiveConsent()===false?'NO':'VERIFY'):'—'}</strong></div><div class="summary-item"><span>Protected actions</span><strong>${walletAddress?(actionCountCache??'READ UNAVAILABLE'):'—'}</strong></div></div><div class="callout">A material terms change increments the consent epoch. Existing user consent then becomes stale until that user explicitly consents again.</div></div></section><section class="container feature-grid"><div class="panel feature"><div class="num">1</div><h3>Semantic classification</h3><p>Validators distinguish substantive rights changes from wording or formatting cleanup.</p></div><div class="panel feature"><div class="num">2</div><h3>Consent epochs</h3><p>MATERIAL_CHANGE advances the epoch. NON_MATERIAL_CHANGE keeps existing consent valid.</p></div><div class="panel feature"><div class="num">3</div><h3>Salami-slicing protection</h3><p>Proposals are compared against the epoch baseline, not just the immediately prior wording.</p></div><div class="panel feature"><div class="num">4</div><h3>Deterministic gate</h3><p>Protected actions execute only when the caller consented to the current epoch.</p></div></section></main>`);}
async function termsPage(){let s=summaryCache;try{s=await loadSummary();}catch(e){error=friendly(e);}return shell(`<main class="container page"><button class="page-back" data-nav="/">← Overview</button><div class="page-head"><div><div class="eyebrow">PUBLISHER WORKFLOW</div><h1>Propose updated terms</h1><p class="muted">GenLayer validators compare the proposal against the current epoch baseline and return only MATERIAL_CHANGE or NON_MATERIAL_CHANGE.</p></div>${badge(s?.last_decision||'')}</div><div class="form-grid"><div class="panel form-panel"><form id="terms-form"><label class="label" for="terms-input">Proposed terms</label><textarea id="terms-input" class="field" maxlength="4000" minlength="20" placeholder="Paste the complete proposed terms…" required></textarea><div id="terms-count" class="char-count">0/4000</div><button class="btn-primary full" ${busy?'disabled':''}>${busy?'<span class="spinner"></span> Working…':'✦ Run semantic terms check'}</button></form><div class="callout warn">Publisher-only write. Any connected wallet may inspect the active terms and consent state, but only the deployment publisher can change terms.</div></div>${termsCard(s)}</div></main>`);}
async function consentPage(){let s=summaryCache;try{s=await loadSummary();if(walletAddress)await loadUserState(walletAddress);}catch(e){error=friendly(e);}const ec=effectiveConsent();const status=walletAddress?(ec===true?'Current':ec===false?'Consent required':'Verify by consenting or executing the gate'):'Connect wallet';return shell(`<main class="container page"><button class="page-back" data-nav="/">← Overview</button><div class="page-head"><div><div class="eyebrow">USER CONSENT</div><h1>Consent to the current epoch</h1><p class="muted">Consent is stored per wallet and is valid only while its recorded epoch equals the contract's current consent epoch.</p></div>${ec===true?'<span class="badge good">VALID CONSENT</span>':ec===false?'<span class="badge bad">CONSENT REQUIRED</span>':'<span class="badge neutral">STATUS READ UNAVAILABLE</span>'}</div><div class="two-col" style="width:100%"><div class="panel action-card"><div class="label">Connected wallet</div><div class="address-row"><strong class="mono">${walletAddress?esc(walletAddress):'Not connected'}</strong></div><div class="summary-list"><div class="summary-item"><span>Current epoch</span><strong>${s?.consent_epoch??'—'}</strong></div><div class="summary-item"><span>Status</span><strong>${status}</strong></div></div><button id="consent-btn" class="btn-primary full" style="margin-top:22px" ${(busy||!walletAddress)?'disabled':''}>✓ Consent to epoch ${s?.consent_epoch??'—'}</button></div><div class="panel terms-card"><div class="eyebrow">WHAT YOU ARE ACCEPTING</div><h2>Current active terms</h2><div class="terms-text">${esc(s?.active_terms||'')}</div></div></div></main>`);}
async function actionsPage(){let s=summaryCache;try{s=await loadSummary();if(walletAddress)await loadUserState(walletAddress);}catch(e){error=friendly(e);}const ec=effectiveConsent();const last=walletAddress&&lastAction.wallet.toLowerCase()===walletAddress.toLowerCase()?lastAction.status:'';return shell(`<main class="container page"><button class="page-back" data-nav="/">← Overview</button><div class="page-head"><div><div class="eyebrow">DETERMINISTIC ENFORCEMENT</div><h1>Protected action gate</h1><p class="muted">This demonstration action succeeds only when the connected wallet has valid consent for the current epoch.</p></div>${last==='ALLOWED'?'<span class="badge good">ALLOWED</span>':last==='BLOCKED'?'<span class="badge bad">BLOCKED</span>':ec===true?'<span class="badge good">READY</span>':ec===false?'<span class="badge bad">BLOCKED</span>':walletAddress?'<span class="badge neutral">VERIFY ON-CHAIN</span>':'<span class="badge neutral">CONNECT WALLET</span>'}</div><div class="form-grid"><div class="panel action-card"><div class="label">On-chain action counter</div><div class="action-count">${walletAddress?(actionCountCache??'—'):'—'}</div><p class="muted">${actionCountCache==null&&walletAddress?'Parameterized counter read is unavailable on the current Studio RPC; execution is verified from the finalized GenVM result.':`for ${walletAddress?`<span class="mono">${esc(short(walletAddress))}</span>`:'the connected wallet'}`}</p><button id="action-btn" class="btn-primary full" ${(busy||!walletAddress)?'disabled':''}>Execute protected action</button>${last==='ALLOWED'?'<div class="callout good">Finalized with FINISHED_WITH_RETURN. The protected action was allowed by the contract.</div>':last==='BLOCKED'?'<div class="callout bad">Finalized with contract error. Current terms consent is required.</div>':ec===false?'<div class="callout bad">Your consent is stale or missing. The contract should revert until you consent to the current epoch.</div>':'<div class="callout">Execute once to let the contract itself verify whether this wallet has current consent.</div>'}</div>${protocolCard(s)}</div></main>`);}

async function render(){let content;const r=route();if(r==='terms')content=await termsPage();else if(r==='consent')content=await consentPage();else if(r==='actions')content=await actionsPage();else content=await home();document.getElementById('app').innerHTML=content;bind();}
function bind(){document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>go(el.dataset.nav));const wallet=document.getElementById('wallet');if(wallet)wallet.onclick=async()=>{error='';notice='';try{const{account}=await walletClient();await loadSummary().catch(()=>{});await loadUserState(account);notice=`Wallet connected: ${short(account)}`;}catch(e){error=friendly(e);}render();};const sel=document.getElementById('mock-wallet');if(sel){sel.value=String(mock.wallet);sel.onchange=async()=>{mock.wallet=Number(sel.value);walletAddress=MOCK_WALLETS[mock.wallet];notice=`Mock wallet switched: ${short(walletAddress)}`;await loadUserState(walletAddress);render();};}const ti=document.getElementById('terms-input'),tc=document.getElementById('terms-count');if(ti)ti.oninput=()=>tc.textContent=`${ti.value.length}/4000`;const tf=document.getElementById('terms-form');if(tf)tf.onsubmit=async e=>{e.preventDefault();const terms=ti.value.trim();if(terms.length<20)return;try{await write('propose_terms',[terms],'Submitting terms for GenLayer semantic consensus…');await loadSummary();notice=`Finalized as ${summaryCache.last_decision}. Active version is now ${summaryCache.active_version}; consent epoch is ${summaryCache.consent_epoch}.`;await render();}catch{}};const cb=document.getElementById('consent-btn');if(cb)cb.onclick=async()=>{try{const{hash}=await write('consent',[],'Recording consent to the current epoch…');await loadSummary();sessionConsent={wallet:walletAddress,epoch:summaryCache.consent_epoch,txHash:hash};await loadUserState(walletAddress);notice=`Consent FINALIZED successfully for epoch ${summaryCache.consent_epoch}.`;error='';await render();}catch(e){notice='';error=friendly(e);await render();}};const ab=document.getElementById('action-btn');if(ab)ab.onclick=async()=>{try{const{hash}=await write('protected_action',[],'Submitting protected action…');await loadSummary().catch(()=>{});lastAction={wallet:walletAddress,epoch:summaryCache?.consent_epoch??null,status:'ALLOWED',txHash:hash};if(summaryCache)sessionConsent={wallet:walletAddress,epoch:summaryCache.consent_epoch,txHash:sessionConsent.txHash};await loadUserState(walletAddress);notice='Protected action FINALIZED with FINISHED_WITH_RETURN.';error='';await render();}catch(e){const msg=friendly(e);if(/consent required|contract reverted|finished_with_error/i.test(msg)){lastAction={wallet:walletAddress,epoch:summaryCache?.consent_epoch??null,status:'BLOCKED',txHash:''};}notice='';error=msg;await render();}};}
async function init(){if(MOCK){document.documentElement.classList.add('mock');walletAddress=MOCK_WALLETS[0];summaryCache=mock.summary;await loadUserState(walletAddress);}else if(window.ethereum){window.ethereum.on?.('accountsChanged',async a=>{walletAddress=a?.[0]||'';notice='';error='';consentCache=null;actionCountCache=null;lastAction={wallet:'',epoch:null,status:'',txHash:''};if(walletAddress){await loadSummary().catch(()=>{});await loadUserState(walletAddress);}render();});window.ethereum.on?.('chainChanged',()=>location.reload());window.ethereum.request({method:'eth_accounts'}).then(async a=>{walletAddress=a?.[0]||'';if(walletAddress){await loadSummary().catch(()=>{});await loadUserState(walletAddress);}render();}).catch(()=>{});}window.addEventListener('hashchange',()=>{notice='';error='';render();});await render();}
init();
