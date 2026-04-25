'use client'

import { useState, useEffect, useRef, memo } from 'react'
import { EXCHANGES, SESSION_COLORS_HEX } from '@/lib/constants'

interface Position {
  x: number
  y: number
  visible: boolean
}

declare global {
  interface Window {
    globeProject?: (lat: number, lng: number) => Position
  }
}

interface ExchangeLabelsProps {
  hoveredId: string | null
  onHover: (id: string | null) => void
}

export const ExchangeLabels = memo(function ExchangeLabels({ hoveredId, onHover }: ExchangeLabelsProps) {
  const [positions, setPositions] = useState<Record<string, Position>>({})
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const update = () => {
      if (!window.globeProject) { rafRef.current = requestAnimationFrame(update); return }
      const next: Record<string, Position> = {}
      EXCHANGES.forEach(ex => { next[ex.id] = window.globeProject!(ex.lat, ex.lng) })
      setPositions(next)
      rafRef.current = requestAnimationFrame(update)
    }
    rafRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {EXCHANGES.map(ex => {
        const pos = positions[ex.id]
        if (!pos?.visible) return null
        const isHovered = hoveredId === ex.id
        const col = SESSION_COLORS_HEX[ex.region]
        const isLarge = ex.vol >= 18
        const isMed = ex.vol >= 6

        return (
          <div
            key={ex.id}
            onMouseEnter={() => onHover(ex.id)}
            onMouseLeave={() => onHover(null)}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'all',
              cursor: 'pointer',
              zIndex: isHovered ? 100 : Math.floor(ex.vol),
            }}
          >
            {/* Dot */}
            <div style={{
              width: isLarge ? 10 : isMed ? 7 : 5,
              height: isLarge ? 10 : isMed ? 7 : 5,
              borderRadius: '50%',
              background: col,
              boxShadow: `0 0 ${isHovered ? 12 : 6}px ${col}`,
              margin: 'auto',
              transition: 'box-shadow 0.2s',
            }} />

            {/* Name label for large exchanges or hovered */}
            {(isLarge || isHovered) && (
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '-22px',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                background: 'rgba(10,14,26,0.88)',
                border: `1px solid ${col}44`,
                borderRadius: '4px',
                padding: '2px 7px',
                fontSize: '9px',
                fontFamily: 'var(--font-mono, monospace)',
                color: col,
                letterSpacing: '0.06em',
                pointerEvents: 'none',
              }}>
                {ex.name}
              </div>
            )}

            {/* Hover tooltip */}
            {isHovered && (
              <div style={{
                position: 'absolute',
                left: '14px',
                top: '-10px',
                width: '180px',
                background: 'rgba(8,11,20,0.97)',
                border: `1px solid ${col}55`,
                borderRadius: '8px',
                padding: '10px 12px',
                pointerEvents: 'none',
                zIndex: 200,
                boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${col}22`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px', fontWeight: 600, color: col }}>{ex.name}</span>
                  <span style={{ fontSize: '9px', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{ex.year}</span>
                </div>
                <div style={{ fontSize: '9px', color: 'var(--fg-muted)', marginBottom: '8px', fontFamily: 'var(--font-mono, monospace)' }}>
                  {ex.city}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                  {([
                    ['24h Vol', `$${ex.vol.toFixed(1)}B`],
                    ['Share',   `${ex.share}%`],
                    ['Pairs',   ex.pairs.toLocaleString()],
                    ['Region',  ex.region.charAt(0).toUpperCase() + ex.region.slice(1)],
                  ] as [string, string][]).map(([k, v]) => (
                    <span key={k} style={{ display: 'contents' }}>
                      <span style={{ fontSize: '9px', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{k}</span>
                      <span style={{ fontSize: '10px', color: 'var(--fg)', fontFamily: 'var(--font-mono, monospace)', fontWeight: 500 }}>{v}</span>
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: '8px', height: '2px', background: 'rgba(255,255,255,0.07)', borderRadius: '2px' }}>
                  <div style={{ width: `${Math.min(100, ex.share * 3)}%`, height: '100%', background: col, borderRadius: '2px' }} />
                </div>
                <div style={{ fontSize: '8px', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono, monospace)', marginTop: '3px' }}>
                  market share
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
