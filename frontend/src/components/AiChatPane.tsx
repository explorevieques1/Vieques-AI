import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { sendAiChat, type AiChatMessage, type AiPin } from '../lib/api'

type Props = {
  onClose: () => void
  onPins: (pins: AiPin[]) => void
}

function AiChatPane({ onClose, onPins }: Props) {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setError(null)
    setInput('')
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setLoading(true)
    try {
      const { reply, pins } = await sendAiChat(next)
      setMessages([...next, { role: 'assistant', content: reply }])
      if (pins.length) onPins(pins)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className="absolute top-0 right-0 h-full w-full sm:w-96 z-30 bg-slate-900/97 backdrop-blur border-l border-slate-700 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white">
            Ask <span className="text-cyan-400">Vieques AI</span>
          </h2>
          <p className="text-xs text-slate-400">Your local island guide</p>
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
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask about Vieques…"
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
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