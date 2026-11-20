-- 0057 · Launch achievements (the owner's 20, from the vault's
-- "Cards Playbook — Extracted Rules"). Data only, no schema change.
--
-- Rule types are the two 0055 supports: all_of (exact card slugs) and
-- tag + count. Points follow the playbook tiers: Bronze 3 (1–2 cards),
-- Silver 5 (3), Gold 10 (4–5).
--
-- Three are approximations of the playbook wording, because a rule can't say
-- "from different regions" (yet):
--   coast-to-coast      → tag `coastal` x4  (any 4 coastal cards)
--   the-long-way-around → tag `explorer` x5 (cards tagged as island-wide picks)
--   keeper-of-the-past  → tag `history-question` x3 (cards with an on-site
--                          history question; collecting one means answering it)
--
-- Card tags these rules expect (add them to the launch cards):
--   beach, coastal, wildlife, biobay, mangrove, secluded, summit, lighthouse,
--   trail, explorer, history, ruins, town, history-question, fishing,
--   esperanza-night, culinary, night  — plus slugs the-ceiba-tree, playa-negra.
--
-- Until those cards exist every badge shows 0/N, and nothing can be earned.
-- Re-runnable: existing slugs are left alone.

INSERT INTO public.achievements (slug, name, description, points, rule, sort) VALUES
  ('guardian-of-the-ceiba', 'Guardian of the Ceiba', 'Find the island''s ancient ceiba tree', 3, '{"all_of": ["the-ceiba-tree"]}', 1),
  ('island-wildlife',       'Island Wildlife',       'Collect 3 wildlife cards',             5, '{"tag": "wildlife", "count": 3}', 2),
  ('fire-in-the-water',     'Fire in the Water',     'Collect 2 bioluminescence cards',      3, '{"tag": "biobay", "count": 2}', 3),
  ('mangrove-explorer',     'Mangrove Explorer',     'Collect 3 mangrove cards',             5, '{"tag": "mangrove", "count": 3}', 4),
  ('beach-bum',             'Beach Bum',             'Collect all 5 beach cards',           10, '{"tag": "beach", "count": 5}', 5),
  ('coast-to-coast',        'Coast to Coast',        'Collect 4 coastal cards',             10, '{"tag": "coastal", "count": 4}', 6),
  ('black-sand-seeker',     'Black Sand Seeker',     'Find Playa Negra',                     3, '{"all_of": ["playa-negra"]}', 7),
  ('hidden-paradise',       'Hidden Paradise',       'Collect 3 secluded-beach cards',       5, '{"tag": "secluded", "count": 3}', 8),
  ('not-afraid-of-heights', 'Not Afraid of Heights', 'Reach 2 summits',                      3, '{"tag": "summit", "count": 2}', 9),
  ('lighthouse-keeper',     'Lighthouse Keeper',     'Collect 3 lighthouse cards',           5, '{"tag": "lighthouse", "count": 3}', 10),
  ('trailblazer',           'Trailblazer',           'Collect 4 trail cards',               10, '{"tag": "trail", "count": 4}', 11),
  ('the-long-way-around',   'The Long Way Around',   'Collect 5 cards around the island',   10, '{"tag": "explorer", "count": 5}', 12),
  ('island-historian',      'Island Historian',      'Collect 4 history cards',             10, '{"tag": "history", "count": 4}', 13),
  ('relic-hunter',          'Relic Hunter',          'Collect 3 historic-ruins cards',       5, '{"tag": "ruins", "count": 3}', 14),
  ('town-explorer',         'Town Explorer',         'Collect 4 cards in Isabel II and Esperanza', 10, '{"tag": "town", "count": 4}', 15),
  ('keeper-of-the-past',    'Keeper of the Past',    'Answer 3 on-site history questions',   5, '{"tag": "history-question", "count": 3}', 16),
  ('fisherman',             'Fisherman',             'Collect 3 fishing cards',              5, '{"tag": "fishing", "count": 3}', 17),
  ('esperanza-nights',      'Esperanza Nights',      'Collect 3 Esperanza waterfront cards', 5, '{"tag": "esperanza-night", "count": 3}', 18),
  ('taste-of-vieques',      'Taste of Vieques',      'Collect 4 food and drink cards',      10, '{"tag": "culinary", "count": 4}', 19),
  ('night-owl',             'Night Owl',             'Collect 3 nighttime cards',            5, '{"tag": "night", "count": 3}', 20)
ON CONFLICT (slug) DO NOTHING;
