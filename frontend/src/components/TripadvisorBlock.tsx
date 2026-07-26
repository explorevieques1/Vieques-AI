import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { fetchStayTripadvisor, type TripadvisorInfo } from '../lib/api'
import type { Place } from '../lib/place'

/**
 * Live Tripadvisor content for one stay, slotted into PlaceDetailPanel.
 *
 * ATTRIBUTION IS NOT OPTIONAL. The Content API licence requires that wherever
 * their content appears we show *their* rating image (not a hand-rolled star
 * row), the review count, a link back to the listing, and photo credits. That
 * is why `rating_image_url` is rendered as an <img> rather than reduced to a
 * number, and why the whole block links out to `web_url`.
 *
 * RENDERS NOTHING RATHER THAN AN ERROR. A property with no Tripadvisor listing
 * (204) and an unreachable upstream both resolve to `null` in fetchStayTripadvisor.
 * Neither is worth a red box in a panel that is already showing our own
 * description, price and contact details — the traveller loses a nice-to-have,
 * not the page.
 */
function TripadvisorBlock({ place }: { place: Place }) {
  // `place.id` is namespaced as `stay:<rawId>`; the API wants the raw id.
  const stayId = place.id.replace(/^stay:/, '')

  // Tagged with the stay it answers, and everything below is *derived* by
  // comparing that tag to the current one — the same shape useCategoryPlaces
  // uses, for the same two reasons. It keeps setState out of the effect body,
  // and switching properties shows the skeleton on the very same render
  // instead of flashing the previous hotel's rating for one frame.
  const [cache, setCache] = useState<{ id: string; info: TripadvisorInfo | null } | null>(null)

  const fresh = cache?.id === stayId
  const info = fresh ? cache!.info : null
  const loading = !fresh

  useEffect(() => {
    let cancelled = false

    fetchStayTripadvisor(stayId)
      .then((data) => {
        if (!cancelled) setCache({ id: stayId, info: data })
      })
      .catch(() => {
        // fetchStayTripadvisor already swallows the expected failures (204, an
        // unreachable upstream); this is the belt-and-braces path for a network
        // drop mid-flight. Cache the miss too, or `loading` never clears.
        if (!cancelled) setCache({ id: stayId, info: null })
      })

    return () => {
      cancelled = true
    }
  }, [stayId])

  if (loading) {
    return (
      <div className="mt-4 h-[76px] animate-pulse rounded-2xl border border-white/6 bg-white/3" />
    )
  }

  if (!info || info.rating == null) return null

  const photos = info.photos.filter((p) => p.large || p.thumbnail)
  const reviews = info.reviews ?? []

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/8 bg-white/3">
      <div className="flex items-center gap-3 px-3.5 py-3">
        {info.rating_image_url ? (
          <img
            src={info.rating_image_url}
            alt={`${info.rating} of 5 bubbles`}
            className="h-[18px] shrink-0"
          />
        ) : (
          <span className="shrink-0 text-sm font-semibold text-foreground">{info.rating}</span>
        )}

        <span className="text-sm font-medium text-foreground">{info.rating.toFixed(1)}</span>

        {info.num_reviews != null && (
          <span className="text-sm text-muted-foreground">
            {info.num_reviews.toLocaleString()} review{info.num_reviews === 1 ? '' : 's'}
          </span>
        )}

        {info.web_url && (
          <a
            href={info.web_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
          >
            on Tripadvisor
            <ExternalLink size={11} />
          </a>
        )}
      </div>

      {info.ranking_string && (
        <div className="border-t border-white/6 px-3.5 py-2 text-[12px] text-muted-foreground">
          {info.ranking_string}
        </div>
      )}

      {info.awards.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-white/6 px-3.5 py-2.5">
          {info.awards.map((a) => (
            <span
              key={a}
              className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <div className="border-t border-white/6">
          {/* A scroll strip rather than a grid: the free tier returns at most
              five photos and the panel is narrow, so a grid would either crop
              them to postage stamps or push the reviews off the screen. */}
          <div className="flex snap-x gap-1.5 overflow-x-auto p-1.5">
            {photos.map((p, i) => (
              <img
                key={p.large ?? p.thumbnail ?? i}
                src={p.large ?? p.thumbnail ?? ''}
                alt={p.caption ?? `${info.name} on Tripadvisor`}
                title={[p.caption, p.credit && `© ${p.credit}`].filter(Boolean).join(' · ')}
                className="h-24 w-36 shrink-0 snap-start rounded-xl object-cover"
                loading="lazy"
              />
            ))}
          </div>
          {/* Photo credit is a licence term, not a caption nicety. Collapsed to
              one line for the strip; each image carries its own in `title`. */}
          <div className="px-3.5 pb-2 text-[10px] text-muted-foreground">
            Photos ©{' '}
            {[...new Set(photos.map((p) => p.credit).filter(Boolean))].join(', ') || 'Tripadvisor'}
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="border-t border-white/6 px-3.5 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Recent reviews
          </div>

          <ul className="mt-2.5 space-y-2.5">
            {reviews.slice(0, 3).map((r) => (
              <li key={r.id} className="rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
                <div className="flex items-baseline gap-2">
                  {r.rating != null && (
                    <span className="shrink-0 text-[11px] font-semibold text-primary">
                      {r.rating}/5
                    </span>
                  )}
                  {r.title && (
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                      {r.title}
                    </span>
                  )}
                </div>

                {r.text && (
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                    {/* Truncated in JS rather than with line-clamp so the "read
                        the rest on Tripadvisor" link is always the way to the
                        full text — which is also how the licence wants it. */}
                    {r.text.length > 180 ? `${r.text.slice(0, 180).trimEnd()}…` : r.text}
                  </p>
                )}

                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {r.author && <span className="truncate">{r.author}</span>}
                  {r.published_date && (
                    <span className="shrink-0">
                      {new Date(r.published_date).toLocaleDateString(undefined, {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto flex shrink-0 items-center gap-1 hover:text-primary"
                    >
                      Read on Tripadvisor
                      <ExternalLink size={9} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default TripadvisorBlock
