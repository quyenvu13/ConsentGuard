import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const expected='6a092389718cf2418293f8fbfca612c085602994af052c04b1f768f11b35a3f5';
const source=await readFile(new URL('../contracts/ConsentGuard.py',import.meta.url));
const actual=createHash('sha256').update(source).digest('hex');
if(actual!==expected) throw new Error(`FAIL source parity ${actual}`);
console.log(`PASS source parity ${actual}`);
