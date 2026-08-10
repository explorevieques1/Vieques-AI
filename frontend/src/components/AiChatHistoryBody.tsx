import { useMemo, useState } from 'react'
import { Check, MessageSquarePlus, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'

import { useAiChat } from '../lib/aiChat'
import type { ConversationSummary } from '../lib/api'

type Props = {
  /** Called after opening a conversation or starting a new one, so the
   *  parent can pop back to the transcript. */
  onOpen: () => void
  /** Mobile: clear the bottom nav with the scroller's bottom padding. */
  navPad?: boolean
}

/**
 * The saved-conversations list.
 *
 * Split out of AiChatBody rather than inlined: that file is the transcript
 * plus the composer, and adding the list, the date grouping and a per-row
 * menu would push it past 280 lines of two unrelated concerns.
 *
 * Rendered on BOTH platforms — AiChatBody is the shared tree that desktop's
 * AiChatPane and the mobile map sheet both render, so this needs no separate
 * phone implementation.
 */
export default function AiChatHistoryBody({ onOpen, navPad = false }: Props) {
  const {
    conversations, listLoading, conversationId,
    newChat, openConversation, renameConversation, deleteConversation,
  } = useAiChat()

  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  // Keyed by conversation id so a failure on one row doesn't stick around
  // once you move on to a different one.
  const [renameErrorFor, setRenameErrorFor] = useState<string | null>(null)

  // Grouped by recency the way every chat UI does it, so a long list stays
  // scannable. Compared on local calendar days, not elapsed hours: a message
  // from 11pm yesterday is "Yesterday", not "Today", 60 minutes later.
  const groups = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000)

    const out: { label: string; items: ConversationSummary[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Earlier', items: [] },
    ]
    for (const c of conversations) {
      const t = new Date(c.updatedAt).getTime()
      if (t >= startOfToday.getTime()) out[0].items.push(c)
      else if (t >= startOfYesterday.getTime()) out[1].items.push(c)
      else out[2].items.push(c)
    }
    return out.filter((g) => g.items.length > 0)
  }, [conversations])

  function startRename(c: ConversationSummary) {
    setEditingId(c.id)
    setDraft(c.title)
    setMenuFor(null)
    setRenameErrorFor(null)
  }

  async function commitRename(id: string) {
    const title = draft.trim()
    setEditingId(null)
    if (!title) return
    try {
      await renameConversation(id, title)
      setRenameErrorFor(null)
    } catch {
      // The list still shows the old title, which is the truth on the
      // server — but the user asked for a change and nothing visibly
      // happened, so say so rather than failing silently. The realistic
      // causes here are a dropped connection or the row having been deleted
      // in another tab (404); either way "not saved" is the honest message,
      // not a redundant echo of a specific status code.
      setRenameErrorFor(id)
    }
  }

  return (
    <>
      <div className="shrink-0 border-b border-white/8 p-4">
        <button
          onClick={() => { newChat(); onOpen() }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/35 bg-primary/10 px-3.5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/15"
        >
          <MessageSquarePlus size={15} />
          New chat
        </button>
      </div>

      <div
        className={`scroll-contain scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3 ${
          navPad ? 'pb-[calc(1rem+3.5rem+var(--sab))]' : 'pb-4'
        }`}
      >
        {conversations.length === 0 && !listLoading && (
          <div className="px-2 py-10 text-center">
            <p className="text-sm text-foreground">No saved chats yet</p>
            <p className="mx-auto mt-1.5 max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
              Ask a question and the conversation is saved here automatically.
            </p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.label} className="mb-4 last:mb-0">
            <h3 className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {g.label}
            </h3>
            <div className="flex flex-col gap-1.5">
              {g.items.map((c) => (
                <div key={c.id} className="relative">
                  {editingId === c.id ? (
                    <div className="flex items-center gap-1.5 rounded-2xl border border-primary/40 bg-white/4 py-1.5 pl-3 pr-1.5">
                      <input
                        autoFocus
                        value={draft}
                        maxLength={80}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename(c.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                      />
                      <button
                        onClick={() => void commitRename(c.id)}
                        aria-label="Save name"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-primary hover:bg-white/8"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel rename"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/8"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { void openConversation(c.id); onOpen() }}
                        className={`w-full rounded-2xl border px-3.5 py-2.5 pr-11 text-left transition-colors ${
                          c.id === conversationId
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-white/8 bg-white/3 hover:bg-white/6'
                        }`}
                      >
                        <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {c.messageCount} message{c.messageCount === 1 ? '' : 's'}
                          {' · '}
                          {new Date(c.updatedAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric',
                          })}
                        </p>
                      </button>
                      <button
                        onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                        aria-label={`Options for ${c.title}`}
                        aria-expanded={menuFor === c.id}
                        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </>
                  )}

                  {renameErrorFor === c.id && (
                    <p className="mt-1 rounded-xl border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-foreground">
                      Couldn't save that name. Try again.
                    </p>
                  )}

                  {menuFor === c.id && (
                    <div className="mt-1 rounded-xl border border-white/10 bg-background/95 p-1.5 shadow-xl backdrop-blur">
                      <button
                        onClick={() => startRename(c)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground hover:bg-white/8"
                      >
                        <Pencil size={13} />
                        Rename
                      </button>
                      {confirmId === c.id ? (
                        <button
                          onClick={() => {
                            void deleteConversation(c.id)
                            setConfirmId(null)
                            setMenuFor(null)
                          }}
                          className="mt-1 flex w-full items-center gap-2 rounded-lg bg-red-500/15 px-2.5 py-2 text-xs font-semibold text-red-300"
                        >
                          <Trash2 size={13} />
                          Tap again to delete
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmId(c.id)}
                          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
