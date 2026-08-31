import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const expected='2afea9ccffb7dff34fa581528eb669d0b2df996872a3e8d59f369d145fd0be55';
const source=await readFile(new URL('../contracts/ConsentGuard.py',import.meta.url));
const actual=createHash('sha256').update(source).digest('hex');
if(actual!==expected) throw new Error(`FAIL source parity ${actual}`);
console.log(`PASS source parity ${actual}`);
