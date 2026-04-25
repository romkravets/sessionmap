'use client'

import { memo } from 'react'
import type { SessionInfo, PriceSnapshot, GlobeMode, WhaleEvent } from '@sessionmap/types'
import { SESSION_COLORS_CSS, SESSION_LABELS } from '@/lib/constants'
import { formatCountdown } from '@/lib/session-logic'
import { GlobeModeBar } from './GlobeModeBar'
import { WhaleTicker } from './WhaleTicker'

interface CleanUIProps {
  session: SessionInfo
  prices: PriceSnapshot
  onToggleTerminal: () => void
  globeMode: GlobeMode
  onGlobeModeChange: (mode: GlobeMode) => void
  sunInfo: { lat: number; lng: number } | null
  whaleEvents: WhaleEvent[]
  wsStatus: 'connecting' | 'connected' | 'disconnected'
}

export const CleanUI = memo(function CleanUI({
  session,
  prices,
  onToggleTerminal,
  globeMode,
  onGlobeModeChange,
  sunInfo,
  whaleEvents,
  wsStatus,
}: CleanUIProps) {
  const { active, nextEvent, volatility } = session

  const topSymbols = ['BTC', 'ETH', 'SOL', 'XRP'] as const

  return (
    <div className="clean-ui-wrap" style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      padding: '20px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>

      {/* ── Top bar ────────────────────────────────────── */}
      <div className="clean-ui-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontFamily: 'var(--font-display, serif)', fontSize: '18px', letterSpacing: '0.02em', color: 'var(--fg)', opacity: 0.9 }}>
            SessionMap
          </span>
          <span style={{ fontSize: '10px', color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500 }}>
            beta
          </span>
          {wsStatus === 'disconnected' && (
            <span style={{ fontSize: '9px', color: 'var(--danger)', fontFamily: 'var(--font-mono, monospace)', border: '1px solid var(--danger)', borderRadius: '3px', padding: '1px 6px' }}>
              STALE
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <GlobeModeBar mode={globeMode} onChange={onGlobeModeChange} />
          <button
            onClick={onToggleTerminal}
            style={{
              pointerEvents: 'all', background: 'none',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
              padding: '5px 12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '7px',
              color: 'var(--fg-muted)', fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em',
              transition: 'all 0.3s ease',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--fg-dim)', display: 'inline-block' }} />
            Terminal
          </button>
        </div>
      </div>

      {/* ── Follow-sun strip ──────────────────────────── */}
      {globeMode === 'follow' && sunInfo && (
        <div style={{
          alignSelf: 'center',
          background: 'rgba(255,200,50,0.07)',
          border: '1px solid rgba(255,200,50,0.15)',
          borderRadius: '8px',
          padding: '6px 16px',
          display: 'flex', gap: '18px', alignItems: 'center',
        }}>
          <span style={{ fontSize: '12px', color: '#FFD060', fontFamily: 'var(--font-mono, monospace)' }}>
            ☀ {sunInfo.lat > 0 ? 'N' : 'S'}{Math.abs(sunInfo.lat).toFixed(1)}°&nbsp;&nbsp;{sunInfo.lng > 0 ? 'E' : 'W'}{Math.abs(sunInfo.lng).toFixed(1)}°
          </span>
          <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>Solar noon meridian</span>
        </div>
      )}

      {/* ── Whale ticker ──────────────────────────────── */}
      <div className="clean-ui-whale-ticker">
        <WhaleTicker events={whaleEvents} />
      </div>

      {/* ── Bottom row ──────────────────────────────────  */}
      <div className="clean-ui-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>

        {/* Session status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '300px' }}>
          {active.length === 0 ? (
            <div style={{ fontSize: '22px', fontWeight: 300, color: 'var(--fg-muted)' }}>Markets quiet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {active.map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: SESSION_COLORS_CSS[s],
                    boxShadow: `0 0 8px ${SESSION_COLORS_CSS[s]}`,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: active.length > 1 ? '16px' : '22px',
                    fontWeight: 300, color: 'var(--fg)', letterSpacing: '-0.01em',
                  }}>
                    {SESSION_LABELS[s]} active
                  </span>
                  {active.length > 1 && (
                    <span style={{
                      fontSize: '10px', background: 'var(--overlap)', color: '#000',
                      padding: '1px 6px', borderRadius: '3px',
                      fontFamily: 'var(--font-mono, monospace)', fontWeight: 600,
                    }}>
                      OVERLAP
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {nextEvent && (
            <div style={{
              fontSize: '12px', color: 'var(--fg-muted)',
              fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.01em', marginTop: '2px',
            }}>
              {SESSION_LABELS[nextEvent.session]} {nextEvent.type === 'open' ? 'opens' : 'closes'} in{' '}
              <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{formatCountdown(nextEvent.hours)}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>
              Volatility
            </span>
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono, monospace)',
              color: volatility === 'high' ? 'var(--danger)' : volatility === 'medium' ? 'var(--accent-warm)' : 'var(--fg-muted)',
              fontWeight: 500,
            }}>
              {volatility.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Price ticker */}
        <div className="clean-ui-prices" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          {topSymbols.map(sym => {
            const entry = prices[sym]
            if (!entry) return null
            const chg = entry.change24h
            const isPos = chg >= 0
            return (
              <div key={sym} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', fontWeight: 500 }}>
                  {sym}
                </span>
                <span style={{ fontSize: '14px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--fg)', fontWeight: 500, letterSpacing: '-0.02em' }}>
                  {sym === 'XRP'
                    ? `$${entry.price.toFixed(4)}`
                    : entry.price >= 1
                      ? `$${entry.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                      : `$${entry.price.toFixed(4)}`}
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', color: isPos ? 'var(--session-europe)' : 'var(--danger)', fontWeight: 500 }}>
                  {isPos ? '+' : ''}{chg.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})
