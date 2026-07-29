import { useEffect, useRef } from 'react'
import { Send, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { LANDING_URL } from '../lib/api'
import { useAiChat } from '../lib/aiChat'
import { useEntitlement } from '../lib/entitlement'

type Props = {
  /** Desktop only. On mobile the bottom nav is how you leave, so there is no ×. */
  onClose?: () => void
  /** Mobile: clear the bottom nav with the composer's bottom padding. */
  navPad?: boolean
}

/**
 * The chat itself — header, transcript, composer — with no positioning of its
 * own.
 *
 * Split out of AiChatPane so the same tree can be a floating aside on desktop
 * and the content of the map sheet on a phone. The conversation lives in
 * lib/aiChat.tsx, so switching the sheet to Explore and back does not lose it.
 *
 * On mobile this being *inside* the sheet is not a layout preference, it is the
 * fix for a real bug: the sheet is a modal Radix dialog whatever vaul is told
 * about `modal` (see the note in MapTopBar), so it puts `pointer-events: none`
 * on the body and bounces outside focus back inside. The old floating panel's
 * input sat outside the drawer with no focus guard and simply could not be
 * typed into whenever a category sheet was open.
 */
export default function AiChatBody({ onClose, navPad = false }: Props) {
  const { messages, input, setInput, loading, error, outOfCredits, remaining, send } = useAiChat()
  const { tier } = useEntitlement()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, loading])

  const prompts = ['Where do I rent a car?', 'Find me a quiet beach', 'Where can I get seafood?']

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 p-4">
        <div>
          <h2 className="font-display text-xl leading-none tracking-tight">
            Ask <span className="italic text-primary">Vieques</span>
          </h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {remaining > 0
              ? `${remaining} message${remaining === 1 ? '' : 's'} left`
              : 'No messages left'}
            {tier === 'free' && ' · free trial'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-white/8 hover:text-foreground"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="scroll-contain no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask me anything about Vieques. For example:
            </p>
            <div className="flex flex-col gap-1.5">
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="rounded-2xl border border-white/8 bg-white/3 px-3.5 py-2.5 text-left text-sm text-foreground/85 hover:bg-white/6 hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div
              key={i}
              className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
            >
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className="mr-auto max-w-[90%] space-y-2 rounded-2xl rounded-bl-md border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-foreground
                         [&_a]:text-primary [&_a]:underline
                         [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-4
                         [&_p]:leading-relaxed
                         [&_strong]:font-semibold [&_strong]:text-foreground
                         [&_table]:hidden
                         [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4"
            >
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          ),
        )}

        {loading && (
          <div className="mr-auto rounded-2xl rounded-bl-md border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-muted-foreground">
            Thinking…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-foreground">
            {error}
          </div>
        )}

        {outOfCredits && (
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/12 to-accent-sky/5 p-4 text-center">
            <p className="text-sm font-semibold text-foreground">
              {tier === 'free' ? "That's your free trial" : 'Out of messages'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {tier === 'free'
                ? 'Vacation includes 25 Ask AI messages, all snorkeling zones, and the Bio Bay timing guide.'
                : 'Top up with a credit pack, or move up a plan for a bigger allowance.'}
            </p>
            <a
              href={`${LANDING_URL}/pricing`}
              className="mt-3 inline-block rounded-xl bg-gradient-to-br from-primary to-accent-sky px-4 py-2 text-xs font-bold text-primary-foreground"
            >
              See plans
            </a>
          </div>
        )}
      </div>

      <div
        className={`shrink-0 border-t border-white/8 p-3 ${
          navPad ? 'pb-[calc(0.75rem+3.5rem+var(--sab))]' : ''
        }`}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/4 py-1.5 pl-3.5 pr-1.5 focus-within:border-primary/40">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder={remaining > 0 ? 'Ask about Vieques…' : 'Upgrade to keep asking'}
            disabled={remaining <= 0}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => void send()}
            disabled={loading || !input.trim() || remaining <= 0}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent-sky text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </>
  )
}
