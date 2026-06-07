# Cultra — AI Food Delivery (Design System)

Generated from UI/UX Pro Max reasoning: **Logistics/Delivery** + **Restaurant/Food** + **AI Personalization Landing**.

## Pattern
- Hero-centric conversion landing
- Feature-rich showcase with real-time / tracking cues
- Social proof before primary CTA

## Style
- Vibrant block-based sections on warm off-white
- Subtle motion (fade-up, hover color transitions — no layout-shifting scale)
- Meituan brand yellow as primary CTA (not generic AI purple gradients)

## Colors
| Role | Hex | Usage |
|------|-----|--------|
| Primary | `#FFC300` | CTAs, brand accents (Meituan) |
| Tracking blue | `#2563EB` | AI / tech trust accents |
| Delivery orange | `#F97316` | Speed, live status |
| Food warm | `#DC2626` | Sparingly — appetite highlights |
| Text | `#0F172A` | Headings |
| Muted | `#475569` | Body secondary |
| Surface | `#FFFBEB` / `#FFFFFF` | Sections |

## Typography
- **Headings:** Space Grotesk
- **Body:** DM Sans
- Minimum 16px body on mobile

## Anti-patterns (avoid)
- Emoji as UI icons — use SVG (Heroicons-style)
- Low-contrast muted body text on light backgrounds
- Missing `cursor-pointer` on interactive cards
- Static “fake” tracking with no visual hierarchy

## Page structure
1. Sticky nav + hero
2. Problem → AI solution (3 features)
3. Product demo mockup
4. Testimonials
5. Final CTA → `/planner`
