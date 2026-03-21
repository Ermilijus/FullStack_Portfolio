import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../api";
import { useAppContext } from "../context/AppContext";

type RecentDrop = {
  id: string;
  item: {
    name: string;
    image: string | null;
    rarity: string;
  };
  droppedBy: string;
  lootboxName: string;
  createdAt: string;
};

const RARITY_COLORS: Record<string, string> = {
  Legendary: "var(--rarity-legendary-text)",
  Epic: "var(--rarity-epic-text)",
  Rare: "var(--rarity-rare-text)",
  Common: "var(--rarity-common-text)",
};

const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const DropCard = ({ drop, onClick }: { drop: RecentDrop; onClick: () => void }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const rarityColor = RARITY_COLORS[drop.item.rarity] ?? RARITY_COLORS.Common;

  return (
    <button type="button" className="drop-card" onClick={onClick} aria-label={`Open lootbox page — ${drop.item.name}`}>
      <div className="drop-image-wrap">
        {drop.item.image && !imgFailed ? (
          <img
            src={drop.item.image}
            alt={drop.item.name}
            className="drop-image"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="drop-image-fallback" aria-hidden>✦</div>
        )}
      </div>
      <div className="drop-info">
        <span className="drop-name">{drop.item.name}</span>
        <span className="drop-rarity" style={{ color: rarityColor }}>
          {drop.item.rarity}
        </span>
        <span className="drop-meta muted">
          {drop.droppedBy} · {formatRelativeTime(drop.createdAt)}
        </span>
      </div>
    </button>
  );
};

const RecentDrops = () => {
  const { token } = useAppContext();
  const navigate = useNavigate();
  const [drops, setDrops] = useState<RecentDrop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/home/recent-drops`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as { drops: RecentDrop[] };
        setDrops(data.drops);
      } catch {
        setDrops([]);
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [token]);

  return (
    <section className="home-section">
      <h2 className="home-section-title">Recent Legendary Drops</h2>
      {loading ? (
        <div className="drops-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="drop-card drop-card-skeleton" />
          ))}
        </div>
      ) : drops.length === 0 ? (
        <p className="muted">No legendary drops yet — open a crate!</p>
      ) : (
        <div className="drops-grid">
          {drops.map((drop) => (
            <DropCard key={drop.id} drop={drop} onClick={() => navigate("/lootbox")} />
          ))}
          {/* Pad to 4 slots if fewer drops exist */}
          {Array.from({ length: Math.max(0, 4 - drops.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="drop-card drop-card-empty">
              <span className="muted">No drop yet</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default RecentDrops;
