import { getFreeTierBudgetPolicy } from '../src/services/free-tier-budget.ts'

const policy = getFreeTierBudgetPolicy()
if (!policy.ok) throw new Error(`Free-tier budget policy failed: ${policy.blockers.join(', ')}`)
console.log(JSON.stringify({ ok: true, ...policy }, null, 2))
