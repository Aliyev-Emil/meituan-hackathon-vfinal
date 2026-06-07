"use client";

import { useEffect, useState } from "react";
import { IconEdit } from "@/components/landing/Icons";

interface ProfileData {
  id: string;
  displayId: string;
  name: string;
  nation: string;
  nationalityOptions: string[];
  region: string;
  locationLabel: string;
  lat: number;
  lng: number;
  bio: string;
  avatarUrl: string;
  timezone: string;
  locale: string;
  friendCount: number;
  favoritesCount: number;
  checkedActivitiesCount: number;
  ordersCount: number;
}

function ProfileRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 0",
        borderBottom: "1px solid #eee",
        fontSize: 15,
      }}
    >
      <span style={{ color: "#666", flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingNation, setEditingNation] = useState(false);
  const [nationDraft, setNationDraft] = useState("");
  const [savingNation, setSavingNation] = useState(false);
  const [nationError, setNationError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setNationDraft(data.nation ?? "Korean");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function saveNation() {
    if (!profile || savingNation) return;
    setSavingNation(true);
    setNationError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nation: nationDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNationError(data.error ?? "Could not update nationality");
        return;
      }
      setProfile({ ...profile, nation: data.nation });
      setNationDraft(data.nation);
      setEditingNation(false);
    } catch {
      setNationError("Could not update nationality");
    } finally {
      setSavingNation(false);
    }
  }

  function cancelNationEdit() {
    setNationDraft(profile?.nation ?? "Korean");
    setNationError(null);
    setEditingNation(false);
  }

  if (loading) {
    return <p style={{ color: "#666" }}>Loading profile…</p>;
  }

  if (!profile) {
    return <p style={{ color: "#666" }}>Could not load profile.</p>;
  }

  return (
    <div className="animate-in" style={{ maxWidth: 760 }}>
      <section className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
          <img
            src={profile.avatarUrl}
            alt=""
            width={80}
            height={80}
            style={{ borderRadius: "50%", border: "3px solid var(--meituan-yellow)" }}
          />
          <div>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>{profile.name}</h2>
            <p style={{ color: "#666", fontSize: 14 }}>{profile.bio}</p>
          </div>
        </div>

        <h3 style={{ fontSize: 14, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Account
        </h3>
        <ProfileRow label="User ID" value={profile.displayId} />
        <ProfileRow label="Internal ID" value={profile.id} />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: editingNation ? "flex-start" : "center",
            gap: 16,
            padding: "14px 0",
            borderBottom: "1px solid #eee",
            fontSize: 15,
          }}
        >
          <span style={{ color: "#666", flexShrink: 0 }}>Nationality</span>
          {editingNation ? (
            <div style={{ flex: 1, maxWidth: 320 }}>
              <select
                value={nationDraft}
                onChange={(e) => setNationDraft(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "2px solid #eee",
                  fontSize: 15,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                {profile.nationalityOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {nationError && (
                <p style={{ color: "#c62828", fontSize: 13, marginBottom: 8 }}>{nationError}</p>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={cancelNationEdit} disabled={savingNation}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={saveNation} disabled={savingNation}>
                  {savingNation ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600 }}>{profile.nation}</span>
              <button
                type="button"
                aria-label="Edit nationality"
                title="Edit nationality"
                onClick={() => {
                  setNationDraft(profile.nation);
                  setNationError(null);
                  setEditingNation(true);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  padding: 0,
                  border: "none",
                  borderRadius: "50%",
                  background: "transparent",
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                <IconEdit size={18} />
              </button>
            </div>
          )}
        </div>

        <h3
          style={{
            fontSize: 14,
            color: "#888",
            margin: "20px 0 4px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Location
        </h3>
        <ProfileRow label="Region" value={profile.region} />
        <ProfileRow label="City / district" value={profile.locationLabel} />
        <ProfileRow label="Coordinates" value={`${profile.lat.toFixed(3)}, ${profile.lng.toFixed(3)}`} />
        <ProfileRow label="Timezone" value={profile.timezone} />

        <h3
          style={{
            fontSize: 14,
            color: "#888",
            margin: "20px 0 4px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Preferences
        </h3>
        <ProfileRow label="Locale" value={profile.locale} />
        <ProfileRow label="Friends" value={profile.friendCount} />
        <ProfileRow label="Saved favorites" value={profile.favoritesCount} />
        <ProfileRow label="Checked activities" value={profile.checkedActivitiesCount} />
        <ProfileRow label="Past orders" value={profile.ordersCount} />
      </section>
    </div>
  );
}
