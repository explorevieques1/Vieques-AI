/**
 * Saved Ask AI conversations — the 'ai_history' feature (Vacation and up).
 *
 * Ownership is proven by `user_id = $userId` in the WHERE clause of every
 * statement, exactly as itineraries.js does. RLS also covers these tables,
 * but these routes connect as the table owner and bypass it — the predicate
 * in the SQL is the actual enforcement.
 */
import { requireAuth, requireTier, rateLimit } from './middleware.js'
import { tierHas } from './payments.js'
import { fail } from './httpError.js'

const MAX_TITLE = 80

function toConversation(row) {
  return {
    id: row.id,
    title: row.title,
    messageCount: Number(row.message_count ?? 0),
    updatedAt: row.updated_at,
  }
}

function toMessage(row) {
  return {
    role: row.role,
    content: row.content,
    pins: Array.isArray(row.pins) ? row.pins : [],
  }
}

/**
 * A conversation title from the user's first message.
 *
 * A truncation, not a second model call: no hidden inference cost, and in
 * this domain the question the user actually asked ("Where can I get
 * seafood?") is a better list entry than a summary of it. Collapses
 * whitespace so a pasted multi-line question doesn't break the row layout.
 */
export function titleFrom(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return 'New conversation'
  // Array.from() splits on code points, not UTF-16 code units, so a 4-byte
  // emoji (a surrogate pair in JS strings) is never cut in half. Slicing the
  // raw string with String#slice() operates on code units and can leave a
  // lone high surrogate right before the ellipsis — it still satisfies
  // `.length <= 80` in JS, but is invalid UTF-16 once serialized and can
  // render as U+FFFD or break stricter JSON parsers. The DB CHECK
  // (char_length(btrim(title)) BETWEEN 1 AND 80) also counts by character,
  // not code unit, so code-point counting is the correct budget here too.
  const chars = Array.from(flat)
  if (chars.length <= MAX_TITLE) return chars.join('')
  return `${chars.slice(0, MAX_TITLE - 1).join('')}…`
}

/**
 * Write one completed turn (the question and its answer) to history.
 *
 * Called from /api/ai/chat AFTER the model has answered and the credit has
 * already been spent. Three rules follow from that ordering:
 *
 *   1. NEVER THROW. The caller must still return the reply the user paid
 *      for. Every failure is swallowed and logged; the worst outcome is an
 *      unsaved transcript, which beats a lost answer.
 *   2. A conversationId that is not this user's is treated as absent — a
 *      new conversation is started rather than erroring, for the same
 *      reason.
 *   3. Free tier saves nothing. Persistence is gated on 'ai_history', while
 *      the chat itself is gated only on credits, so the free tier keeps its
 *      3 lifetime messages and simply gets no history.
 *
 * @returns {Promise<string|null>} the conversation id, or null if unsaved.
 */
export async function persistTurn(pool, { userId, tier, conversationId, userText, replyText, pins }) {
  if (!tierHas(tier, 'ai_history')) return null

  // A single client for the whole turn — including the append path, where a
  // transaction is not strictly required (there is no second statement whose
  // failure could orphan anything) — one client keeps the create and append
  // branches structurally identical instead of one running on the pool and
  // the other on a checked-out connection.
  //
  // client.release() MUST run even when everything above throws: a leaked
  // client exhausts the pool and takes down every route in the app, which is
  // strictly worse than the bug (an orphaned empty conversation row) this
  // transaction exists to prevent. Hence the try/finally rather than relying
  // on the outer catch alone.
  const client = await pool.connect()
  try {
    try {
      await client.query('BEGIN')

      let id = null

      if (conversationId) {
        const { rows } = await client.query(
          `SELECT id FROM public.ai_conversations WHERE id = $1 AND user_id = $2`,
          [conversationId, userId],
        )
        if (rows[0]) id = rows[0].id
      }

      if (!id) {
        const { rows } = await client.query(
          `INSERT INTO public.ai_conversations (user_id, title)
           VALUES ($1, $2) RETURNING id`,
          [userId, titleFrom(userText)],
        )
        id = rows[0].id
      }

      // Both messages of the turn in one statement, so a transcript can
      // never hold a question without its answer. seq continues from the
      // current tail; the UNIQUE (conversation_id, seq) constraint makes a
      // concurrent double-send fail loudly here rather than silently
      // reorder the transcript.
      //
      // The VALUES column is named `ord`, not `offset` — Postgres reserves
      // OFFSET as a keyword, and using it as a bare column alias is a
      // syntax error (verified directly against psql before shipping this).
      //
      // Wrapping the create-then-insert pair in BEGIN/COMMIT closes the
      // window where the ai_conversations INSERT above commits under
      // autocommit but this INSERT then fails (a dropped connection, or the
      // seq unique violation below) — that used to leave a titled,
      // zero-message conversation permanently in the user's list. Now
      // either both rows land or neither does.
      await client.query(
        `INSERT INTO public.ai_messages (conversation_id, role, content, pins, seq)
         SELECT $1, v.role, v.content, v.pins::jsonb,
                COALESCE((SELECT max(seq) + 1 FROM public.ai_messages WHERE conversation_id = $1), 0)
                  + v.ord
           FROM (VALUES ('user', $2::text, '[]', 0),
                        ('assistant', $3::text, $4::text, 1))
                AS v(role, content, pins, ord)`,
        [id, userText, replyText, JSON.stringify(Array.isArray(pins) ? pins : [])],
      )

      await client.query(
        `UPDATE public.ai_conversations SET updated_at = now() WHERE id = $1`,
        [id],
      )
      await client.query('COMMIT')
      return id
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      // Deliberately swallowed — see rule 1 above. This also covers the seq
      // unique-constraint violation from two truly concurrent sends to the
      // same conversation racing the "current tail" SELECT above: that is a
      // KNOWN, ACCEPTED gap (the brief's rule 1 — the paid-for answer always
      // wins over the transcript), not a bug to chase by making
      // persistTurn throw. The losing turn is silently missing from
      // history; the user still gets their reply.
      console.error('[ai:persistTurn]', e)
      return null
    }
  } finally {
    client.release()
  }
}

