import type { AppState, PriceSnapshot, MarketMeta, WhaleEvent, GlobeMode, TweakValues } from '@sessionmap/types'
import { TWEAK_DEFAULTS } from '@/lib/constants'

export type Action =
  | { type: 'PRICES_UPDATE'; payload: PriceSnapshot }
  | { type: 'META_UPDATE'; payload: MarketMeta }
  | { type: 'WHALE_EVENT'; payload: WhaleEvent }
  | { type: 'SET_GLOBE_MODE'; payload: GlobeMode }
  | { type: 'TOGGLE_TERMINAL' }
  | { type: 'SET_TWEAK'; payload: Partial<TweakValues> }
  | { type: 'SET_WS_STATUS'; payload: AppState['wsStatus'] }

export const initialState: AppState = {
  prices: {
    BTC: { price: 67234, change24h: 0.42 },
    ETH: { price: 3412,  change24h: -0.18 },
    SOL: { price: 156,   change24h: 1.23 },
    BNB: { price: 612,   change24h: 0.05 },
    XRP: { price: 0.524, change24h: -0.33 },
  },
  marketMeta: null,
  whaleEvents: [],
  globeMode: 'auto',
  terminalMode: false,
  tweaks: TWEAK_DEFAULTS,
  wsStatus: 'connecting',
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'PRICES_UPDATE':
      return { ...state, prices: action.payload }

    case 'META_UPDATE':
      return { ...state, marketMeta: action.payload }

    case 'WHALE_EVENT':
      return {
        ...state,
        // Keep latest 30 whale events
        whaleEvents: [action.payload, ...state.whaleEvents].slice(0, 30),
      }

    case 'SET_GLOBE_MODE':
      return { ...state, globeMode: action.payload }

    case 'TOGGLE_TERMINAL':
      return { ...state, terminalMode: !state.terminalMode }

    case 'SET_TWEAK':
      return { ...state, tweaks: { ...state.tweaks, ...action.payload } }

    case 'SET_WS_STATUS':
      return { ...state, wsStatus: action.payload }

    default:
      return state
  }
}
