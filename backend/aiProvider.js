// ============================================================================
//  aiProvider.js — Model-agnostic tool-use loop (OpenAI-compatible wire format)
// ============================================================================
//
//  WHY THIS EXISTS
//  ---------------
//  The Ask AI pane answers cheap, shallow questions: "where do I rent a car",
//  "find me a quiet beach". That is a routing-and-summarizing job over ~100
//  island records, not a reasoning job — so it runs on Gemini 3.1 Flash-Lite
//  ($0.25/$1.50 per Mtok, with a free tier) instead of Claude Sonnet 4.6
//  ($3/$15), roughly a 10x saving on the highest-traffic route.
//
//  Model choice was verified against the live key, not assumed: the originally
//  planned gemini-2.5-flash-lite is closed to new API keys (404 "no longer
//  available to new users"). 3.1-flash-lite is both available and cheaper than
//  3.5-flash-lite ($0.30/$2.50), and tool-calling was confirmed working on it.
//
//  Anthropic is NOT reachable from here. It is reserved for the Exploration
//  tier's itinerary builder, which is a genuinely harder planning problem and
//  is what that tier pays for. Keeping the expensive model out of the
//  highest-traffic route is the whole cost argument for this file.
//
//  WHY OpenAI-COMPATIBLE RATHER THAN THE GOOGLE SDK
//  ------------------------------------------------
//  Gemini exposes an OpenAI-compatible endpoint, and so do Ollama, OpenRouter,
//  and OpenAI itself. Targeting that wire format means switching providers —
//  including to a self-hosted local model — is two env vars and no code change:
//
//      AI_PROVIDER=ollama
//      AI_BASE_URL=http://<your-gpu-box>:11434/v1
//
//  (Ollama on Railway specifically is NOT viable — no GPU, and CPU inference on
//  a 7B model makes each loop turn 60s+. Self-host it elsewhere and point here.)
//
//  RELATIONSHIP TO aiTools.js
//  --------------------------
//  Tool definitions stay single-source in aiTools.js in Anthropic's shape.
//  toOpenAITools() translates them on the way out, so adding a tool means
//  editing one file, not two that can silently drift apart.
// ============================================================================

import OpenAI from 'openai'

/** Base URLs per provider. `openai` uses the SDK default, so it is absent. */
const BASE_URLS = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  ollama: 'http://localhost:11434/v1',
}

/**
 * Build a client for the configured provider.
 *
 * Ollama ignores the key but the SDK requires a non-empty string, hence the
 * 'ollama' placeholder — without it a local setup throws before it ever
 * reaches the (keyless) server.
 */
function makeClient() {
  const provider = process.env.AI_PROVIDER || 'gemini'
  const baseURL = process.env.AI_BASE_URL || BASE_URLS[provider]
  const apiKey =
    provider === 'gemini'
      ? process.env.GEMINI_API_KEY
      : provider === 'ollama'
        ? 'ollama'
        : process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error(
      `No API key for AI_PROVIDER=${provider}. Set ${
        provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
      } in the environment.`,
    )
  }
  return new OpenAI({ apiKey, baseURL })
}

/**
 * Translate aiTools.js TOOLS (Anthropic shape) into OpenAI function shape.
 *
 * Sorted by name so the serialized tool list is byte-identical between
 * requests. That stability is what lets Gemini's implicit prefix caching hit —
 * and it is the same discipline Anthropic's explicit cache_control would need
 * if this ever routes back to Claude.
 *
 * @param {Array<{name: string, description: string, input_schema: object}>} tools
 * @returns {Array<object>} OpenAI-format tool definitions.
 */
export function toOpenAITools(tools) {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
}

/**
 * Run a capped tool-use loop and return the model's grounded answer.
 *
 * Mirrors the Anthropic loop this replaced: at most 5 round trips so a
 * misbehaving model cannot spin forever racking up cost or hanging the
 * request, and each tool result is truncated so a large result set cannot
 * blow the context window.
 *
 * @param {object}   args
 * @param {import('pg').Pool} args.pool     Shared DB pool.
 * @param {Array}    args.messages          [{role:'user'|'assistant', content}]
 * @param {string}   args.systemPrompt      Grounding + formatting rules.
 * @param {Array}    args.tools             TOOLS from aiTools.js.
 * @param {Function} args.runTool           runTool from aiTools.js.
 * @returns {Promise<{reply: string, pins: object[]}>}
 */
export async function runChatLoop({ pool, messages, systemPrompt, tools, runTool }) {
  const client = makeClient()
  const model = process.env.AI_MODEL || 'gemini-3.1-flash-lite'
  const openAITools = toOpenAITools(tools)

  // System prompt first and unchanging — the cacheable prefix.
  const convo = [{ role: 'system', content: systemPrompt }, ...messages]
  const allPins = []
  let finalText = ''

  for (let i = 0; i < 5; i++) {
    const res = await client.chat.completions.create({
      model,
      messages: convo,
      tools: openAITools,
      max_tokens: 1024,
    })

    const msg = res.choices[0]?.message
    if (!msg) break
    if (msg.content) finalText = msg.content

    const calls = msg.tool_calls || []
    if (calls.length === 0) break

    // Echo the assistant turn back before appending results — the API rejects
    // a tool result whose originating tool_call is missing from the history.
    convo.push(msg)

    for (const call of calls) {
      let args = {}
      try {
        // Always parse: providers differ in how they escape JSON, so string
        // matching on the raw argument blob is not safe.
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        args = {}
      }

      let listings = []
      try {
        const out = await runTool(pool, call.function.name, args)
        listings = out.listings
        allPins.push(...out.pins)
      } catch (e) {
        // Hand the failure back as a tool result rather than throwing: the
        // model can then say it couldn't look that up, instead of the whole
        // request 500-ing and burning the user's turn.
        console.error(`AI tool ${call.function.name} failed:`, e.message)
        listings = [{ error: 'lookup failed' }]
      }

      convo.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(listings).slice(0, 6000),
      })
    }
  }

  // De-dupe by "kind:id" so a place surfaced by two tools maps once.
  const seen = new Set()
  const pins = allPins.filter((p) => {
    const k = `${p.kind}:${p.id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return { reply: finalText, pins }
}

/**
 * Turn an upstream provider failure into something safe to show a visitor.
 *
 * The failure that motivated this: an exhausted account returns a raw
 * "Your credit balance is too low..." string, which is an internal billing
 * detail and must never reach the chat pane.
 *
 * @param {Error} err
 * @returns {{status: number, body: object}}
 */
export function describeProviderError(err) {
  const msg = String(err?.message || '')
  const status = err?.status || err?.statusCode

  if (status === 429 || /rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return {
      status: 503,
      body: { error: 'Ask AI is busy right now. Please try again in a moment.' },
    }
  }
  if (status === 401 || status === 403 || /api key|credit balance|billing/i.test(msg)) {
    // Operator problem, not the visitor's — log loudly, stay vague publicly.
    console.error('AI provider auth/billing failure:', msg)
    return {
      status: 503,
      body: { error: 'Ask AI is temporarily unavailable. Please try again later.' },
    }
  }
  console.error('AI provider error:', msg)
  return { status: 502, body: { error: 'Ask AI could not answer that. Please try again.' } }
}
