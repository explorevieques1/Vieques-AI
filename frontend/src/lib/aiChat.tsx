import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { sendAiChat, ApiError, type AiChatMessage, type AiPin } from './api'
import { useEntitlement } from './entitlement'

/**
 * The Ask AI conversation, lifted out of the chat panel.
 *
 * Why a provider and not component state: on a phone the chat IS the bottom
 * sheet, so "let me look at the map for a second" means switching the sheet to
 * Explore and back. With the state inside AiChatBody that unmount threw the
 * whole conversation away — you would return to an empty panel having lost the
 * itinerary you were three questions into building. Credits are spent per
 * message; losing the transcript is losing something the user paid for.
 *
 * Mirrors the shape of lib/entitlement.tsx — same provider-plus-hook idiom, same
 * place in the tree.
 */
export type AiChatState = {
  messages: AiChatMessage[]
  input: string
  setInput: (s: string) => void
  loading: boolean
  error: string | null
  /** Allowance spent — renders an upgrade CTA, not a red error. */
  outOfCredits: boolean
  remaining: number
  send: () => Promise<void>
  /**
   * Increments every time a reply carried map pins.
   *
   * A counter, not the pin array: the mobile shell collapses the sheet so the
   * user can see what just landed on the map, and a second pin-bearing reply
   * has to collapse it again. Comparing arrays would miss that when the new
   * pins happen to equal the old ones.
   */
  pinsSeq: number
}

const AiChatContext = createContext<AiChatState | null>(null)

export function AiChatProvider({
  onPins,
  children,
}: {
  onPins: (pins: AiPin[]) => void
  children: React.ReactNode
}) {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outOfCredits, setOutOfCredits] = useState(false)
  const [pinsSeq, setPinsSeq] = useState(0)

  const { credits, refresh } = useEntitlement()
  // Optimistic local count so the header updates the instant a message is
  // spent, rather than waiting for the refresh round trip.
  const [remaining, setRemaining] = useState(credits)
  useEffect(() => {
    setRemaining(credits)
  }, [credits])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || remaining <= 0) return
    setError(null)
    setInput('')
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setLoading(true)
    try {
      const { reply, pins, creditsRemaining } = await sendAiChat(next)
      setMessages([...next, { role: 'assistant', content: reply }])
      if (pins.length) {
        onPins(pins)
        setPinsSeq((n) => n + 1)
      }
      // The server is authoritative on the balance — it just wrote the ledger row.
      setRemaining(creditsRemaining)
      if (creditsRemaining <= 0) setOutOfCredits(true)
      void refresh()
    } catch (e) {
      // A spent allowance is a 402 with code NO_CREDITS, not a breakage. Branch
      // on it so the user gets a way forward instead of raw backend prose.
      if (e instanceof ApiError && e.code === 'NO_CREDITS') {
        setOutOfCredits(true)
        setRemaining(0)
      } else {
        setError((e as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }, [input, loading, remaining, messages, onPins, refresh])

  return (
    <AiChatContext.Provider
      value={{
        messages,
        input,
        setInput,
        loading,
        error,
        outOfCredits,
        remaining,
        send,
        pinsSeq,
      }}
    >
      {children}
    </AiChatContext.Provider>
  )
}

export function useAiChat(): AiChatState {
  const ctx = useContext(AiChatContext)
  if (!ctx) throw new Error('useAiChat must be used inside <AiChatProvider>')
  return ctx
}
