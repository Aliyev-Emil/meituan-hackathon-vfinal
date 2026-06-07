"use client";

import { useEffect, useMemo, useState } from "react";
import type { Activity, Restaurant } from "@/lib/types";
import SubpageLandingHero from "@/components/SubpageLandingHero";
import VenueCard from "@/components/VenueCard";

export default function AdminPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tab, setTab] = useState<"restaurants" | "activities">("restaurants");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Restaurant | Activity | null>(null);

  useEffect(() => {
    fetch("/api/restaurants")
      .then((r) => r.json())
      .then((d) => {
        setRestaurants(d.restaurants);
        setActivities(d.activities);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = tab === "restaurants" ? restaurants : activities;
    if (!q) return list;
    return list.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.nameZh.includes(q) ||
        v.district.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        ("cuisine" in v && v.cuisine.toLowerCase().includes(q))
    );
  }, [search, tab, restaurants, activities]);

  return (
    <div>
      <SubpageLandingHero
        eyebrow="Data"
        title="Inspect venue coverage and quality"
        description={`${restaurants.length} restaurants and ${activities.length} activities across Shenzhen districts.`}
        chips={["Searchable catalog", "Culture tags", "District coverage", "Quality review"]}
      />

      <div className="card animate-in" style={{ padding: 16, marginBottom: 24 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, district, cuisine, address…"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "2px solid #eee", fontSize: 16 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          type="button"
          className={tab === "restaurants" ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setTab("restaurants");
            setSelected(null);
          }}
        >
          Restaurants ({restaurants.length})
        </button>
        <button
          type="button"
          className={tab === "activities" ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setTab("activities");
            setSelected(null);
          }}
        >
          Activities ({activities.length})
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 24 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {filtered.map((v, i) => (
            <div
              key={v.id}
              className={`animate-in-delay-${Math.min((i % 3) + 1, 3)}`}
              onClick={() => setSelected(v)}
              onKeyDown={(e) => e.key === "Enter" && setSelected(v)}
              role="button"
              tabIndex={0}
            >
              <VenueCard
                name={v.name}
                subtitle={`${v.nameZh} · ${v.district}`}
                imageUrl={v.imageUrl}
                description={v.description}
                compact
                meta={
                  "cuisine" in v
                    ? `⭐ ${v.rating} · ¥${v.pricePerPerson}/pp · ${v.cuisine}`
                    : `⭐ ${v.rating} · ${v.type} · ~${v.durationHours}h`
                }
              />
            </div>
          ))}
          {filtered.length === 0 && <p style={{ color: "#888" }}>No matches for &quot;{search}&quot;</p>}
        </div>

        {selected && (
          <div className="card animate-scale" style={{ padding: 24, position: "sticky", top: 24, alignSelf: "start" }}>
            <button type="button" className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>
              Close
            </button>
            <VenueCard
              name={selected.name}
              subtitle={`${selected.nameZh} · ${selected.district}`}
              imageUrl={selected.imageUrl}
              description={selected.description}
              meta={selected.address}
              badges={
                "features" in selected
                  ? [...selected.features, ...(selected.familyFriendly ? ["family"] : [])]
                  : [selected.type, ...(selected.familyFriendly ? ["family"] : [])]
              }
            />
            <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6 }}>
              <p>
                <strong>Coordinates:</strong> {selected.lat}, {selected.lng}
              </p>
              {"cuisine" in selected && (
                <>
                  <p>
                    <strong>Cuisine:</strong> {selected.cuisine} ({selected.cultureTag})
                  </p>
                  <p>
                    <strong>Price:</strong> ¥{selected.pricePerPerson}/person · Diet score {selected.dietScore}
                  </p>
                  <p>
                    <strong>Prep:</strong> {selected.avgPrepMin} min · {selected.reservable ? "Reservable" : "Walk-in"}
                  </p>
                  <p>
                    <strong>Features:</strong> {selected.features.join(", ")}
                  </p>
                </>
              )}
              {"type" in selected && !("cuisine" in selected) && (
                <>
                  <p>
                    <strong>Type:</strong> {selected.type}
                  </p>
                  <p>
                    <strong>Duration:</strong> ~{selected.durationHours} hours
                  </p>
                  <p>
                    <strong>Scenarios:</strong> {selected.scenarios.join(", ")}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
