// Deterministic pre-production model for MonsterTime's first economy slice.
//
// This is deliberately not production persistence and it does not pretend to
// predict player behavior. The fixed activity shapes below are stress inputs:
// they let us compare wallet arithmetic against the same sequence of events.

import { pathToFileURL } from 'node:url'

export const MODEL_INPUT = Object.freeze({
  opportunities: 12,
  commissionPay: 24,
  specialFoodCost: 24,
  traitPaySpread: 0,
  offerBankCap: 2,
  startingPurse: 100,
})

export const BEHAVIORS = Object.freeze({
  casual: { acceptChance: 0.35, buyChance: 0.65 },
  typical: { acceptChance: 0.7, buyChance: 0.75 },
  intensive: { acceptChance: 1, buyChance: 1 },
  'sink-avoiding': { acceptChance: 1, buyChance: 0 },
})

export const SCENARIOS = Object.freeze([
  scenario('solo', member('a', 1)),
  scenario('pair-even', member('a', 0.85), member('b', 0.85)),
  scenario('pair-uneven', member('a', 1), member('b', 0.25)),
  scenario('pair-dormant', member('a', 1), member('b', 0.8, { dormantAfter: 3 })),
  scenario(
    'small-even',
    member('a', 0.75),
    member('b', 0.75),
    member('c', 0.75),
    member('d', 0.75),
  ),
  scenario(
    'small-provider',
    member('a', 1),
    member('b', 0.2),
    member('c', 0.15),
    member('d', 0.1),
  ),
  scenario(
    'full-uneven',
    member('a', 1),
    member('b', 0.9),
    member('c', 0.35),
    member('d', 0.3),
    member('e', 0.25),
    member('f', 0.7, { dormantAfter: 3 }),
    member('g', 0.7, { dormantAfter: 2 }),
    member('h', 0.7, { dormantAfter: 1 }),
  ),
  scenario(
    'join-late',
    member('a', 0.8),
    member('b', 0.7),
    member('c', 0.6),
    member('d', 0.5),
    member('e', 0.8, { joinAt: 7 }),
  ),
  scenario('restore-device', member('a', 1), member('b', 0.5), { restoreAt: 7 }),
  scenario('grandfathered', member('a', 0.8), member('b', 0.45), { grandfathered: true }),
])

export const WALLET_CANDIDATES = Object.freeze([
  { id: 'shared', label: 'Shared treasury + provenance' },
  { id: 'personal-equal', label: 'Personal purses, equal member split' },
  { id: 'personal-participants', label: 'Personal purses, participant split' },
])

function member(id, presence, options = {}) {
  return { id, presence, ...options }
}

function scenario(id, ...parts) {
  const options = parts.at(-1)
  if (options && !('id' in options)) return { id, members: parts.slice(0, -1), ...options }
  return { id, members: parts }
}

function stableSeed(text) {
  let seed = 2166136261
  for (const char of text) {
    seed ^= char.codePointAt(0)
    seed = Math.imul(seed, 16777619)
  }
  return seed >>> 0
}

