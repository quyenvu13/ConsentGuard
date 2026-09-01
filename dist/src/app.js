import {
  CONTRACT_ADDRESS,
  CONTRACT_EXPLORER_URL,
  cleanError,
  createWorkspaceTx,
  evaluatePairTx,
  executionOutcome,
  readAttempt,
  readConfig,
  readWorkspace,
  shortAddress,
  txExplorerUrl,
  waitFinalized,
} from './genlayer.js'

const circularExample = {
  a: 'Production deployment may begin only after integration approval is issued.',
  b: 'Integration approval may be issued only after production deployment has begun and has been observed in production.',
}
const executableExample = {
  a: 'Production deployment may begin after staging tests pass.',
  b: 'Integration approval may be issued after production deployment begins and smoke tests pass.',
}

const state = {
  account: '',
  config: null,
  workspace: null,
  attempt: null,
  busy: false,
}

const $ = (id) => document.getElementById(id)
const all = (selector) => [...document.querySelectorAll(selector)]

function setHidden(element, hidden) {
  element.classList.toggle('hidden', hidden)
}
function setWarning(element, message = '') {
  element.textContent = message ? `⚠ ${message}` : ''
  setHidden(element, !message)
}
function setBusy(value) {
  state.busy = value
  $('createWorkspace').disabled = value
  $('inspectWorkspace').disabled = value
  $('evaluatePair').disabled = value || !state.workspace || state.workspace.status !== 'PENDING'
}
function setTx({ phase, label, message, hash = '' }) {
  const card = $('txCard')
  setHidden(card, false)
  card.classList.remove('tx-success', 'tx-danger', 'tx-warn')
  card.classList.add(phase === 'ERROR' ? 'tx-danger' : phase === 'FINALIZED' ? 'tx-success' : 'tx-warn')
  $('txIcon').textContent = phase === 'ERROR' ? '×' : phase === 'FINALIZED' ? '✓' : '◌'
  $('txIcon').classList.toggle('spin', !['ERROR', 'FINALIZED'].includes(phase))
  $('txLabel').textContent = label
  $('txMessage').textContent = message
  const link = $('txLink')
  if (hash) {
    link.href = txExplorerUrl(hash)
    link.textContent = `${shortAddress(hash, 10, 8)} ↗`
    setHidden(link, false)
  } else {
    setHidden(link, true)
  }
}
function updateWallet() {
  $('walletLabel').textContent = state.account ? shortAddress(state.account) : 'Connect wallet'
}
function updateCounts() {
  $('workspaceCount').textContent = state.config ? String(state.config.workspace_count) : '—'
  $('clauseCount').textContent = state.config ? String(state.config.clause_count) : '—'
  $('attemptCount').textContent = state.config ? String(state.config.attempt_count) : '—'
}
function updateTextCounts() {
  $('countA').textContent = `${$('clauseA').value.length}/4000`
  $('countB').textContent = `${$('clauseB').value.length}/4000`
}
function verdictTone(status) {
  if (status === 'ACTIVE') return 'success'
  if (status === 'BLOCKED') return 'danger'
  return 'warn'
}
function renderWorkspace() {
  const workspace = state.workspace
  setHidden($('emptyState'), Boolean(workspace))
  setHidden($('workspaceCard'), !workspace)
  if (!workspace) {
    $('evaluatePair').disabled = true
    return
  }
  $('loadedWorkspaceId').textContent = `#${workspace.workspace_id}`
  const status = $('workspaceStatus')
  status.textContent = workspace.status
  status.className = `badge badge-${verdictTone(workspace.status)}`
  $('workspaceOwner').textContent = shortAddress(workspace.owner, 9, 7)
  $('clauseALabel').textContent = `Clause #${workspace.clause_a_id}`
  $('clauseAText').textContent = workspace.clause_a_text
  $('clauseBLabel').textContent = `Clause #${workspace.clause_b_id}`
  $('clauseBText').textContent = workspace.clause_b_text
  $('workspaceAttempts').textContent = String(workspace.attempt_count)
  $('workspaceBlocks').textContent = String(workspace.deadlock_blocks)
  if (state.attempt) {
    $('verdictText').textContent = state.attempt.verdict
    $('verdictMeta').textContent = `Evaluator ${shortAddress(state.attempt.evaluator)} · cache ${state.attempt.used_cache ? 'hit' : 'miss'}`
    setHidden($('verdictCard'), false)
  } else {
    setHidden($('verdictCard'), true)
  }
  $('evaluatePair').disabled = state.busy || workspace.status !== 'PENDING'
  $('evaluatePair').textContent = workspace.status === 'PENDING' ? '⛨ Evaluate semantic pair' : `Finalized as ${workspace.status}`
}

