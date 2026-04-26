import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Cache for 5 minutes at the CDN layer
export const revalidate = 300

interface CgExchange {
  id: string
  trade_volume_24h_btc: number
}

export async function GET() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/exchanges?per_page=50&page=1',
      {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: 'application/json',
        },
      },
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: `CoinGecko responded with ${res.status}` },
        { status: 502 },
      )
    }

    const data = (await res.json()) as CgExchange[]

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
