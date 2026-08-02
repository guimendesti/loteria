'use client'

import { useEffect, useState } from 'react'

export interface Countdown {
  days: number
  hours: number
  minutes: number
  totalMs: number
  isPast: boolean
}

function diffFrom(target: Date, nowMs: number): Countdown {
  const totalMs = target.getTime() - nowMs
  const isPast = totalMs <= 0
  const abs = Math.max(0, totalMs)
  const days = Math.floor(abs / 86_400_000)
  const hours = Math.floor((abs % 86_400_000) / 3_600_000)
  const minutes = Math.floor((abs % 3_600_000) / 60_000)
  return { days, hours, minutes, totalMs, isPast }
}

/**
 * Contagem regressiva simples client-side (docs/08 CL-01). Atualiza a cada
 * minuto — não exibimos segundos, então não há necessidade de tick por
 * segundo (evita re-render excessivo no dashboard).
 */
export function useCountdown(target: Date | null): Countdown | null {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!target) return
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [target])

  if (!target) return null
  return diffFrom(target, nowMs)
}