async function refreshConfig() {
  try {
    setWarning($('configError'))
    state.config = await readConfig()
    updateCounts()
    return state.config
  } catch (error) {
    setWarning($('configError'), `Live read unavailable: ${cleanError(error)}`)
    return null
  }
}

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error('MetaMask is not installed.')
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    state.account = accounts?.[0] || ''
    updateWallet()
  } catch (error) {
    setTx({ phase: 'ERROR', label: 'Wallet connection', message: cleanError(error) })
  }
}

async function findRecordedAttempt(workspaceId) {
  if (!state.config || Number(state.config.attempt_count) < 1) return null
  const maxAttempt = Number(state.config.attempt_count)
  for (let id = maxAttempt; id >= Math.max(1, maxAttempt - 25); id -= 1) {
    try {
      const candidate = await readAttempt(id)
      if (Number(candidate.workspace_id) === Number(workspaceId)) return candidate
    } catch {
      // Read-only fallback: keep scanning actual attempt IDs; never invent a result.
    }
  }
  return null
}

async function loadWorkspace(id = $('workspaceId').value) {
  const parsed = Number(id)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    setWarning($('readError'), 'Enter a valid workspace ID greater than 0.')
    state.workspace = null
    state.attempt = null
    renderWorkspace()
    return null
  }
  try {
    setWarning($('readError'))
    const data = await readWorkspace(parsed)
    state.workspace = data
    $('workspaceId').value = String(parsed)
    state.attempt = Number(data.attempt_count) > 0 ? await findRecordedAttempt(parsed) : null
    renderWorkspace()
    return data
  } catch (error) {
    setWarning($('readError'), cleanError(error))
    state.workspace = null
    state.attempt = null
    renderWorkspace()
    return null
  }
}

async function locateCreatedWorkspace(beforeCount, owner, expectedA, expectedB) {
  const after = await refreshConfig()
  if (!after) return null
  const start = Number(beforeCount) + 1
  const end = Number(after.workspace_count)
  for (let id = start; id <= end; id += 1) {
    try {
      const candidate = await readWorkspace(id)
      if (
        String(candidate.owner).toLowerCase() === String(owner).toLowerCase() &&
        candidate.clause_a_text === expectedA.trim() &&
        candidate.clause_b_text === expectedB.trim()
      ) return candidate
    } catch {
      // Scan only the on-chain range created since the pre-transaction counter.
    }
  }
  return null
}

async function createWorkspace() {
  if (state.busy) return
  if (!state.account) {
    setTx({ phase: 'ERROR', label: 'Create workspace', message: 'Connect MetaMask first.' })
    return
  }
  const a = $('clauseA').value.trim()
  const b = $('clauseB').value.trim()
  if (!a || !b) {
    setTx({ phase: 'ERROR', label: 'Create workspace', message: 'Both clauses are required.' })
    return
  }
  if (a === b) {
    setTx({ phase: 'ERROR', label: 'Create workspace', message: 'Clauses must be distinct.' })
    return
  }
  setBusy(true)
  setTx({ phase: 'SIGNING', label: 'Create workspace', message: 'Waiting for MetaMask signature…' })
  let hash = ''
  try {
    const before = state.config || await refreshConfig()
    if (!before) throw new Error('Could not read contract configuration before sending the transaction.')
    hash = await createWorkspaceTx(state.account, a, b)
    setTx({ phase: 'PENDING', label: 'Create workspace', hash, message: 'Transaction sent. Waiting for FINALIZED…' })
    const receipt = await waitFinalized(hash)
    const outcome = executionOutcome(receipt)
    if (!outcome.ok) throw new Error(`FINALIZED with ${outcome.name}. Contract state was not treated as successful.`)
    const created = await locateCreatedWorkspace(Number(before.workspace_count), state.account, a, b)
    if (created) {
      state.workspace = created
      state.attempt = null
      $('workspaceId').value = String(created.workspace_id)
      renderWorkspace()
      setTx({ phase: 'FINALIZED', label: 'Workspace created', hash, message: `FINALIZED · ${outcome.name} · workspace #${created.workspace_id} loaded from contract state.` })
    } else {
      setTx({ phase: 'FINALIZED', label: 'Workspace created', hash, message: `FINALIZED · ${outcome.name}. State changed, but the exact workspace could not be resolved automatically; inspect by ID.` })
    }
    await refreshConfig()
  } catch (error) {
    setTx({ phase: 'ERROR', label: 'Create workspace failed', hash, message: cleanError(error) })
  } finally {
    setBusy(false)
    renderWorkspace()
  }
}

