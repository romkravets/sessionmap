'use client'

import { memo } from 'react'
import type { GlobeMode } from '@sessionmap/types'

const MODE_META: Record<GlobeMode, { label: string; icon: string; tip: string }> = {
  auto:    { label: 'Auto',       icon: '↺', tip: 'Slow auto-rotation' },
  free:    { label: 'Free',       icon: '✦', tip: 'Drag to explore' },
  follow:  { label: 'Follow Sun', icon: '☀', tip: 'Camera tracks dayside' },
  heatmap: { label: 'Heatmap',    icon: '🔥', tip: 'Volume heatmap overlay' },
}

interface GlobeModeBarProps {
  mode: GlobeMode
  onChange: (mode: GlobeMode) => void
}

export const GlobeModeBar = memo(function GlobeModeBar({ mode, onChange }: GlobeModeBarProps) {
  return (
    <div style={{ display: 'flex', gap: '4px', pointerEvents: 'all' }}>
      {(Object.entries(MODE_META) as [GlobeMode, (typeof MODE_META)[GlobeMode]][]).map(([key, meta]) => {
        const active = mode === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={meta.tip}
            style={{
              background: active ? 'rgba(125,211,252,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '6px',
              padding: '5px 11px',
              cursor: 'pointer',
              color: active ? 'var(--accent)' : 'var(--fg-muted)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1 }}>{meta.icon}</span>
            {meta.label}
          </button>
        )
      })}
    </div>
  )
})
