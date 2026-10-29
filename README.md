# Chomu ne Ukrainskoyu?

AI-powered Ukrainian daily news editor. The system collects reports from Telegram and RSS, groups them into events, scores credibility and importance from independent sources, and publishes **one** Ukrainian TOP-10 digest per day.

It is an editor, not a scraper. Source channels are signals. The published text is original and concise.

Pipeline: **COLLECT -> NORMALIZE -> GROUP -> VERIFY -> SCORE -> SELECT TOP N -> WRITE -> PUBLISH**

No permanent server is required. GitHub Actions run the jobs. PostgreSQL lives on Railway.

## Architecture

```
collect-news.yml  03:13, 09:13, 15:13, 19:37 Kyiv
  GramJS MTProto + RSS adapters
    -> raw_news / telegram_messages

daily-digest.yml  once per day
  pre-cluster -> AI grouping -> independence
    -> credibility / importance -> TOP N
    -> Ukrainian digest -> Bot API publish
```

Entry points:

- `npm run collect` — ingest sources
- `npm run digest` — build and publish the daily post

Sources are stored in the database. Adding a channel or feed does not require a code change.

## What this MVP does not do

- Reuters, AP, and AFP have no public RSS. They are not seeded. BBC, Guardian, Al Jazeera, and DW are used instead.
- `hromadske.ua` has no working RSS. Hromadske Radio is seeded as a separate outlet.
- Government websites often block bots (403/HTML). Official confirmation uses official Telegram channels that were verified to serve public history, plus ArmyInform RSS.
- Facebook and X are not scraped.

## Requirements

- Node.js 20+
- PostgreSQL 15+ (Railway is the intended host)
- Telegram API application (to *read* channels)
- Telegram bot (to *publish* the digest)
- OpenAI API key

## Local setup

```bash
git clone https://github.com/sasha4ox/ainewsukraine.git
cd ainewsukraine
cp .env.example .env
npm install
```

Fill `.env` (never commit it). Then:

```bash
npx prisma migrate deploy
npm run db:seed
npm run collect
npm run digest
```

`digest` will fail to publish until `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` are set. Collection works without the bot.

## PostgreSQL / Railway

1. Create a Railway project and add PostgreSQL.
2. Copy the public `DATABASE_URL` (include `?sslmode=require` if Railway gives a proxy URL).
3. Put it in `.env` and in GitHub Actions secret `DATABASE_URL`.
4. Run `npx prisma migrate deploy` and `npm run db:seed` once.

Prisma schema: `prisma/schema.prisma`. Migrations: `prisma/migrations`.

## Telegram Client API (reading channels)

Do **not** use a bot to read arbitrary channel history. Use MTProto via GramJS.

1. Open https://my.telegram.org while logged into Telegram.
2. Go to **API development tools**.
3. Create an application. Copy `api_id` and `api_hash`.
4. Put them in `.env` as `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`.
5. Run an interactive login on your machine:

```bash
npm run tg:login
```

Enter phone, login code, and 2FA password if enabled. The script prints a long `TELEGRAM_SESSION` string.

6. Save that string to `.env` and to GitHub secret `TELEGRAM_SESSION`.

Never commit session files or the session string.

### Private invite channel

`https://t.me/+pFvHjtPUufZhMTFi` is not publicly previewable. The user account must join it:

```bash
npm run tg:join
```

If the invite expired, update `telegram_sources.invite_link` with a fresh link and run `tg:join` again.

### Session revoked in GitHub Actions

GitHub runners use datacenter IPs. Telegram may drop the session (`AUTH_KEY_UNREGISTERED`, `SESSION_REVOKED`). Collection then:

- logs the error
- continues with RSS
- optionally uses `TELEGRAM_WEB_FALLBACK=true` to read **public** `t.me/s/<username>` pages

Regenerate the session locally with `npm run tg:login` and update the GitHub secret.

### Channel access

| Source | Access |
| --- | --- |
| `@blyskavka_ua` | Public username |
| `@OPG_NEWS_UA` | Public username |
| `t.me/+pFvHjtPUufZhMTFi` | Private invite; membership required |
| Official channels (`@V_Zelenskiy_official`, `@dsns_telegram`, `@kpszsu`, `@GeneralStaffZSU`, `@Denys_Smyhal`) | Public usernames |

## Telegram bot (publishing)