async function evaluatePair() {
  if (state.busy) return
  if (!state.account) {
    setTx({ phase: 'ERROR', label: 'Evaluate pair', message: 'Connect MetaMask first.' })
    return
  }
  if (!state.workspace) {
    setTx({ phase: 'ERROR', label: 'Evaluate pair', message: 'Load a workspace first.' })
    return
  }
  if (state.workspace.status !== 'PENDING') {
    setTx({ phase: 'ERROR', label: 'Evaluate pair', message: `Workspace #${state.workspace.workspace_id} is already ${state.workspace.status}.` })
    return
  }
  setBusy(true)
  setTx({ phase: 'SIGNING', label: 'Evaluate pair', message: 'Waiting for MetaMask signature…' })
  let hash = ''
  try {
    const beforeAttempts = Number(state.config?.attempt_count || 0)
    hash = await evaluatePairTx(state.account, state.workspace)
    setTx({ phase: 'PENDING', label: 'Evaluate pair', hash, message: 'Semantic consensus is running. Waiting for FINALIZED…' })
    const receipt = await waitFinalized(hash)
    const outcome = executionOutcome(receipt)
    if (!outcome.ok) throw new Error(`FINALIZED with ${outcome.name}. No successful semantic consequence is claimed.`)
    const refreshedConfig = await refreshConfig()
    const updated = await readWorkspace(Number(state.workspace.workspace_id))
    state.workspace = updated
    state.attempt = null
    const afterAttempts = Number(refreshedConfig?.attempt_count || beforeAttempts)
    for (let id = afterAttempts; id > beforeAttempts; id -= 1) {
      try {
        const candidate = await readAttempt(id)
        if (Number(candidate.workspace_id) === Number(updated.workspace_id)) {
          state.attempt = candidate
          break
        }
      } catch {
        // Continue only through real new attempt IDs.
      }
    }
    renderWorkspace()
    setTx({ phase: 'FINALIZED', label: 'Pair finalized', hash, message: `FINALIZED · ${outcome.name} · contract state is ${updated.status}${state.attempt ? ` · ${state.attempt.verdict}` : ''}.` })
  } catch (error) {
    setTx({ phase: 'ERROR', label: 'Evaluate pair failed', hash, message: cleanError(error) })
  } finally {
    setBusy(false)
    renderWorkspace()
  }
}

function loadExample(example) {
  $('clauseA').value = example.a
  $('clauseB').value = example.b
  updateTextCounts()
}

function bind() {
  all('.js-contract-link').forEach((link) => { link.href = CONTRACT_EXPLORER_URL })
  $('contractShort').textContent = shortAddress(CONTRACT_ADDRESS, 12, 10)
  $('footerContract').textContent = shortAddress(CONTRACT_ADDRESS)
  $('copyAddress').addEventListener('click', async () => {
    await navigator.clipboard.writeText(CONTRACT_ADDRESS)
    $('copyState').textContent = 'Copied'
    window.setTimeout(() => { $('copyState').textContent = '' }, 1200)
  })
  $('connectWallet').addEventListener('click', connectWallet)
  $('loadCircular').addEventListener('click', () => loadExample(circularExample))
  $('loadExecutable').addEventListener('click', () => loadExample(executableExample))
  $('clauseA').addEventListener('input', updateTextCounts)
  $('clauseB').addEventListener('input', updateTextCounts)
  $('workspaceId').addEventListener('input', (event) => { event.target.value = event.target.value.replace(/\D/g, '') })
  $('workspaceId').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadWorkspace() })
  $('inspectWorkspace').addEventListener('click', () => loadWorkspace())
  $('createWorkspace').addEventListener('click', createWorkspace)
  $('evaluatePair').addEventListener('click', evaluatePair)
  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', (accounts) => {
      state.account = accounts?.[0] || ''
      updateWallet()
    })
    window.ethereum.on?.('chainChanged', () => refreshConfig())
  }
}

bind()
loadExample(circularExample)
renderWorkspace()
refreshConfig()