function randomFrom(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function eligible(memberState, step) {
  return (memberState.joinAt ?? 1) <= step
}

function dormant(memberState, step) {
  return memberState.dormantAfter !== undefined && memberState.dormantAfter < step
}

export function buildTimeline(group, behaviorId, inputs = MODEL_INPUT) {
  const behavior = BEHAVIORS[behaviorId]
  if (!behavior) throw new Error(`unknown behavior: ${behaviorId}`)
  const random = randomFrom(stableSeed(`${group.id}:${behaviorId}`))
  const timeline = []

  for (let step = 1; step <= inputs.opportunities; step += 1) {
    const joined = group.members.filter((candidate) => eligible(candidate, step))
    const present = joined.filter(
      (candidate) => !dormant(candidate, step) && random() < candidate.presence,
    )
    const accepted = present.length > 0 && random() < behavior.acceptChance
    let participants = accepted
      ? present.filter((candidate) => random() < Math.max(0.45, candidate.presence))
      : []
    if (accepted && participants.length === 0) participants = [present[0]]
    timeline.push({
      step,
      joined: joined.map(({ id }) => id),
      present: present.map(({ id }) => id),
      participants: participants.map(({ id }) => id),
      accepted,
      wantsPurchase: accepted && random() < behavior.buyChance,
    })
  }

  return timeline
}

function splitWhole(coins, ids) {
  if (ids.length === 0) throw new Error('cannot split coins without recipients')
  const each = Math.floor(coins / ids.length)
  const remainder = coins % ids.length
  return ids.map((id, index) => [id, each + (index < remainder ? 1 : 0)])
}

function credit(map, id, coins) {
  map.set(id, (map.get(id) ?? 0) + coins)
}

function spendFromPresent(balances, present, cost) {
  const available = present
    .map((id) => [id, balances.get(id) ?? 0])
    .filter(([, coins]) => coins > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  const totalAvailable = available.reduce((sum, [, coins]) => sum + coins, 0)
  if (totalAvailable < cost) return { bought: false, contributors: 0 }

  let remaining = cost
  let contributors = 0
  for (const [id, coins] of available) {
    if (remaining === 0) break
    const paid = Math.min(coins, remaining)
    balances.set(id, coins - paid)
    remaining -= paid
    contributors += 1
  }
  return { bought: true, contributors }
}

export function simulate(group, behaviorId, walletId, inputs = MODEL_INPUT) {
  const timeline = buildTimeline(group, behaviorId, inputs)
  const balances = new Map(group.members.map(({ id }) => [id, 0]))
  const provenance = new Map(group.members.map(({ id }) => [id, 0]))
  let sharedBalance = 0
  let faucets = 0
  let sinks = 0
  let purchases = 0
  let accepted = 0
  let firstPurchaseAt = null
  let inactiveSpendBlocks = 0
  let nonparticipantAllocations = 0
  let coordinationActions = 0

  for (const moment of timeline) {
    if (moment.accepted) {
      accepted += 1
      faucets += inputs.commissionPay
      for (const [id, coins] of splitWhole(inputs.commissionPay, moment.participants)) {
        credit(provenance, id, coins)
      }

      if (walletId === 'shared') {
        sharedBalance += inputs.commissionPay
      } else {
        const recipients = walletId === 'personal-equal' ? moment.joined : moment.participants
        for (const [id, coins] of splitWhole(inputs.commissionPay, recipients)) {
          credit(balances, id, coins)
          if (!moment.participants.includes(id)) nonparticipantAllocations += coins
        }
      }
    }

    if (!moment.wantsPurchase) continue
    if (walletId === 'shared') {
      if (sharedBalance < inputs.specialFoodCost) continue
      sharedBalance -= inputs.specialFoodCost
      sinks += inputs.specialFoodCost
      purchases += 1
      coordinationActions += 2 // propose, then bounded no-objection resolution
    } else {
      const total = [...balances.values()].reduce((sum, coins) => sum + coins, 0)
      const available = moment.present.reduce((sum, id) => sum + (balances.get(id) ?? 0), 0)
      if (total >= inputs.specialFoodCost && available < inputs.specialFoodCost) inactiveSpendBlocks += 1
      const result = spendFromPresent(balances, moment.present, inputs.specialFoodCost)
      if (!result.bought) continue
      sinks += inputs.specialFoodCost
      purchases += 1
      coordinationActions += result.contributors + 1
    }
    if (firstPurchaseAt === null) firstPurchaseAt = moment.step
  }

  const ending = walletId === 'shared'
    ? sharedBalance
    : [...balances.values()].reduce((sum, coins) => sum + coins, 0)
  const dormantIds = group.members
    .filter((candidate) => dormant(candidate, inputs.opportunities))
    .map(({ id }) => id)
  const stranded = walletId === 'shared'
    ? 0
    : dormantIds.reduce((sum, id) => sum + (balances.get(id) ?? 0), 0)
  const credited = [...provenance.values()]
  const providerShare = faucets === 0 ? 0 : Math.max(...credited) / faucets
  const reconciliationDifference = ending - (faucets - sinks)

  if (!Number.isInteger(ending) || ending < 0) throw new Error('invalid ending balance')
  if (reconciliationDifference !== 0) throw new Error('ledger reconciliation failed')
  if (faucets !== accepted * inputs.commissionPay) throw new Error('participant-multiplied payout')

  return {
    scenario: group.id,
    behavior: behaviorId,
    wallet: walletId,
    accepted,
    faucets,
    sinks,
    ending,
    purchases,
    firstPurchaseAt,
    inactiveSpendBlocks,
    nonparticipantAllocations,
    stranded,
    providerShare,
    coordinationActions,
    reconciliationDifference,
  }
}

export function openingCreditMatrix(inputs = MODEL_INPUT) {
  const prices = [
    (members) => 75,
    (members) => 55 + 50 * members,
    (members) => 70 + 55 * members,
  ]
  return [1, 2, 4, 8].flatMap((members) => prices.map((priceOfEgg, egg) => {
    const cost = priceOfEgg(members)
    const available = members * inputs.startingPurse
    return {
      members,
      egg,
      cost,
      affordable: cost <= available,
      pooledUnused: cost <= available ? available - cost : null,
    }
  }))
}

export function tuningGrid() {
  return [18, 24, 30].flatMap((pay) => [18, 24, 36].map((cost) => ({
    pay,
    cost,
    commissionsToFirstFood: Math.ceil(cost / pay),
    sinkAvoidingBalanceAfter12: pay * MODEL_INPUT.opportunities,
    intensiveBalanceAfter12: intensiveBalance(pay, cost, MODEL_INPUT.opportunities),
  })))
}

function intensiveBalance(pay, cost, opportunities) {
  let balance = 0
  for (let step = 0; step < opportunities; step += 1) {
    balance += pay
    if (balance >= cost) balance -= cost
  }
  return balance
}

export function replayEconomicEvents(events) {
  const seen = new Set()
  let balance = 0
  let duplicatesIgnored = 0
  for (const event of events) {
    if (seen.has(event.id)) {
      duplicatesIgnored += 1
      continue
    }
    const next = balance + event.coins
    if (!Number.isInteger(event.coins) || next < 0) throw new Error('invalid economic event')
    seen.add(event.id)
    balance = next
  }
  return { balance, committed: seen.size, duplicatesIgnored }
}

function summarizeWallet(wallet, runs) {
  const ownRuns = runs.filter((run) => run.wallet === wallet.id)
  const inactiveSpendBlocks = ownRuns.reduce((sum, run) => sum + run.inactiveSpendBlocks, 0)
  const nonparticipantAllocations = ownRuns.reduce(
    (sum, run) => sum + run.nonparticipantAllocations,
    0,
  )
  const stranded = Math.max(...ownRuns.map((run) => run.stranded))
  const providerShare = Math.max(...ownRuns.map((run) => run.providerShare))
  const reconciliationDifference = Math.max(
    ...ownRuns.map((run) => Math.abs(run.reconciliationDifference)),
  )
  const mechanicallyViable = nonparticipantAllocations === 0 && reconciliationDifference === 0
  return {
    ...wallet,
    mechanicallyViable,
    inactiveSpendBlocks,
    nonparticipantAllocations,
    maxStranded: stranded,
    maxProviderShare: providerShare,
    finding: wallet.id === 'personal-equal'
      ? 'Reject: equal splits allocate earnings to nonparticipants and strand spendable coins behind absent seats.'
      : wallet.id === 'personal-participants'
        ? 'Mechanically viable; earned personal coins can still strand after a contributor leaves, and provider concentration remains a human fairness gate.'
        : 'Mechanically viable; unilateral-spend perception remains a human governance gate.',
  }
}

export function buildReport(inputs = MODEL_INPUT) {
  const runs = []
  for (const group of SCENARIOS) {
    for (const behaviorId of Object.keys(BEHAVIORS)) {
      for (const wallet of WALLET_CANDIDATES) {
        runs.push(simulate(group, behaviorId, wallet.id, inputs))
      }
    }
  }
  const replay = replayEconomicEvents([
    { id: 'commission:bell', coins: inputs.commissionPay },
    { id: 'commission:bell', coins: inputs.commissionPay },
    { id: 'food:smoked-fish', coins: -inputs.specialFoodCost },
    { id: 'food:smoked-fish', coins: -inputs.specialFoodCost },
  ])
  return {
    generatedBy: 'scripts/economy-model.mjs',
    inputs,
    runs,
    wallets: WALLET_CANDIDATES.map((wallet) => summarizeWallet(wallet, runs)),
    openingCredits: openingCreditMatrix(inputs),
    tuning: tuningGrid(),
    replay,
    recommendation: {
      openingCredit: 'zero',
      walletPrototype: 'shared',
      walletChallenger: 'personal-participants',
      commissionPay: inputs.commissionPay,
      specialFoodCost: inputs.specialFoodCost,
      traitPaySpread: inputs.traitPaySpread,
      spendPolicyPrototype: 'bounded objection for the first reversible special food',
    },
    boundary: 'Mechanical viability is not the wallet or fairness decision. Run the human gate.',
  }
}

export function renderMarkdown(report) {
  const typical = report.runs.filter((run) => run.behavior === 'typical')
  const lines = [
    '# MonsterTime economy model results',
    '',
    'Status: deterministic mechanical model complete; human wallet and tone gates remain open',
    `Model: \`${report.generatedBy}\``,
    '',
    'These are fixed stress scenarios, not forecasts of real player behavior.',
    '',
    '## Candidate result',
    '',
    '| Wallet | Mechanical result | Coins allocated to nonparticipants | Inactive-seat spend blocks | Max stranded |',
    '|---|---|---:|---:|---:|',
    ...report.wallets.map((wallet) =>
      `| ${wallet.label} | ${wallet.mechanicallyViable ? 'survives' : 'reject'} | ${wallet.nonparticipantAllocations} | ${wallet.inactiveSpendBlocks} | ${wallet.maxStranded} |`,
    ),
    '',
    ...report.wallets.map((wallet) => `- **${wallet.label}:** ${wallet.finding}`),
    '',
    '## Typical fixed-sequence snapshot',
    '',
    '| Scenario | Wallet | Earned | Spent | End | Purchases | Inactive-seat blocks |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...typical.map((run) =>
      `| ${run.scenario} | ${run.wallet} | ${run.faucets} | ${run.sinks} | ${run.ending} | ${run.purchases} | ${run.inactiveSpendBlocks} |`,
    ),
    '',
    '## Opening-credit result',
    '',
    '| Members | Egg | Price | Pooled unused stake |',
    '|---:|---:|---:|---:|',
    ...report.openingCredits.map((row) =>
      `| ${row.members} | ${row.egg} | ${row.cost} | ${row.pooledUnused ?? 'unaffordable'} |`,
    ),
    '',
    'Pooled unused stake varies from 20 to 725 coins among affordable market outcomes, while grandfathered groups have zero. Use zero opening economy credit for the first slice; the commission is available at zero.',
    '',
    '## First-slice provisional values',
    '',
    `- One group commission pays ${report.recommendation.commissionPay} coins, never multiplied by attendance.`,
    `- Smoked river fish costs ${report.recommendation.specialFoodCost} coins.`,
    `- Trait pay spread is ${report.recommendation.traitPaySpread}; traits change approach and memory, not first-slice income.`,
    '- The first accepted commission can therefore fund one expressive food.',
    '- These values prove the loop. They are not production balance claims.',
    '',
    '## Retry proof',
    '',
    `The fixed duplicate sequence committed ${report.replay.committed} effects, ignored ${report.replay.duplicatesIgnored} retries, and ended at ${report.replay.balance} coins.`,
    '',
    '## Decision boundary',
    '',
    '- Prototype shared treasury plus provenance first.',
    '- Keep participant-attributed personal purses as the human-test challenger.',
    '- Do not prototype equal member splits; the mechanical model rejects them.',
    '- Test bounded objection for the first reversible food, but do not call it fair until groups use it.',
    '- Do not implement production persistence until the wallet and commission-tone playtests select the schema.',
    '',
  ]
  return lines.join('\n')
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const report = buildReport()
  process.stdout.write(process.argv.includes('--json')
    ? `${JSON.stringify(report, null, 2)}\n`
    : renderMarkdown(report))
}
