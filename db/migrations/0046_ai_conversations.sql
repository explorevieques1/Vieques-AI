-- ============================================================
-- 0046_ai_conversations.sql — saved Ask AI conversations
--
-- MODELED ON 0045_itineraries.sql. Same parent/child split, same
-- per-user RLS on the parent and EXISTS-join RLS on the child.
-- Read that file's header first; the reasoning is identical and is
-- not repeated here.
--
-- WHY seq AND NOT created_at ORDERING
-- -----------------------------------
-- Both messages of a turn are written in one request and can share a
-- timestamptz to the microsecond. A transcript whose order is
-- ambiguous is a transcript that renders the answer above the
-- question, so order is explicit and UNIQUE per conversation.
--
-- WHY pins IS PER-MESSAGE
-- -----------------------
-- Reopening a conversation drops its places back on the map. The pins
-- belong to the assistant message that produced them, so they travel
-- with that reply rather than being recomputed (which would cost
-- another model call) or stored once per conversation (which would
-- lose which answer they came from).
--
-- Gated on 'ai_history' (Vacation and up) in the routes. The free
-- tier still gets its 3 lifetime messages — they are simply not saved.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  -- Always an array. '[]' not NULL so the client never branches on null.
  pins             jsonb NOT NULL DEFAULT '[]'::jsonb,
  seq              int NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);

-- The only conversation-list read: this user's, most recently touched first.
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user
  ON public.ai_conversations (user_id, updated_at DESC);

-- The only transcript read: one conversation's messages in order.
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON public.ai_messages (conversation_id, seq);

-- ------------------------------------------------------------
-- RLS. Identical in shape to 0045: the user owns the parent outright,
-- and the child proves ownership by joining to it. The EXISTS
-- subquery is on USING *and* WITH CHECK for UPDATE so a message
-- cannot be re-parented into someone else's conversation.
-- ------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own conversations read" ON public.ai_conversations;
CREATE POLICY "own conversations read" ON public.ai_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own conversations insert" ON public.ai_conversations;
CREATE POLICY "own conversations insert" ON public.ai_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own conversations update" ON public.ai_conversations;
CREATE POLICY "own conversations update" ON public.ai_conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own conversations delete" ON public.ai_conversations;
CREATE POLICY "own conversations delete" ON public.ai_conversations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own messages read" ON public.ai_messages;
CREATE POLICY "own messages read" ON public.ai_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own messages insert" ON public.ai_messages;
CREATE POLICY "own messages insert" ON public.ai_messages
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own messages update" ON public.ai_messages;
CREATE POLICY "own messages update" ON public.ai_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own messages delete" ON public.ai_messages;
CREATE POLICY "own messages delete" ON public.ai_messages
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()));
