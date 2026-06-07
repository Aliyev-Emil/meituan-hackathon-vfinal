# Meituan AI Hackathon — Local Planner Demo

Short-term afternoon planning and execution agent for Shenzhen (mock data).

## Quick start

```bash
cd meituan-hackathon
npm install
cp .env.example .env.local
# Add OPENAI_API_KEY to .env.local
npm run dev
```

Open http://localhost:3000

### LLM setup

| Variable | Default | Notes |
|----------|---------|--------|
| `OPENAI_API_KEY` | — | Required for AI chat |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | DeepSeek, etc. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Any chat model |

Without a key, chat falls back to keyword/rules parsing.

### Custom venue photos (optional)

1. Copy images to `public/venues/photos/` as `r1.jpg`, `a1.jpg`, etc. (match ids in `src/lib/data/`)
2. In `.env.local`: `NEXT_PUBLIC_USE_LOCAL_VENUE_PHOTOS=true`
3. Restart `npm run dev`

## Pages

| Route | Purpose |
|-------|---------|
| `/` | LLM chat planner, 3 plan cards, one-stop agent |
| `/friends` | Social layer: favorites, invites, split bill, friend recs |
| `/orders` | Order map tracking + support chat |
| `/admin` | Browse all mock restaurants & activities |

## Demo prompts

- Family afternoon with diet-friendly wife and 5yo kid
- Cantonese + quiet for parents
- 4 friends, Japanese/lighter food
- Quick lunch near office
- Hotpot booking + traffic + 30 min reminder

## Tool code

See `src/lib/tools/` and `src/lib/agent/generate_plans.ts`.

## Design doc

See [DESIGN.md](./DESIGN.md) (≤2 pages).

## Test users

- `xiaoming` (current user)
- `zhangwei`, `lina`, `wangfang` — add as friends by ID
