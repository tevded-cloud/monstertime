import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MODEL_INPUT,
  buildReport,
  openingCreditMatrix,
  replayEconomicEvents,
  renderMarkdown,
  simulate,
  SCENARIOS,
  tuningGrid,
} from '../../scripts/economy-model.mjs'

describe('the deterministic economy model', () => {
  it('replays exactly and conserves every simulated coin', () => {
    expect(buildReport()).toEqual(buildReport())
    for (const run of buildReport().runs) {
      expect(run.ending).toBe(run.faucets - run.sinks)
      expect(run.faucets).toBe(run.accepted * MODEL_INPUT.commissionPay)
      expect(run.ending).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(run.ending)).toBe(true)
    }
  })

  it('does not let attendance multiply a group commission', () => {
    const full = SCENARIOS.find(({ id }) => id === 'full-uneven')
    const solo = SCENARIOS.find(({ id }) => id === 'solo')
    const fullRun = simulate(full, 'intensive', 'shared')
    const soloRun = simulate(solo, 'intensive', 'shared')
    expect(fullRun.faucets).toBe(fullRun.accepted * MODEL_INPUT.commissionPay)
    expect(soloRun.faucets).toBe(soloRun.accepted * MODEL_INPUT.commissionPay)
    expect(fullRun.faucets).toBe(soloRun.faucets)
  })

  it('rejects equal member splits on dormant-money mechanics', () => {
    const report = buildReport()
    const shared = report.wallets.find(({ id }) => id === 'shared')
    const equal = report.wallets.find(({ id }) => id === 'personal-equal')
    const participants = report.wallets.find(({ id }) => id === 'personal-participants')
    expect(shared.mechanicallyViable).toBe(true)
    expect(participants.mechanicallyViable).toBe(true)
    expect(equal.mechanicallyViable).toBe(false)
    expect(equal.nonparticipantAllocations).toBeGreaterThan(0)
    expect(equal.inactiveSpendBlocks).toBeGreaterThan(0)
    expect(equal.maxStranded).toBeGreaterThan(0)
  })

  it('keeps late joins, restores, and grandfathered groups from minting', () => {
    const report = buildReport()
    for (const id of ['join-late', 'restore-device', 'grandfathered']) {
      for (const run of report.runs.filter(({ scenario }) => scenario === id)) {
        expect(run.reconciliationDifference).toBe(0)
        expect(run.ending).toBe(run.faucets - run.sinks)
      }
    }
  })

  it('shows why pooled market leftovers are not a neutral opening grant', () => {
    const affordable = openingCreditMatrix().filter(({ pooledUnused }) => pooledUnused !== null)
    const values = affordable.map(({ pooledUnused }) => pooledUnused)
    expect(Math.min(...values)).toBe(20)
    expect(Math.max(...values)).toBe(725)
    expect(openingCreditMatrix().find(({ members, egg }) => members === 1 && egg === 1).affordable).toBe(false)
  })

  it('does not pretend one sink can absorb more than one purchase per opportunity', () => {
    const grid = tuningGrid()
    expect(grid.find(({ pay, cost }) => pay === 30 && cost === 18).intensiveBalanceAfter12).toBe(144)
    expect(grid.find(({ pay, cost }) => pay === 18 && cost === 36).intensiveBalanceAfter12).toBe(0)
  })

  it('ignores retried economic effects by stable request id', () => {
    const result = replayEconomicEvents([
      { id: 'earn', coins: 24 },
      { id: 'earn', coins: 24 },
      { id: 'spend', coins: -24 },
      { id: 'spend', coins: -24 },
    ])
    expect(result).toEqual({ balance: 0, committed: 2, duplicatesIgnored: 2 })
  })

  it('renders the result without claiming to decide the human gate', () => {
    const result = renderMarkdown(buildReport())
    expect(result).toContain('human wallet and tone gates remain open')
    expect(result).toContain('Do not implement production persistence')
    expect(result).toContain('not forecasts of real player behavior')
  })

  it('keeps the checked-in result identical to the executable model', () => {
    const saved = readFileSync(new URL('../../docs/ECONOMY_MODEL_RESULTS.md', import.meta.url), 'utf8')
    expect(saved.replaceAll('\r\n', '\n')).toBe(renderMarkdown(buildReport()))
  })
})