export function mountAiConversations(app, pool) {
  const gate = [requireAuth, requireTier(pool, 'ai_history')]
  const mutate = [...gate, rateLimit({ max: 60 })]

  // ---- LIST -----------------------------------------------------------
  // No messages: the list renders a title and a count, and shipping every
  // transcript for every conversation would be the largest response in the
  // app for the least-read data. Same reasoning as the itineraries LIST.
  app.get('/api/ai/conversations', ...gate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.*, (SELECT count(*) FROM public.ai_messages m
                       WHERE m.conversation_id = c.id) AS message_count
           FROM public.ai_conversations c
          WHERE c.user_id = $1
          ORDER BY c.updated_at DESC
          LIMIT 100`,
        [req.user.id],
      )
      res.json(rows.map(toConversation))
    } catch (e) {
      fail(res, 'ai:conversations:list', e)
    }
  })

  // ---- DETAIL ---------------------------------------------------------
  app.get('/api/ai/conversations/:id', ...gate, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, title, updated_at FROM public.ai_conversations
          WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      )
      if (!rows[0]) return res.status(404).json({ error: 'Conversation not found.' })

      const msgs = await pool.query(
        `SELECT role, content, pins FROM public.ai_messages
          WHERE conversation_id = $1 ORDER BY seq`,
        [req.params.id],
      )
      res.json({
        id: rows[0].id,
        title: rows[0].title,
        updatedAt: rows[0].updated_at,
        messages: msgs.rows.map(toMessage),
      })
    } catch (e) {
      fail(res, 'ai:conversations:detail', e)
    }
  })

  // ---- RENAME ---------------------------------------------------------
  // Validated here as well as by the CHECK constraint: a 23514 surfaces to
  // the user as a generic 500, while this produces a sentence the UI can
  // render. Same reasoning as validateTrip() in itineraries.js.
  app.patch('/api/ai/conversations/:id', ...mutate, async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    if (!title) return res.status(400).json({ error: 'Name the conversation.' })
    if (title.length > MAX_TITLE) {
      return res.status(400).json({ error: `Keep the name under ${MAX_TITLE} characters.` })
    }
    try {
      // Table aliased as `c` so the RETURNING subquery's `c.id` cannot be
      // shadowed by ai_messages' own `id` column. A bare `WHERE
      // m.conversation_id = id` here resolves `id` to `m.id` (verified
      // against psql via EXPLAIN VERBOSE — the filter became
      // `m.conversation_id = m.id`, always false), which silently reports
      // message_count: 0 on every rename.
      const { rows } = await pool.query(
        `UPDATE public.ai_conversations c SET title = $3, updated_at = now()
          WHERE c.id = $1 AND c.user_id = $2
          RETURNING c.*, (SELECT count(*) FROM public.ai_messages m
                         WHERE m.conversation_id = c.id) AS message_count`,
        [req.params.id, req.user.id, title],
      )
      if (!rows[0]) return res.status(404).json({ error: 'Conversation not found.' })
      res.json(toConversation(rows[0]))
    } catch (e) {
      fail(res, 'ai:conversations:rename', e)
    }
  })

  // ---- DELETE ---------------------------------------------------------
  // Messages go with it via ON DELETE CASCADE (0046).
  app.delete('/api/ai/conversations/:id', ...mutate, async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM public.ai_conversations WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      )
      if (!rowCount) return res.status(404).json({ error: 'Conversation not found.' })
      res.status(204).end()
    } catch (e) {
      fail(res, 'ai:conversations:delete', e)
    }
  })
}
