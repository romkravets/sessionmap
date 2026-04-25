'use client'

import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { useAppContext } from '@/contexts/AppContext'
import type { PriceSnapshot } from '@sessionmap/types'

const PriceEntrySchema = z.object({ price: z.number(), change24h: z.number() })
const PricesMessageSchema = z.object({
  type: z.literal('prices'),
  data: z.record(PriceEntrySchema),
})
const MetaMessageSchema = z.object({
  type: z.literal('meta'),
  data: z.object({
    fearGreed: z.number(),
    btcDominance: z.number(),
    totalMarketCap: z.number(),
  }),
})
const WhaleMessageSchema = z.object({
  type: z.literal('whale'),
  data: z.object({
    id: z.string(),
    type: z.enum(['transfer', 'deposit', 'withdraw', 'dex']),
    amount: z.number(),
    from: z.string(),
    to: z.string(),
    ts: z.number(),
  }),
})
const WsMessageSchema = z.union([PricesMessageSchema, MetaMessageSchema, WhaleMessageSchema])

export function useWebSocket() {
  const { dispatch } = useAppContext()
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(1000)
  const mountedRef = useRef(true)
  const pendingPricesRef = useRef<PriceSnapshot | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000'

    function flushPrices() {
      rafRef.current = null
      if (pendingPricesRef.current) {
        dispatch({ type: 'PRICES_UPDATE', payload: pendingPricesRef.current })
        pendingPricesRef.current = null
      }
    }

    function schedulePriceFlush(snapshot: PriceSnapshot) {
      pendingPricesRef.current = snapshot
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushPrices)
      }
    }

    function connect() {
      if (!mountedRef.current) return
      dispatch({ type: 'SET_WS_STATUS', payload: 'connecting' })

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        backoffRef.current = 1000
        dispatch({ type: 'SET_WS_STATUS', payload: 'connected' })
      }

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data as string)
          const parsed = WsMessageSchema.safeParse(raw)
          if (!parsed.success) return

          const msg = parsed.data
          if (msg.type === 'prices') {
            schedulePriceFlush(msg.data)
          } else if (msg.type === 'meta') {
            dispatch({ type: 'META_UPDATE', payload: msg.data })
          } else if (msg.type === 'whale') {
            dispatch({ type: 'WHALE_EVENT', payload: msg.data })
          }
        } catch {
          // ignore malformed
        }
      }

      ws.onerror = () => { /* onclose handles reconnect */ }

      ws.onclose = () => {
        if (!mountedRef.current) return
        dispatch({ type: 'SET_WS_STATUS', payload: 'disconnected' })
        const delay = backoffRef.current
        backoffRef.current = Math.min(backoffRef.current * 2, 30_000)
        setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      wsRef.current?.close()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [dispatch])
}
