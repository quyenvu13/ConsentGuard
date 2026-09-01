const UPSTREAM = 'https://studio.genlayer.com/api';
const SAFE_RETRY_METHODS = new Set(['eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBalance','eth_call','eth_chainId','net_version','gen_call','gen_getTransactionStatus','gen_getTransactionReceipt']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const payload = req.body;
  const method = Array.isArray(payload) ? undefined : payload?.method;
  const attempts = typeof method === 'string' && SAFE_RETRY_METHODS.has(method) ? 2 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await upstream.text();
      if (upstream.status === 429 && attempt < attempts) {
        await sleep(attempt * 1500);
        continue;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.status(upstream.status);
      try { return res.json(JSON.parse(text)); } catch { return res.send(text); }
    } catch (err) {
      if (attempt < attempts) {
        await sleep(attempt * 1500);
        continue;
      }
      return res.status(502).json({
        jsonrpc: '2.0',
        id: payload?.id ?? null,
        error: { code: -32098, message: `StudioNet proxy failed: ${err?.message ?? String(err)}` },
      });
    }
  }
}
