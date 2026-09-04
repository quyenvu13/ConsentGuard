import { readFile, access } from 'node:fs/promises';
const must=[
  'contracts/ConsentGuard.py','public/logo.png','public/logo-192.png','public/logo-64.png','public/favicon.png','public/og-image.png','public/manifest.json',
  'src/app.js','src/index.css','src/contract-config.js','api/rpc.js','index.html','README.md','TESTING.md','CHANGELOG.md','tests/adversarial_cases.json','vercel.json'
];
for(const f of must) await access(new URL(`../${f}`,import.meta.url));
const config=await readFile(new URL('../src/contract-config.js',import.meta.url),'utf8');
if(config.includes('0xB13A47565248c9A11A74b2C20D71aB930960B8a2')) throw new Error('historical V1 address must not be configured');
const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
for(const method of ['get_summary','get_evaluation','get_service_action','has_valid_consent','consent','propose_terms','authorize_service_action']) if(!app.includes(method)) throw new Error(`frontend method missing: ${method}`);
for(const verdict of ['MATERIAL_CHANGE','NON_MATERIAL_CHANGE']) if(!app.includes(verdict)) throw new Error(`verdict missing: ${verdict}`);
for(const field of ['rights_changed','ambiguity','adversarial_signal','service_action_count']) if(!app.includes(field)) throw new Error(`v2 evidence field missing: ${field}`);
const contract=await readFile(new URL('../contracts/ConsentGuard.py',import.meta.url),'utf8');
for(const method of ['get_config','get_summary','get_evaluation','get_service_action','authorize_service_action']) if(!contract.includes(`def ${method}`)) throw new Error(`contract method missing: ${method}`);
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
if(!html.includes('/logo')&&!html.includes('favicon')) throw new Error('branding reference missing');
console.log('PASS GitHub project structure');
console.log('PASS historical V1 address is not configured');
console.log('PASS V2 contract read/write method coverage');
console.log('PASS semantic report + service receipt UI coverage');
