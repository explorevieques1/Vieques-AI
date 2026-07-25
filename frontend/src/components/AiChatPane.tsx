import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { sendAiChat, ApiError, LANDING_URL, type AiChatMessage, type AiPin } from '../lib/api'
import { useEntitlement } from '../lib/entitlement'

type Props = {
  onClose: () => void
  onPins: (pins: AiPin[]) => void
}

function AiChatPane({ onClose, onPins }: Props) {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when the allowance runs out — renders an upgrade CTA instead of a
  // red error string, because this is a sales moment, not a failure.
  const [outOfCredits, setOutOfCredits] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { credits, tier, refresh } = useEntitlement()
  // Optimistic local count so the header updates the instant a message is
  // spent, rather than waiting for the refresh round trip.
  const [remaining, setRemaining] = useState(credits)
  useEffect(() => { setRemaining(credits) }, [credits])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, loading])

  const send = async () => {
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
      if (pins.length) onPins(pins)
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
  }

  return (
    <aside className="absolute top-0 right-0 h-full w-full sm:w-96 z-30 bg-slate-900/97 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col pad-safe-bottom">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white">
            Ask <span className="text-cyan-400">Explore Vieques</span>
          </h2>
          <p className="text-xs text-slate-400">
            {remaining > 0
              ? `${remaining} message${remaining === 1 ? '' : 's'} left`
              : 'No messages left'}
            {tier === 'free' && ' · free trial'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-2 -mr-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-slate-400 space-y-2">
            <p>Ask me anything about Vieques. For example:</p>
            <ul className="space-y-1 text-slate-500">
              <li>“Where do I rent a car?”</li>
              <li>“Find me a quiet beach”</li>
              <li>“Where can I get seafood?”</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              className="max-w-[85%] ml-auto rounded-lg px-3 py-2 text-sm bg-cyan-500 text-slate-900"
            >
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className="max-w-[90%] mr-auto rounded-lg px-3 py-2 text-sm bg-slate-800 text-slate-100 space-y-2
                         [&_p]:leading-relaxed
                         [&_strong]:text-white [&_strong]:font-semibold
                         [&_ul]:space-y-1 [&_ul]:list-disc [&_ul]:pl-4
                         [&_ol]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4
                         [&_a]:text-cyan-400 [&_a]:underline
                         [&_table]:hidden"
            >
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          ),
        )}
        {loading && (
          <div className="mr-auto bg-slate-800 text-slate-400 rounded-lg px-3 py-2 text-sm">
            Thinking…
          </div>
        )}
        {error && <div className="text-xs text-red-300">{error}</div>}

        {outOfCredits && (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-center">
            <p className="text-sm font-semibold text-slate-100">
              {tier === 'free' ? "That's your free trial" : 'Out of messages'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {tier === 'free'
                ? 'Vacation includes 25 Ask AI messages, all snorkeling zones, and the Bio Bay timing guide.'
                : 'Top up with a credit pack, or move up a plan for a bigger allowance.'}
            </p>
            <a
              href={`${LANDING_URL}/pricing`}
              className="mt-3 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-cyan-400"
            >
              See plans
            </a>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={remaining > 0 ? 'Ask about Vieques…' : 'Upgrade to keep asking'}
            disabled={remaining <= 0}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim() || remaining <= 0}
            className="px-4 py-2 text-sm rounded-lg bg-cyan-500 text-slate-900 font-medium hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  )
}

export default AiChatPane