import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import {
  sendAiChat, fetchConversations, fetchConversation,
  renameConversation as apiRename, deleteConversation as apiDelete,
  ApiError, type AiChatMessage, type AiPin, type ConversationSummary,
} from './api'
import { useEntitlement, useFeature } from './entitlement'

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
  /** The open conversation, or null for an unsaved one that has no turns yet. */
  conversationId: string | null
  /** This user's saved conversations, newest first. Empty below Vacation. */
  conversations: ConversationSummary[]
  /** True while a saved transcript is loading (openConversation in flight). */
  historyLoading: boolean
  /**
   * True while the conversation list itself is loading — separate from
   * historyLoading so the initial mount fetch and a live openConversation()
   * can't clear or set each other's spinner. See refreshConversations.
   */
  listLoading: boolean
  /** Does this plan include 'ai_history'? Hides the history UI when false. */
  canSaveHistory: boolean
  /** Clear the transcript. Creates nothing until the next send. */
  newChat: () => void
  /** Load a saved transcript and replay its pins onto the map. */
  openConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
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
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Deliberately a separate flag from historyLoading rather than reusing it:
  // historyLoading is owned by openConversation and guarded by openToken so a
  // stale response can't clear a spinner a newer call still owns. Folding the
  // list fetch into that flag would let refreshConversations (fired on mount,
  // and again after every send()) clear a spinner openConversation is
  // mid-flight on, or vice versa — two unrelated requests fighting over one
  // boolean. AiChatHistoryBody reads this one for the empty-state gate;
  // historyLoading remains openConversation's alone.
  const [listLoading, setListLoading] = useState(false)
  const canSaveHistory = useFeature('ai_history')

  // The list is small (title + count, capped at 100 server-side) and is what
  // the history view renders, so it is fetched once on mount rather than on
  // every open. Below Vacation the route 402s, so don't ask — and don't leave
  // listLoading stuck true from some earlier call now that the plan can't
  // save history at all.
  const refreshConversations = useCallback(async () => {
    if (!canSaveHistory) {
      setListLoading(false)
      return
    }
    setListLoading(true)
    try {
      setConversations(await fetchConversations())
    } catch {
      // A failed list leaves the previous one on screen — better than an
      // empty history that looks like data loss.
    } finally {
      setListLoading(false)
    }
  }, [canSaveHistory])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  const newChat = useCallback(() => {
    setMessages([])
    setConversationId(null)
    setError(null)
    setInput('')
    // Deliberately NOT clearing outOfCredits here: it reflects the account's
    // balance, not this conversation's, and a new chat grants no credits.
    // Clearing it would show an enabled composer that send() then silently
    // no-ops on (remaining <= 0), which is worse than the upgrade CTA it
    // would be hiding.
  }, [])

  // Guards against opening conversation A, then B before A's fetch resolves:
  // without this, a slow A landing after fast B overwrites B's transcript,
  // id and pins with stale data. Bumped at the start of every call; a
  // response only gets to touch state if its token is still the latest one
  // outstanding when the await returns.
  const openToken = useRef(0)

  const openConversation = useCallback(async (id: string) => {
    const token = ++openToken.current
    setHistoryLoading(true)
    setError(null)
    try {
      const detail = await fetchConversation(id)
      if (token !== openToken.current) return // a newer openConversation() won the race
      setMessages(detail.messages.map((m) => ({ role: m.role, content: m.content })))
      setConversationId(detail.id)
      // Replay every pin the conversation produced, de-duplicated by id: two
      // answers naming the same restaurant must not stack two markers.
      const seen = new Set<string>()
      const pins: AiPin[] = []
      for (const m of detail.messages) {
        for (const p of m.pins ?? []) {
          if (!seen.has(p.id)) { seen.add(p.id); pins.push(p) }
        }
      }
      if (pins.length) {
        onPins(pins)
        setPinsSeq((n) => n + 1)
      }
    } catch (e) {
      if (token !== openToken.current) return
      setError((e as Error).message)
    } finally {
      // Only the latest request may clear the spinner — a stale response
      // finishing after a newer one is still in flight must not hide it.
      if (token === openToken.current) setHistoryLoading(false)
    }
  }, [onPins])

  const renameConversation = useCallback(async (id: string, title: string) => {
    const updated = await apiRename(id, title)
    // The server bumps updated_at on rename and LIST orders by updated_at
    // DESC, so a plain in-place patch leaves the row in its old slot until
    // something else happens to refetch. Re-sort locally with the row the
    // server just handed back rather than paying for a round trip to learn
    // an ordering we already have all the data for.
    setConversations((cs) =>
      cs
        .map((c) => (c.id === id ? updated : c))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    )
  }, [])

  const deleteConversation = useCallback(async (id: string) => {
    await apiDelete(id)
    setConversations((cs) => cs.filter((c) => c.id !== id))
    // Deleting the conversation you are reading leaves the transcript
    // orphaned — the next send would try to append to a row that no longer
    // exists. Reset to a fresh chat instead.
    setConversationId((cur) => {
      if (cur !== id) return cur
      setMessages([])
      return null
    })
  }, [])

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
      const { reply, pins, creditsRemaining, conversationId: newId } =
        await sendAiChat(next, conversationId)
      setMessages([...next, { role: 'assistant', content: reply }])
      if (pins.length) {
        onPins(pins)
        setPinsSeq((n) => n + 1)
      }
      // The server creates the conversation on the first turn and returns
      // its id; null means this tier doesn't save history.
      if (newId && newId !== conversationId) {
        setConversationId(newId)
        void refreshConversations()
      } else if (newId) {
        // An append — the list's ordering and count changed.
        void refreshConversations()
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
  }, [input, loading, remaining, messages, onPins, refresh, conversationId, refreshConversations])

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
        conversationId,
        conversations,
        historyLoading,
        listLoading,
        canSaveHistory,
        newChat,
        openConversation,
        renameConversation,
        deleteConversation,
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
