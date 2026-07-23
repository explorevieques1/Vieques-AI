--
-- PostgreSQL database dump
--

\restrict 4DldU4cejksQWVFRfDsUMCUfAZGjyh6Nx2sM0WbsZGj9egOJxdWRXhgVulffmgr

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: beaches; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.beaches (id, name, local_name, latitude, longitude, geom, region, type, water_conditions, access, facilities, best_for, in_wildlife_refuge, gate_hours, notes, is_active, created_at, updated_at) FROM stdin;
7	Playa Negra (Black Sand Beach)	Playa Negra	18.0942	-65.4889	0101000020E6100000ECC039234A5F50C08048BF7D1D183240	South / near Esperanza	{scenic,hiking}	rough	difficult (~20 min hike along dried stream bed)	{none}	photography, hiking, sightseeing	f	N/A	Unusual black/grey volcanic sand. ~20 minute walk from road; stream bed may be wet after rain. Black sand gets very hot - protect feet. Rough seas, considered more a hiking trip than a swim.	t	2026-06-25 22:33:52.646178-04	2026-06-25 22:33:52.646178-04
12	Playa Escondida	Escondida	18.1014	-65.4283	0101000020E61000001D386744695B50C07DD0B359F5193240	South / Wildlife Refuge	{snorkeling,secluded}	calm	difficult (short hike)	{none}	couples, snorkeling, privacy	t	Refuge gates close at sunset	One of the smallest beaches on the island - feels like a private beach for two. Isolated, good snorkeling, little shade. Bring snorkel gear.	t	2026-06-25 22:33:52.646178-04	2026-06-25 22:33:52.646178-04
13	Playa Plata (Silver Beach)	Playa Plata	18.1083	-65.3589	0101000020E610000034A2B437F85650C024287E8CB91B3240	Far East / Wildlife Refuge	{swimming,secluded}	calm	difficult (far east end, dirt road)	{none}	honeymooners, solitude	t	Refuge gates close at sunset	Sparkling bright white sand, crystal clear sparkling water, super soft. Far east end so rarely visited - often share with only a couple other groups. Favorite of honeymooners.	t	2026-06-25 22:33:52.646178-04	2026-06-25 22:33:52.646178-04
2	Playa Caracas (Red Beach)	Playa Caracas	18.1084	-65.413	0101000020E6100000DF4F8D976E5A50C0EBE2361AC01B3240	South / Wildlife Refuge	{swimming,snorkeling,family}	calm	easy (paved road into refuge, taxi/publico accessible)	{"covered picnic pavilions","composting restroom",shade}	families, swimming	t	Refuge gates close at sunset	Most accessible refuge beach, first access point on south side. Calm clear water, snorkeling on eastern side of cove. Was a Victoria's Secret Swim shoot location. Arrive early, crowds. Park only in lot to avoid fines.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:13:44.213716-04
14	Playuela (Tres Palmitas)	Playuela	18.1072	-65.4171	0101000020E610000058CA32C4B15A50C096218E75711B3240	South / Wildlife Refuge	{snorkeling,secluded,hiking}	calm	difficult (dirt road off Caracas access)	{none}	snorkeling, hiking, solitude	t	Refuge gates close at sunset	Isolated turquoise-water beach with a tiny island just offshore. Cerro Playuela hiking trail offers views of surrounding beaches. Very secluded.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:15:35.707843-04
3	Playa La Chiva (Blue Beach)	La Chiva	18.1129	-65.3873	0101000020E6100000696FF085C95850C0E9B7AF03E71C3240	South / Wildlife Refuge	{snorkeling,swimming,secluded}	calm	moderate (dirt road, numbered spots 1-20)	{"composting toilets at spots #3 and #12",parking}	snorkeling, solitude	t	Refuge gates close at sunset	Long beach, series of ~25 small coves shaped like a scallop shell - good chance of a private spot. Best snorkeling at spots #8-11. Lower numbers calmer with more shade. Bring everything; near-zero facilities. Watch for sea urchins by rocks.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:18:02.705096-04
4	Playa La Plata (Orchid Beach)	La Plata	18.1176	-65.376	0101000020E6100000F2D24D62105850C075029A081B1E3240	South / Wildlife Refuge	{swimming,family,secluded}	calm	moderate (dirt road past La Chiva, spots 21-26)	{none}	families, white sand	t	Refuge gates close at sunset	Brilliant soft white sand, bay-within-a-bay in Ensenada Honda so very small waves. Very kid-friendly. No facilities. La Platita boat ramp at end of road.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:19:42.912643-04
5	Playa Navio	Navio	18.0921	-65.4444	0101000020E6100000EA95B20C715C50C02BF697DD93173240	South / Wildlife Refuge	{surfing,bodysurfing,secluded}	moderate to rough	difficult (very rough dirt road, 4x4 recommended, or walk from Media Luna)	{none}	bodysurfing, photography, solitude	t	Refuge gates close at sunset	Past Media Luna. Strong foamy waves great for boogie boarding. Hidden caves on east side for photos. Rarely more than a handful of people. Sea grass on western end. No facilities.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:21:11.025449-04
6	Playa Media Luna	Media Luna	18.0896	-65.4556	0101000020E6100000B003E78C285D50C0BBB88D06F0163240	South / Wildlife Refuge	{swimming,family}	calm	moderate (dirt road)	{none}	small children, families	t	Refuge gates close at sunset	Half-moon shaped, shallow calm water, ideal for young kids. No facilities. Gateway to the Navio access road.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:36:20.455359-04
8	Playa Esperanza (Malecon Beach)	Esperanza Beach	18.0941	-65.4713	0101000020E6100000B5A679C7295E50C0B98D06F016183240	Esperanza town	{swimming,scenic}	calm	easy (in town, walkable)	{restaurants,bars,"fishing pier nearby"}	sunset, convenience	f	N/A	Right on the Esperanza malecon in front of bars and restaurants. Local hangout, especially weekends. Kids jump off the sugarcane pier. Best for a sunset drink rather than a full beach day.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:37:41.682976-04
9	Punta Arenas (Green Beach)	Green Beach	18.1189	-65.5769	0101000020E6100000FE43FAEDEB6450C0917EFB3A701E3240	West end / Wildlife Refuge	{swimming,snorkeling,family}	calm	difficult (long dirt trail, jeep recommended)	{none}	families, snorkeling	t	Refuge gates close at sunset	Far western tip. Very calm shallow water - like a warm bathtub - but deepens quickly so watch kids. Excellent snorkeling, can see Puerto Rico mainland and a wind farm. Bugs get bad early; go in morning.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:41:06.179315-04
10	Playa Grande	Playa Grande	18.0894	-65.5138	0101000020E6100000D42B6519E26050C02D431CEBE2163240	Southwest / Wildlife Refuge	{hiking,scenic,secluded}	rough	difficult (dirt road, dead-end road from Esperanza via 996/201)	{none}	walking, nature, turtle nesting	t	Refuge gates close at sunset	Long isolated beach, great for walking toward Playa Negra. Turtle nesting beach - keep dogs leashed, watch for roped nests. Not great for swimming. Leads to rugged Punta Vaca.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:41:06.186934-04
11	Pata Bastiamento (Cargo Beach)	Pata Bastiamento	18.1587	-65.4245	0101000020E6100000BA490C022B5B50C00DE02D90A0283240	North Coast	{swimming}	calm	easy (parking near the water)	{none}	couples, kids, dogs	f	N/A	Calm, shallow tide pool protected by a coral reef	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:55:35.298847-04
15	Playa El Gallito (Rooster Beach)	Rooster Beach	18.1419	-65.4749	0101000020E6100000B537F8C2645E50C06A4DF38E53243240	North coast	{snorkeling,scenic}	moderate	easy (north side, close to town)	{none}	snorkeling, sea glass, quick stop	f	N/A	Golden-sand north-coast beach, convenient for a quick stop. Good reefs for snorkeling and sea glass to find. Rocky but you can dip. Most people skip north beaches for the south.	t	2026-06-25 22:33:52.646178-04	2026-06-26 19:03:17.887715-04
17	Sea Glass Beach (Playa Muerte)	Playa Muerte	18.1486	-65.4443	0101000020E6100000386744696F5C50C0832F4CA60A263240	North / near Isabel II	{beachcombing,scenic}	very calm	easy	{none}	sea glass collecting	f	N/A	Known for abundant sea glass where local artisans collect. Small beach. A short / shallow beach - high tide can cover much of the sand, so check tides before going.	t	2026-06-25 22:33:52.646178-04	2026-06-26 18:58:39.749483-04
16	Mosquito Pier (Pier Beach)	Mosquito Pier	18.1485	-65.5134	0101000020E61000000D71AC8BDB6050C0BC74931804263240	North coast	{snorkeling,diving}	calm	easy (drive onto the pier)	{"parking along pier"}	snorkeling, diving	f	N/A	Long former-Navy pier on the north coast. Some of the best diving and snorkeling on the island along its sides. Small uncrowded beaches near the pier base. Drive right out onto it.	t	2026-06-25 22:33:52.646178-04	2026-06-26 19:03:17.895582-04
1	Sun Bay (Balneario Sombe) (test)	Sombe	18.0971	-65.4634	0101000020E6100000D93D7958A85D50C00D71AC8BDB183240	Esperanza / South	{swimming,family}	calm	easy (paved road, taxi/publico accessible)	{restrooms,showers,"snack bar","picnic tables",parking,"shade trees"}	families	f	Open daytime hours; balneario operated by municipality	Large crescent cove beach, soft white sand, walkable from Esperanza. Wild horses graze along the beach. Calm water on east end with great sunsets. Can get busy on weekends.	t	2026-06-25 22:33:52.646178-04	2026-06-26 19:04:28.84038-04
18	Coconut Beach	Playa Coconut	18.0966	-65.4795	0101000020E6100000A69BC420B05E50C029CB10C7BA183240	Esperanza	{Camping}	rough	difficult (bumpy dirt road)	{none}	camping and hammocking	f	N/A	Lots of palms and shade	t	2026-06-26 19:45:34.753897-04	2026-06-26 19:45:34.753897-04
\.


--
-- Name: beaches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.beaches_id_seq', 18, true);


--
-- PostgreSQL database dump complete
--

\unrestrict 4DldU4cejksQWVFRfDsUMCUfAZGjyh6Nx2sM0WbsZGj9egOJxdWRXhgVulffmgr

