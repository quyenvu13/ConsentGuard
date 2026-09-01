import { createClient } from 'https://esm.unpkg.com/genlayer-js@1.1.8'
import { studionet } from 'https://esm.unpkg.com/genlayer-js@1.1.8/chains'
import { ExecutionResult, TransactionStatus } from 'https://esm.unpkg.com/genlayer-js@1.1.8/types'

export const CONTRACT_ADDRESS = '0xFaCB1C2F37C33137C359a5efd66Eb3E21Cf7e123'
export const EXPLORER_BASE = 'https://explorer-studio.genlayer.com'
export const CONTRACT_EXPLORER_URL = `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`

export const readClient = createClient({ chain: studionet })

export function makeWriteClient(account) {
  if (!window.ethereum) throw new Error('MetaMask was not detected in this browser.')
  return createClient({
    chain: studionet,
    account,
    provider: window.ethereum,
  })
}

export async function ensureStudioNet(account) {
  const client = makeWriteClient(account)
  await client.connect('studionet')
  return client
}

export async function readConfig() {
  return readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_config',
    args: [],
    stateStatus: 'accepted',
  })
}

export async function readWorkspace(workspaceId) {
  return readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_workspace',
    args: [Number(workspaceId)],
    stateStatus: 'accepted',
  })
}

export async function readAttempt(attemptId) {
  return readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_attempt',
    args: [Number(attemptId)],
    stateStatus: 'accepted',
  })
}

export async function createWorkspaceTx(account, clauseA, clauseB) {
  const client = await ensureStudioNet(account)
  return client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'create_workspace',
    args: [clauseA, clauseB],
    value: 0n,
  })
}

export async function evaluatePairTx(account, workspace) {
  const client = await ensureStudioNet(account)
  return client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'evaluate_pair',
    args: [
      Number(workspace.workspace_id),
      Number(workspace.clause_a_id),
      Number(workspace.clause_b_id),
    ],
    value: 0n,
  })
}

export async function waitFinalized(txHash) {
  return readClient.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.FINALIZED,
    interval: 5000,
    retries: 240,
    fullTransaction: false,
  })
}

export function executionOutcome(receipt) {
  const name = receipt?.txExecutionResultName || receipt?.executionResultName || ''
  if (name === ExecutionResult.FINISHED_WITH_RETURN || name === 'FINISHED_WITH_RETURN') {
    return { ok: true, name: 'FINISHED_WITH_RETURN' }
  }
  if (name === ExecutionResult.FINISHED_WITH_ERROR || name === 'FINISHED_WITH_ERROR') {
    return { ok: false, name: 'FINISHED_WITH_ERROR' }
  }
  return { ok: false, name: name || 'UNKNOWN' }
}

export function txExplorerUrl(hash) {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function shortAddress(value, left = 6, right = 4) {
  if (!value) return '—'
  if (value.length <= left + right + 3) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

export function cleanError(error) {
  const text = String(error?.shortMessage || error?.message || error || 'Unknown error')
  return text
    .replace(/^Error:\s*/i, '')
    .replace(/\n\s*Details:[\s\S]*$/i, '')
    .trim()
}