1. In Telegram, open [@BotFather](https://t.me/BotFather) and create a bot. Copy the token to `TELEGRAM_BOT_TOKEN`.
2. Create a channel for the digest. Add the bot as administrator with permission to post.
3. Set `TELEGRAM_CHANNEL_ID` to `@your_channel` or the numeric `-100...` id.

The bot only publishes to **your** channel. It does not read other channels.

## OpenAI

1. Create an API key at https://platform.openai.com/api-keys
2. Set `OPENAI_API_KEY`
3. Optional: `OPENAI_MODEL_FAST` (default `gpt-4o-mini`) and `OPENAI_MODEL_SMART` (default `gpt-4o`)

Prompts live in `src/ai/prompts/`. Responses are Structured Outputs and re-validated with Zod. The model is never trusted to invent official confirmations or source URLs.

## GitHub Secrets and variables

**Secrets**

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`

**Variables** (optional)

- `TIMEZONE` default `Europe/Kyiv`
- `DIGEST_TIME` default `20:00`
- `DIGEST_NEWS_COUNT` default `10`
- `MIN_CREDIBILITY_SCORE` default `60`
- `MIN_IMPORTANCE_SCORE` default `0`
- `MAX_PER_CATEGORY` default `3`
- `MAX_EVENTS_TO_SCORE` default `40`
- `TELEGRAM_WEB_FALLBACK` default unset/false
- `OPENAI_MODEL_FAST` / `OPENAI_MODEL_SMART`

Workflows:

- [`.github/workflows/collect-news.yml`](.github/workflows/collect-news.yml) — 03:13, 09:13, 15:13, 19:37 Kyiv (last run ~30 minutes before the digest)
- [`.github/workflows/daily-digest.yml`](.github/workflows/daily-digest.yml) — daily at 20:07 Kyiv. Two UTC crons cover summer and winter; the off-hour run exits without posting.

Both support **Run workflow** from the Actions tab.

Idempotency: `daily_digests` is unique on `(digest_date, digest_type)`. A second run the same day will not publish twice. Failed publishes leave status `generated` so the next run retries send only.

## Adding sources

### Telegram

```sql
insert into telegram_sources (id, name, username, invite_link, source_type, reliability_score, enabled, last_processed_message_id, created_at, updated_at)
values (cuid(), 'New channel', 'some_username', null, 'public_channel', 40, true, 0, now(), now());
```

Or use Prisma Studio: `npm run db:studio`.

`source_type`: `public_channel` | `private_channel` | `official`.

### RSS

```sql
insert into sources (id, name, type, url, country, language, organization, is_official, reliability_score, enabled, created_at, updated_at)
values (cuid(), 'Outlet', 'RSS', 'https://example.com/rss', 'UA', 'uk', 'Outlet', false, 70, true, now(), now());
```

Only add feeds that actually return RSS/Atom. The collector sniffs the body, so a wrong `Content-Type` (ZN.ua) still works. HTML pages are skipped.

### Official sources

Insert into `official_sources`, then point a `telegram_sources` row at it with `official_source_id` and `source_type = official`. Official confirmation is recorded only when such a source is actually linked to the event.

## Changing digest rules

All of these are environment variables / GitHub variables:

| Variable | Meaning |
| --- | --- |
| `TIMEZONE` | Calendar timezone, default `Europe/Kyiv` |
| `DIGEST_TIME` | Local publish time, default `20:00`. The workflow posts at 20:07 so it misses GitHub's :00 queue |
| `DIGEST_NEWS_COUNT` | Maximum stories, default 10 |
| `MIN_CREDIBILITY_SCORE` | Default 60. One reliable independent outlet is enough; official confirmation is a bonus, not a requirement |
| `MIN_IMPORTANCE_SCORE` | Default 0 |
| `MAX_PER_CATEGORY` | Diversity cap, default 3 |
| `MAX_EVENTS_TO_SCORE` | How many clustered events get AI scores, default 40 |
| `COPY_SIMILARITY_THRESHOLD` | Copy-chain detection, default 0.65 |

If fewer than N events pass the threshold, the digest publishes fewer. It never invents a story to fill the list.

## Seeded RSS (verified live)

Ukraine: Suspilne, Ukrainska Pravda, Radio Svoboda, ZN.ua, LB.ua, Ukrinform, NV, Babel, Espreso, Interfax-Ukraine, European Pravda, ArmyInform, Hromadske Radio.

International: BBC World, BBC Ukrainian, The Guardian World, Al Jazeera, DW Ukrainian.

## Credibility and importance

Credibility is a **0-100 score**, not a claim of mathematical truth.

Deterministic base uses:

- independent source roots (copy chains count as one)
- source reliability
- official confirmation actually found
- contradictions
- Telegram-only origin
- anonymous sourcing

The model may adjust by at most +/-10 and must write a short Ukrainian explanation. Official confirmation is never claimed unless an official source row is linked.

Importance is for Ukrainian readers. View counts and clickbait are not used.

## Logging

Structured logs via `pino`. Secrets are redacted. Typical fields: collected counts, duplicates, events created, scores, selected ids, publish result.

## Tests

```bash
npm test
npm run typecheck
```

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `Invalid environment: DATABASE_URL` | Set Railway URL in `.env` / GitHub secret |
| `TELEGRAM_SESSION is missing` | Run `npm run tg:login` |
| Session revoked in CI | Re-login locally, update secret, or enable `TELEGRAM_WEB_FALLBACK` |
| Invite join fails | Invite expired; store a new link |
| RSS source failed | One feed error does not stop others; check URL still returns XML |
| OpenAI error | Digest fails gracefully after retries; no publish |
| Publish failed | Digest stays `generated`; rerun the workflow |
| Duplicate digest | Unique `(digest_date, digest_type)` blocks a second post |
| Empty digest | Not enough events above `MIN_CREDIBILITY_SCORE` |

## Project layout

```
prisma/schema.prisma
prisma/seed.ts
src/config/env.ts
src/collectors/
src/normalize/
src/pipeline/
src/ai/prompts/
src/publish/
src/scripts/collect.ts
src/scripts/daily-digest.ts
.github/workflows/
```

## License

Private project. Respect copyright: summarize and link, do not copy articles.
