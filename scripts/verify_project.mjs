import { readFile, access } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const must=[
  'contracts/ConsentGuard.py','public/logo.png','public/logo-192.png','public/logo-64.png','public/favicon.png','public/og-image.png','public/manifest.json',
  'src/app.js','src/index.css','src/contract-config.js','api/rpc.js','index.html','README.md','TESTING.md','vercel.json'
];
for(const f of must) await access(new URL(`../${f}`,import.meta.url));
const config=await readFile(new URL('../src/contract-config.js',import.meta.url),'utf8');
if(!config.includes('0xB13A47565248c9A11A74b2C20D71aB930960B8a2')) throw new Error('configured address missing');
const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
for(const method of ['get_summary','has_valid_consent','get_action_count','consent','propose_terms','protected_action']) if(!app.includes(method)) throw new Error(`frontend method missing: ${method}`);
for(const verdict of ['MATERIAL_CHANGE','NON_MATERIAL_CHANGE']) if(!app.includes(verdict)) throw new Error(`verdict missing: ${verdict}`);
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
if(!html.includes('/logo')&&!html.includes('favicon')) throw new Error('branding reference missing');
console.log('PASS GitHub project structure');
console.log('PASS deployed address configured');
console.log('PASS contract read/write method coverage');
console.log('PASS semantic verdict coverage');
