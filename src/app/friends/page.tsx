"use client";

import { useCallback, useEffect, useState } from "react";
import VenueCard from "@/components/VenueCard";
import VenueImage from "@/components/VenueImage";
import SubpageLandingHero from "@/components/SubpageLandingHero";
import Toast from "@/components/Toast";
import type { Activity } from "@/lib/types";

interface FriendProfile {
  id: string;
  name: string;
  avatarUrl: string;
  bio: string;
  locationLabel: string;
  favoritesCount: number;
}

interface RecItem {
  id: string;
  name: string;
  cuisine?: string;
  cultureTag?: string;
  district?: string;
  pricePerPerson?: number;
  rating?: number;
  imageUrl: string;
  description: string;
  type: "restaurant" | "activity";
  distanceM?: number;
  recommendedBy: string[];
}

export default function FriendsPage() {
  const [data, setData] = useState<{
    user: { friendIds: string[]; favorites: string[] };
    activities: (Activity & { friendsAlsoWant: string[]; inMyFavorites: boolean })[];
    friendProfiles: FriendProfile[];
    circlePopular: string[];
    allUserIds: string[];
    hasFriends: boolean;
    invitations: { id: string; roomId: string; message: string; to: string; activityId: string }[];
    rooms: {
      id: string;
      activityId: string;
      activityName: string;
      hostId: string;
      memberIds: string[];
      invitedIds: string[];
      message: string;
      status: string;
      createdAt: string;
      activityImageUrl?: string;
      activityDistrict?: string;
    }[];
    friendRequests: { from: string; status: string }[];
  } | null>(null);
  const [newFriendId, setNewFriendId] = useState("");
  const [recs, setRecs] = useState<RecItem[]>([]);
  const [recsVisible, setRecsVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<{
    profile: { name: string; bio: string; avatarUrl: string; locationLabel: string };
    wantToGo: Activity[];
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/friends");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profileId) {
      setProfileData(null);
      return;
    }
    fetch(`/api/friends?profile=${profileId}`)
      .then((r) => r.json())
      .then(setProfileData);
  }, [profileId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  async function addFriend() {
    if (!newFriendId.trim()) return;
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_friend", friendId: newFriendId.trim() }),
    });
    const j = await res.json();
    if (j.ok) showToast("Friend request sent ✓");
    setNewFriendId("");
    load();
  }

  async function acceptFriend(id: string) {
    await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept_friend", friendId: id }),
    });
    showToast("Confirmed — you are now friends ✓");
    load();
  }

  async function toggleFavorite(activityId: string) {
    await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_favorite", activityId }),
    });
    load();
  }

  async function invite(friendId: string, activityId: string, name: string) {
    await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "invite",
        friendId,
        activityId,
        message: `@${friendId} Want to go to ${name} this weekend?`,
      }),
    });
    showToast(`Room created — @${friendId} invited`);
    load();
  }

  async function loadFriendRecs() {
    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "friend_recommendations" }),
    });
    const j = await res.json();
    setRecs(j.recommendations ?? []);
    setRecsVisible(true);
  }

  if (!data) return <p className="animate-fade">Loading…</p>;

  if (profileId && profileData) {
    const p = profileData.profile;
    return (
      <div className="animate-in">
        <Toast message={toast} />
        <button type="button" className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setProfileId(null)}>
          ← Back to Friends
        </button>
        <div className="card animate-scale" style={{ padding: 24, display: "flex", gap: 20, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.avatarUrl} alt={p.name} width={80} height={80} style={{ borderRadius: "50%" }} />
          <div>
            <h1 style={{ fontSize: 24 }}>{p.name}</h1>
            <p style={{ color: "#666" }}>{p.bio}</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>📍 {p.locationLabel}</p>
          </div>
        </div>
        <h2 style={{ margin: "24px 0 16px" }}>Want to go ({profileData.wantToGo.length})</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {profileData.wantToGo.map((a, i) => (
            <div key={a.id} className={`animate-in-delay-${Math.min(i + 1, 3)}`}>
              <VenueCard
                name={a.name}
                subtitle={a.district}
                imageUrl={a.imageUrl}
                description={a.description}
                meta={`⭐ ${a.rating} · ~${a.durationHours}h`}
              />
            </div>
          ))}
          {profileData.wantToGo.length === 0 && (
            <p style={{ color: "#888" }}>No favorites yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Toast message={toast} />
      <SubpageLandingHero
        eyebrow="Friends"
        title="Plan socially with your food circle"
        description="Invite friends to shared rooms, discover what your circle likes, and turn favorites into group-ready outing plans."
        chips={["Invite by ID", "Social recommendations", "Activity rooms", "Shared planning"]}
        ctaHref="/planner"
        ctaLabel="Start a plan"
      />

      {data.friendRequests.filter((r) => r.status === "pending").map((r) => (
        <div key={r.from} className="card animate-fade" style={{ padding: 16, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>@{r.from} sent you a friend request</span>
          <button type="button" className="btn-primary" onClick={() => acceptFriend(r.from)}>
            Accept
          </button>
        </div>
      ))}

      <section className="card animate-in" style={{ padding: 20, marginBottom: 24 }}>
        <h2>Add friend by ID</h2>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={newFriendId}
            onChange={(e) => setNewFriendId(e.target.value)}
            placeholder="joshua, haeun, emil, zhangwei…"
            list="user-ids"
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "2px solid #eee" }}
          />
          <datalist id="user-ids">
            {data.allUserIds.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <button type="button" className="btn-primary" onClick={addFriend}>
            Add
          </button>
        </div>
      </section>

      {data.rooms.length > 0 && (
        <section className="card animate-in" style={{ padding: 20, marginBottom: 24 }}>
          <h2 style={{ marginBottom: 12 }}>Activity rooms</h2>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
            Group invites — friends join the same outing.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {data.rooms.map((room) => (
              <div
                key={room.id}
                className="card"
                style={{
                  padding: 16,
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  border: "2px solid #fff8e1",
                }}
              >
                {room.activityImageUrl && (
                  <div style={{ position: "relative", width: 72, height: 72, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                    <VenueImage src={room.activityImageUrl} alt={room.activityName} fill />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <strong>{room.activityName}</strong>
                  <span className="badge badge-gray" style={{ marginLeft: 8 }}>
                    {room.venueKind === "restaurant" ? "🍽 Restaurant" : "🎯 Activity"}
                  </span>
                  <span className="badge badge-yellow" style={{ marginLeft: 4 }}>
                    {room.status}
                  </span>
                  <p style={{ fontSize: 13, color: "#666", marginTop: 6 }}>{room.message}</p>
                  <p style={{ fontSize: 12, marginTop: 6 }}>
                    Host: you · Members: {room.memberIds.length} · Invited:{" "}
                    {room.invitedIds.map((id) => `@${id}`).join(", ") || "—"}
                  </p>
                  <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                    {room.activityDistrict} · Room {room.id}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.hasFriends && data.friendProfiles.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 12 }}>My friends</h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {data.friendProfiles.map((f) => (
              <button
                key={f.id}
                type="button"
                className="card animate-fade"
                style={{
                  padding: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  border: "none",
                  textAlign: "left",
                  minWidth: 200,
                }}
                onClick={() => setProfileId(f.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.avatarUrl} alt={f.name} width={48} height={48} style={{ borderRadius: "50%" }} />
                <div>
                  <strong>{f.name}</strong>
                  <p style={{ fontSize: 12, color: "#666" }}>{f.favoritesCount} want-to-go</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {data.hasFriends && (
        <section className="card animate-in-delay-1" style={{ padding: 20, marginBottom: 24 }}>
          <h2>Friend-based recommendations</h2>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            Based on mutual friends&apos; purchases & favorites (private otherwise).
          </p>
          <button type="button" className="btn-primary" onClick={loadFriendRecs}>
            Get recommendations near me
          </button>
          {recsVisible && recs.length > 0 && (
            <div
              className="animate-in"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
                marginTop: 20,
              }}
            >
              {recs.map((r, i) => (
                <div key={r.id} className={`animate-in-delay-${Math.min(i + 1, 3)}`}>
                  <VenueCard
                    name={r.name}
                    subtitle={r.district ?? r.cuisine}
                    imageUrl={r.imageUrl}
                    description={r.description}
                    meta={
                      r.type === "restaurant"
                        ? `⭐ ${r.rating} · ¥${r.pricePerPerson}/pp · ${(r as { distanceM?: number }).distanceM ?? "?"}m`
                        : `⭐ ${r.rating} · ${(r as { distanceM?: number }).distanceM ?? "?"}m away`
                    }
                    badges={[
                      ...(r.cultureTag ? [r.cultureTag] : []),
                      `via ${r.recommendedBy.join(", ")}`,
                    ]}
                  />
                  <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    Recommended because {r.recommendedBy.join(" & ")} {r.type === "restaurant" ? "orders here" : "wants to go"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <h2 style={{ marginBottom: 16 }}>{data.hasFriends ? "Social activity feed" : "Activity calendar"}</h2>
      <div className="friends-activity-grid">
        {data.activities.map((a, i) => (
          <article
            key={a.id}
            className={`card friends-activity-card animate-in-delay-${Math.min((i % 3) + 1, 3)}`}
            style={{ padding: 0, overflow: "hidden" }}
          >
            <div className="friends-activity-card__media">
              <VenueImage src={a.imageUrl} alt={a.name} fill />
            </div>
            <div className="friends-activity-card__body">
              <div className="friends-activity-card__header">
                <span className="friends-activity-card__title">{a.name}</span>
                <span className="badge badge-gray" style={{ flexShrink: 0 }}>
                  {a.district}
                </span>
              </div>
              <p className="friends-activity-card__desc">{a.description}</p>
              {data.circlePopular.includes(a.id) && data.hasFriends && (
                <p className="highlight-friends" style={{ marginBottom: 8, fontSize: 12 }}>
                  🔥 Popular in your social circle
                </p>
              )}
              {a.friendsAlsoWant.length > 0 && (
                <p className="highlight-friends" style={{ marginBottom: 8, fontSize: 12 }}>
                  Friends also want to go: {a.friendsAlsoWant.join(", ")}
                </p>
              )}
              <div className="friends-activity-card__actions">
                <button type="button" className="btn-secondary" onClick={() => toggleFavorite(a.id)}>
                  {a.inMyFavorites ? "★ Favorited" : "☆ Want to go"}
                </button>
                {data.user.friendIds.map((fid) => (
                  <button
                    key={fid}
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: 12, padding: "8px 12px" }}
                    onClick={() => invite(fid, a.id, a.name)}
                  >
                    @{fid}
                  </button>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
