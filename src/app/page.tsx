import Link from "next/link";
import {
  IconArrowRight,
  IconMapPin,
  IconSparkles,
  IconTruck,
  IconUsers,
} from "@/components/landing/Icons";
import "./landing.css";

export default function LandingPage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-hero-grid">
          <div className="landing-animate">
            <div className="landing-badge">
              <span className="landing-badge-dot" aria-hidden />
              Live in Nanshan · AI-powered food & outings
            </div>
            <h1>
              Your AI copilot for <span>food delivery</span> and dining out
            </h1>
            <p className="landing-hero-lead">
              Cultra plans meals, picks restaurants, books tables, and coordinates group orders —
              so you spend less time scrolling and more time eating.
            </p>
            <div className="landing-cta-row">
              <Link href="/planner" className="landing-btn-primary">
                Try Cultra
                <IconArrowRight />
              </Link>
              <a href="#how-it-works" className="landing-btn-ghost">
                See how it works
              </a>
            </div>
            <div className="landing-stats">
              <div className="landing-stat">
                <strong>Chat → Plan</strong>
                <span>	
                AI builds your meal plan</span>
              </div>
              <div className="landing-stat">
                <strong>Culture-aware</strong>
                <span>Match your occasion</span>
              </div>
              <div className="landing-stat">
                <strong>Group-ready</strong>
                <span>Split bills & share plans</span>
              </div>
            </div>
          </div>

          <div className="landing-mockup landing-animate-delay" aria-hidden>
            <div className="landing-mockup-bar">
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-dot" />
              <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b", fontWeight: 600 }}>Cultra</span>
            </div>
            <div className="landing-mockup-body">
              <div className="landing-chat-bubble landing-chat-bubble--user">
                Family dinner near Nanshan, Cantonese, 4 people at 7pm
              </div>
              <div className="landing-chat-bubble landing-chat-bubble--ai">
                Found 3 plans — best match: seafood hotpot with 12 min queue, backup café if rain.
              </div>
              <div className="landing-track-card">
                <span style={{ flexShrink: 0, color: "#2563eb", display: "flex" }}>
                  <IconTruck />
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Order & reserve in one flow</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Table held · delivery ETA 28 min</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="features">
        <h2 className="landing-section-title">Built for how you actually order</h2>
        <p className="landing-section-sub">
          Logistics-grade reliability meets restaurant-quality recommendations — powered by AI, not endless menus.
        </p>
        <div className="landing-features">
          <article className="landing-feature-card">
            <div className="landing-icon-wrap landing-icon-wrap--yellow">
              <IconSparkles />
            </div>
            <h3>Smart meal plans</h3>
            <p>
              Describe your mood, budget, and crew. Cultra returns ranked plans with restaurants, activities, and
              diet-friendly picks.
            </p>
          </article>
          <article className="landing-feature-card">
            <div className="landing-icon-wrap landing-icon-wrap--blue">
              <IconMapPin />
            </div>
            <h3>Hyperlocal discovery</h3>
            <p>
              Real venues around you with distance, cuisine, and live context — tuned for Shenzhen Nanshan.
            </p>
          </article>
          <article className="landing-feature-card">
            <div className="landing-icon-wrap landing-icon-wrap--orange">
              <IconUsers />
            </div>
            <h3>Group coordination</h3>
            <p>
              Share itineraries, invite friends, split bills, and keep backup options when queues or weather change.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" style={{ paddingTop: 0 }}>
        <h2 className="landing-section-title">How it works</h2>
        <p className="landing-section-sub">Three steps from craving to confirmed.</p>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-num">1</div>
            <h3>Chat your intent</h3>
            <p style={{ color: "#475569", fontSize: 15, marginTop: 8 }}>
              Tell Cultra who, when, and what you feel like — in plain language.
            </p>
          </div>
          <div className="landing-step">
            <div className="landing-step-num">2</div>
            <h3>Swipe your plan</h3>
            <p style={{ color: "#475569", fontSize: 15, marginTop: 8 }}>
              Compare AI-ranked options with photos, match scores, and queue intel.
            </p>
          </div>
          <div className="landing-step">
            <div className="landing-step-num">3</div>
            <h3>Execute in-app</h3>
            <p style={{ color: "#475569", fontSize: 15, marginTop: 8 }}>
              Order, reserve, or share — then track everything on Orders.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-cta-band">
        <h2>Ready to eat smarter?</h2>
        <p>Open the planner and tell Cultra what you&apos;re craving tonight.</p>
        <Link href="/planner" className="landing-btn-primary">
          Launch Cultra
          <IconArrowRight />
        </Link>
      </section>

      <footer className="landing-footer">
        Cultra · Meituan Hackathon · AI food delivery &amp; outing planner
      </footer>
    </div>
  );
}
