import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  addLootboxFavorite,
  fetchLootboxCatalog,
  fetchLootboxDetail,
  LootboxCatalogItem,
  LootboxDetail,
  LootboxOpenResult,
  openLootbox,
  removeLootboxFavorite,
} from "../api";
import { useAppContext } from "../context/AppContext";

type SortKey = "name" | "rarity" | "marketPrice";
type SortDirection = "asc" | "desc";
type ReelVisualItem = {
  id: string;
  name: string;
  image: string | null;
  rarity: string;
  marketPrice?: number;
  weight: number;
};

const REEL_START_INDEX = 6;
const REEL_WINNER_INDEX = 39;
const REEL_LEAD_IN_COUNT = REEL_WINNER_INDEX;
const REEL_TAIL_COUNT = 6;
const REEL_STRIP_LENGTH = REEL_LEAD_IN_COUNT + 1 + REEL_TAIL_COUNT;
const REEL_CARD_WIDTH_PX = 120;
const REEL_CARD_GAP_PX = 12;
const REEL_CARD_STRIDE = REEL_CARD_WIDTH_PX + REEL_CARD_GAP_PX;
const REEL_BASE_SETTLE_MS = 900;
const REEL_MS_PER_CARD = 185;
const REEL_TEXT_INDEX_BIAS = 0.32;

const RARITY_RANK: Record<string, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const formatMarketPrice = (value: number | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }

  return `$${value.toFixed(2)}`;
};

const rarityClass = (rarity: string) => {
  const normalized = rarity.toLowerCase();
  if (normalized === "legendary") {
    return "legendary";
  }
  if (normalized === "epic") {
    return "epic";
  }
  if (normalized === "rare") {
    return "rare";
  }
  return "common";
};

const walletLabel = (wallet: "currency" | "specialCurrency") => {
  if (wallet === "specialCurrency") {
    return "Shards";
  }

  return "Credits";
};

const createRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `roll-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const pickWeightedFrom = (items: ReelVisualItem[]) => {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  let cursor = Math.random() * totalWeight;

  for (const item of items) {
    cursor -= Math.max(1, item.weight);
    if (cursor <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
};

const buildReelStrip = (pool: ReelVisualItem[], winner: ReelVisualItem): ReelVisualItem[] => {
  const safePool = pool.length > 0 ? pool : [winner];
  const leadIn = Array.from({ length: REEL_LEAD_IN_COUNT }, () => pickWeightedFrom(safePool));
  const tail = Array.from({ length: REEL_TAIL_COUNT }, () => pickWeightedFrom(safePool));

  return [...leadIn, winner, ...tail];
};

const easeOutCubic = (value: number) => {
  return 1 - Math.pow(1 - value, 3);
};

const getReelSpinDurationMs = () => {
  const travelCards = Math.max(1, REEL_WINNER_INDEX - REEL_START_INDEX);
  return REEL_BASE_SETTLE_MS + (travelCards * REEL_MS_PER_CARD);
};

const Lootbox = () => {
  const { token } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [lootboxes, setLootboxes] = useState<LootboxCatalogItem[]>([]);
  const [selectedLootboxId, setSelectedLootboxId] = useState<string | null>(null);
  const [hoveredLootboxId, setHoveredLootboxId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, LootboxDetail>>({});
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDropPoolModal, setShowDropPoolModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dropSortKey, setDropSortKey] = useState<SortKey>("rarity");
  const [dropSortDirection, setDropSortDirection] = useState<SortDirection>("desc");
  const [showReelModal, setShowReelModal] = useState(false);
  const [reelItems, setReelItems] = useState<ReelVisualItem[]>([]);
  const [reelSpinning, setReelSpinning] = useState(false);
  const [reelRevealed, setReelRevealed] = useState(false);
  const [reelSkipUsed, setReelSkipUsed] = useState(false);
  const [reelReady, setReelReady] = useState(false);
  const [reelResult, setReelResult] = useState<LootboxOpenResult | null>(null);
  const [reelRunId, setReelRunId] = useState(0);
  const reelFinishTimerRef = useRef<number | null>(null);
  const reelTickerRef = useRef<number | null>(null);
  const reelSpinDurationRef = useRef(0);
  const reelStartArmedRef = useRef(false);
  const reelStrideRef = useRef(REEL_CARD_STRIDE);
  const reelHalfCardRef = useRef(REEL_CARD_WIDTH_PX / 2);
  const reelWindowCenterRef = useRef(0);
  const reelItemsRef = useRef<ReelVisualItem[]>([]);
  const reelWindowRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const reelNameRef = useRef<HTMLElement | null>(null);
  const reelRarityChipRef = useRef<HTMLSpanElement | null>(null);

  const selectedLootbox = useMemo(() => {
    if (!selectedLootboxId) {
      return null;
    }

    return lootboxes.find((lootbox) => lootbox.id === selectedLootboxId) ?? null;
  }, [lootboxes, selectedLootboxId]);

  const selectedDetail = selectedLootboxId ? detailsById[selectedLootboxId] : undefined;

  const clearReelFinishTimer = () => {
    if (reelFinishTimerRef.current !== null) {
      window.clearTimeout(reelFinishTimerRef.current);
      reelFinishTimerRef.current = null;
    }
  };

  const clearReelTicker = () => {
    if (reelTickerRef.current !== null) {
      window.cancelAnimationFrame(reelTickerRef.current);
      reelTickerRef.current = null;
    }
  };

  const measureReelGeometry = () => {
    const reelWindow = reelWindowRef.current;
    const strip = stripRef.current;
    if (!strip || !reelWindow) {
      return false;
    }

    const cards = strip.querySelectorAll<HTMLElement>(".lootbox-reel-card");
    if (cards.length === 0) {
      return false;
    }

    const firstRect = cards[0].getBoundingClientRect();
    reelHalfCardRef.current = firstRect.width / 2;
    reelWindowCenterRef.current = reelWindow.clientWidth / 2;

    if (cards.length > 1) {
      const stride = cards[1].offsetLeft - cards[0].offsetLeft;
      if (stride > 0) {
        reelStrideRef.current = stride;
      }
    }

    return reelWindowCenterRef.current > 0;
  };

  const applyStripPosition = (position: number) => {
    if (!stripRef.current) {
      return;
    }

    const cardCenterPx = position * reelStrideRef.current + reelHalfCardRef.current;
    const translatePx = reelWindowCenterRef.current - cardCenterPx;
    stripRef.current.style.transform = `translateX(${translatePx}px)`;
  };

  const applyReelDisplayItem = (item: ReelVisualItem, spinning: boolean) => {
    const rc = rarityClass(item.rarity);
    if (reelNameRef.current) {
      reelNameRef.current.textContent = item.name;
      reelNameRef.current.className = rc;
    }
    if (reelRarityChipRef.current) {
      reelRarityChipRef.current.textContent = item.rarity;
      reelRarityChipRef.current.className = `lootbox-rarity-chip ${rc}`;
    }
    if (markerRef.current) {
      markerRef.current.className = `lootbox-reel-center-marker ${rc}${spinning ? " spinning" : ""}`;
    }
  };

  const primeReelStartFrame = () => {
    const hasGeometry = measureReelGeometry();
    const startItem = reelItemsRef.current[REEL_START_INDEX];
    if (!hasGeometry || !startItem) {
      return false;
    }

    applyStripPosition(REEL_START_INDEX);
    applyReelDisplayItem(startItem, false);
    return true;
  };

  const startReelTicker = (durationMs: number) => {
    clearReelTicker();
    const startPos = REEL_START_INDEX;
    const endPos = REEL_WINNER_INDEX;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.max(0, Math.min(1, elapsed / durationMs));
      const eased = easeOutCubic(progress);
      const pos = startPos + (endPos - startPos) * eased;
      const displayIdx = Math.max(0, Math.min(REEL_STRIP_LENGTH - 1, Math.floor(pos + REEL_TEXT_INDEX_BIAS)));
      const item = reelItemsRef.current[displayIdx];

      applyStripPosition(pos);

      if (item) {
        applyReelDisplayItem(item, true);
      }

      if (progress < 1) {
        reelTickerRef.current = window.requestAnimationFrame(tick);
      } else {
        reelTickerRef.current = null;
      }
    };

    reelTickerRef.current = window.requestAnimationFrame(tick);
  };

  const finalizeReel = () => {
    clearReelFinishTimer();
    clearReelTicker();
    const winner = reelItemsRef.current[REEL_WINNER_INDEX];
    applyStripPosition(REEL_WINNER_INDEX);
    if (winner) {
      applyReelDisplayItem(winner, false);
    }
    setReelSpinning(false);
    setReelRevealed(true);
  };

  useEffect(() => {
    if (!token || !selectedLootboxId || !showDetailsModal) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const detail = await fetchLootboxDetail(token, selectedLootboxId);
        setDetailsById((current) => ({
          ...current,
          [selectedLootboxId]: detail,
        }));
      } catch {
        // Keep last known data to avoid noisy UI on transient failures.
      }
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [selectedLootboxId, showDetailsModal, token]);

  const sortedDropItems = useMemo(() => {
    const baseItems = selectedDetail?.items ?? selectedLootbox?.previewItems ?? [];
    const items = [...baseItems];

    items.sort((a, b) => {
      let compare = 0;

      if (dropSortKey === "name") {
        compare = a.name.localeCompare(b.name);
      } else if (dropSortKey === "marketPrice") {
        compare = (a.marketPrice ?? -1) - (b.marketPrice ?? -1);
      } else {
        const left = RARITY_RANK[a.rarity.toLowerCase()] ?? 0;
        const right = RARITY_RANK[b.rarity.toLowerCase()] ?? 0;
        compare = left - right;
      }

      return dropSortDirection === "asc" ? compare : -compare;
    });

    return items;
  }, [dropSortDirection, dropSortKey, selectedDetail?.items, selectedLootbox?.previewItems]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (showDropPoolModal) {
        setShowDropPoolModal(false);
        return;
      }

      if (showReelModal && !reelSpinning) {
        setShowReelModal(false);
        return;
      }

      if (showDetailsModal) {
        setShowDetailsModal(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [showDetailsModal, showDropPoolModal, showReelModal, reelSpinning]);

  useEffect(() => {
    if (!reelRevealed || !reelResult) {
      return;
    }

    setStatusMessage(
      `You unboxed ${reelResult.item.name} (${reelResult.item.rarity}). ${walletLabel(reelResult.spent.wallet)} left: ${reelResult.spent.balanceAfter ?? "?"}.`,
    );
  }, [reelRevealed, reelResult]);

  useEffect(() => {
    return () => {
      clearReelFinishTimer();
      clearReelTicker();
    };
  }, []);

  useLayoutEffect(() => {
    if (!stripRef.current || reelItemsRef.current.length === 0) {
      return;
    }
    if (primeReelStartFrame()) {
      setReelReady(true);
    }
  }, [reelRunId]);

  useEffect(() => {
    if (!showReelModal || reelReady || reelItemsRef.current.length === 0) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      if (primeReelStartFrame()) {
        setReelReady(true);
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [showReelModal, reelReady, reelRunId]);

  useEffect(() => {
    if (!showReelModal || !reelReady || !reelStartArmedRef.current || reelSpinning || reelRevealed) {
      return;
    }

    reelStartArmedRef.current = false;
    const spinDurationMs = reelSpinDurationRef.current;

    clearReelFinishTimer();
    reelFinishTimerRef.current = window.setTimeout(() => {
      finalizeReel();
    }, spinDurationMs + 60);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setReelSpinning(true);
        startReelTicker(spinDurationMs);
      });
    });
  }, [showReelModal, reelReady, reelSpinning, reelRevealed]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const loadCatalog = async () => {
      setLoading(true);
      setError(null);

      try {
        const catalog = await fetchLootboxCatalog(token);
        setLootboxes(catalog);

        const params = new URLSearchParams(location.search);
        const querySelected = params.get("lootbox");
        const queryOpen = params.get("open");
        const defaultSelectedId = querySelected && catalog.some((entry) => entry.id === querySelected)
          ? querySelected
          : catalog[0]?.id ?? null;

        setSelectedLootboxId(defaultSelectedId);
        setShowDetailsModal(Boolean(defaultSelectedId && queryOpen === "details"));
      } catch {
        setError("Could not load lootboxes right now.");
      } finally {
        setLoading(false);
      }
    };

    void loadCatalog();
  }, [location.search, token]);

  useEffect(() => {
    if (!token || !selectedLootboxId || detailsById[selectedLootboxId]) {
      return;
    }

    const loadDetails = async () => {
      try {
        const detail = await fetchLootboxDetail(token, selectedLootboxId);
        setDetailsById((current) => ({ ...current, [selectedLootboxId]: detail }));
      } catch {
        setStatusMessage("Could not load full drop pool details.");
      }
    };

    void loadDetails();
  }, [detailsById, selectedLootboxId, token]);

  const handleSelectLootbox = (lootbox: LootboxCatalogItem) => {
    setSelectedLootboxId(lootbox.id);
    setShowDetailsModal(true);
  };

  const openDropsForLootbox = (lootboxId: string) => {
    setSelectedLootboxId(lootboxId);
    setDropSortKey("rarity");
    setDropSortDirection("desc");
    setShowDropPoolModal(true);
  };

  const handleDropSort = (key: SortKey) => {
    if (dropSortKey === key) {
      setDropSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setDropSortKey(key);
    setDropSortDirection(key === "name" ? "asc" : "desc");
  };

  const handleToggleFavorite = async (lootboxId: string) => {
    if (!token) {
      return;
    }

    const target = lootboxes.find((lootbox) => lootbox.id === lootboxId);
    if (!target) {
      return;
    }

    const nextValue = !target.isFavorited;
    setFavoriteBusyId(lootboxId);
    setLootboxes((current) =>
      current.map((lootbox) =>
        lootbox.id === lootboxId
          ? { ...lootbox, isFavorited: nextValue }
          : lootbox,
      ),
    );
    setDetailsById((current) => {
      const detail = current[lootboxId];
      if (!detail) {
        return current;
      }
      return {
        ...current,
        [lootboxId]: {
          ...detail,
          isFavorited: nextValue,
        },
      };
    });

    try {
      if (nextValue) {
        await addLootboxFavorite(token, lootboxId);
      } else {
        await removeLootboxFavorite(token, lootboxId);
      }
    } catch {
      setLootboxes((current) =>
        current.map((lootbox) =>
          lootbox.id === lootboxId
            ? { ...lootbox, isFavorited: !nextValue }
            : lootbox,
        ),
      );
      setDetailsById((current) => {
        const detail = current[lootboxId];
        if (!detail) {
          return current;
        }
        return {
          ...current,
          [lootboxId]: {
            ...detail,
            isFavorited: !nextValue,
          },
        };
      });
      setStatusMessage("Could not update favorite right now.");
    } finally {
      setFavoriteBusyId(null);
    }
  };

  const handleOpenLootbox = async () => {
    if (!token || !selectedLootboxId || !selectedLootbox) {
      return;
    }

    setOpenBusy(true);
    setStatusMessage(null);

    try {
      const result = await openLootbox(token, selectedLootboxId, createRequestId());

      const pool: ReelVisualItem[] = result.pool.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image,
        rarity: item.rarity,
        marketPrice: item.marketPrice,
        weight: item.weight,
      }));
      const winner: ReelVisualItem = {
        id: result.item.id,
        name: result.item.name,
        image: result.item.image,
        rarity: result.item.rarity,
        marketPrice: result.item.marketPrice,
        weight: 1,
      };
      const strip = buildReelStrip(pool, winner);
      reelItemsRef.current = strip;
      reelSpinDurationRef.current = getReelSpinDurationMs();
      reelStartArmedRef.current = true;

      setReelItems(strip);
      setReelSpinning(false);
      setReelRevealed(false);
      setReelSkipUsed(false);
      setReelReady(false);
      setReelResult(result);
      setShowReelModal(true);
      setReelRunId((current) => current + 1);

      const detail = await fetchLootboxDetail(token, selectedLootboxId);
      setDetailsById((current) => ({
        ...current,
        [selectedLootboxId]: detail,
      }));
    } catch (openError) {
      setStatusMessage(openError instanceof Error ? openError.message : "Could not open lootbox right now.");
    } finally {
      setOpenBusy(false);
    }
  };

  const handleSkipReel = () => {
    if (!reelSpinning || reelRevealed || reelSkipUsed) {
      return;
    }

    reelStartArmedRef.current = false;
    setReelSkipUsed(true);
    finalizeReel();
  };

  const handleCloseReel = () => {
    if (reelSpinning) {
      return;
    }

    clearReelFinishTimer();
    clearReelTicker();
    reelStartArmedRef.current = false;
    setShowReelModal(false);
  };

  return (
    <section className="lootbox-page">
      <div className="page-title-row">
        <h1>Lootbox Cases</h1>
        <span className="muted">Curated cases with active drop pools</span>
      </div>

      {statusMessage && <p className="lootbox-status muted">{statusMessage}</p>}
      {error && <p className="error">{error}</p>}

      <div className="lootbox-case-grid" role="list" aria-label="Available lootboxes">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="lootbox-case-card lootbox-case-card-skeleton" />
          ))
        ) : (
          lootboxes.map((lootbox) => {
            const isSelected = selectedLootboxId === lootbox.id;
            const isHovered = hoveredLootboxId === lootbox.id;

            return (
              <article
                key={lootbox.id}
                className={`lootbox-case-card${isSelected ? " selected" : ""}${isHovered ? " hovered" : ""}`}
                role="listitem"
                onMouseEnter={() => setHoveredLootboxId(lootbox.id)}
                onMouseLeave={() => setHoveredLootboxId(null)}
              >
                <button
                  type="button"
                  className="lootbox-select-button"
                  onClick={() => handleSelectLootbox(lootbox)}
                  aria-pressed={isSelected}
                >
                  <div className="lootbox-card-image-wrap">
                    {lootbox.image ? (
                      <img src={lootbox.image} alt={lootbox.name} className="lootbox-card-image" />
                    ) : (
                      <div className="lootbox-card-image-fallback">?</div>
                    )}
                  </div>
                  <div className="lootbox-card-content">
                    <div className="compact-row lootbox-card-title-row">
                      <h3>{lootbox.name}</h3>
                      <span className="lootbox-price-tag">
                        <span className="lootbox-price-label">{walletLabel(lootbox.spendCurrency)}</span>
                        <strong>{lootbox.cost}</strong>
                      </span>
                    </div>
                    <div className="lootbox-description-panel">
                      <p className="muted">{lootbox.description ?? "No description yet."}</p>
                    </div>
                  </div>
                </button>
                <div className="lootbox-card-footer">
                  <button
                    type="button"
                    className="lootbox-drops-link"
                    onClick={() => openDropsForLootbox(lootbox.id)}
                  >
                    Drops
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {showDetailsModal && selectedLootbox && (
        <div className="lootbox-modal-backdrop" onClick={() => setShowDetailsModal(false)}>
          <article className="lootbox-modal lootbox-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>{selectedLootbox.name}</h3>
              <div className="compact-row">
                <button
                  type="button"
                  className="lootbox-favorite-button"
                  disabled={favoriteBusyId === selectedLootbox.id}
                  onClick={() => handleToggleFavorite(selectedLootbox.id)}
                  aria-label={selectedLootbox.isFavorited ? "Remove favorite" : "Add favorite"}
                >
                  {selectedLootbox.isFavorited ? "★" : "☆"}
                </button>
                <button type="button" className="button-secondary" onClick={() => setShowDetailsModal(false)}>
                  Close
                </button>
              </div>
            </div>

            {selectedLootbox.image && (
              <img
                src={selectedLootbox.image}
                alt={selectedLootbox.name}
                className="lootbox-detail-image"
              />
            )}

            <div className="lootbox-description-panel lootbox-description-panel-modal">
              <p className="muted">{selectedLootbox.description ?? "No description yet."}</p>
            </div>

            <div className="lootbox-modal-action-row">
              <div className="lootbox-open-cluster">
                <span className="lootbox-price-tag lootbox-price-tag-modal">
                  <span className="lootbox-price-label">{walletLabel(selectedLootbox.spendCurrency)}</span>
                  <strong>{selectedLootbox.cost}</strong>
                </span>
                <button
                  type="button"
                  className="lootbox-open-button"
                  onClick={handleOpenLootbox}
                  disabled={openBusy || reelSpinning}
                >
                  {openBusy ? "Opening..." : "Open Lootbox"}
                </button>
              </div>
            </div>

            <div className="lootbox-stats-grid">
              <article className="lootbox-stat-card">
                <span className="muted">Total Opens</span>
                <strong>{selectedDetail?.stats.totalOpens ?? 0}</strong>
              </article>
              <article className="lootbox-stat-card">
                <span className="muted">Your Opens</span>
                <strong>{selectedDetail?.stats.userOpens ?? 0}</strong>
              </article>
            </div>

            <div className="lootbox-recent-preview">
              <h4>Recent Drops</h4>
              {selectedDetail?.recentDrops.length ? (
                <div className="lootbox-recent-list">
                  {selectedDetail.recentDrops.slice(0, 4).map((drop) => (
                    <div key={drop.rollId} className="lootbox-recent-row">
                      <span
                        className="muted lootbox-recent-user"
                        title={drop.droppedBy}
                      >
                        {drop.droppedBy}
                      </span>
                      <span className="muted lootbox-recent-verb">got</span>
                      <span
                        className={`lootbox-recent-item ${rarityClass(drop.item.rarity)}`}
                        title={drop.item.name}
                      >
                        {drop.item.name}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No recent drops yet.</p>
              )}
            </div>

            <div className="compact-row">
              <button type="button" className="lootbox-drops-link" onClick={() => setShowDropPoolModal(true)}>
                Drops
              </button>
              <span className="muted">{selectedLootbox.totalDropPoolItems} possible drops</span>
            </div>
          </article>
        </div>
      )}

      {showDropPoolModal && selectedLootbox && (
        <div className="lootbox-modal-backdrop" onClick={() => setShowDropPoolModal(false)}>
          <article className="lootbox-modal lootbox-droppool-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>{selectedLootbox.name} Drop Pool</h3>
              <button type="button" className="button-secondary" onClick={() => setShowDropPoolModal(false)}>
                Close
              </button>
            </div>

            <div className="lootbox-drop-table">
              <div className="lootbox-drop-table-head">
                <span>Item</span>
                <button type="button" className="lootbox-sort-button" onClick={() => handleDropSort("name")}>
                  Name {dropSortKey === "name" ? (dropSortDirection === "asc" ? "▲" : "▼") : ""}
                </button>
                <button type="button" className="lootbox-sort-button" onClick={() => handleDropSort("rarity")}>
                  Rarity {dropSortKey === "rarity" ? (dropSortDirection === "asc" ? "▲" : "▼") : ""}
                </button>
                <button
                  type="button"
                  className="lootbox-sort-button"
                  onClick={() => handleDropSort("marketPrice")}
                >
                  Market Price {dropSortKey === "marketPrice" ? (dropSortDirection === "asc" ? "▲" : "▼") : ""}
                </button>
              </div>

              <div className="lootbox-droppool-list">
                {sortedDropItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`lootbox-drop-row ${rarityClass(item.rarity)}`}
                    onClick={() =>
                      navigate(
                        `/market?itemId=${encodeURIComponent(item.id)}&itemName=${encodeURIComponent(item.name)}`,
                      )
                    }
                  >
                    <div className="lootbox-droppool-image-wrap">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="lootbox-droppool-image" />
                      ) : (
                        <div className="lootbox-card-image-fallback">?</div>
                      )}
                    </div>
                    <strong className="lootbox-drop-name">{item.name}</strong>
                    <span className={`lootbox-rarity-chip ${rarityClass(item.rarity)}`}>{item.rarity}</span>
                    <span className="lootbox-market-price">{formatMarketPrice(item.marketPrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          </article>
        </div>
      )}

      {showReelModal && reelResult && (
        <div className="lootbox-modal-backdrop" onClick={handleCloseReel}>
          <article className="lootbox-modal lootbox-reel-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>Opening {reelResult.lootbox.name}</h3>
              <div className="compact-row">
                {reelSpinning ? (
                  <button type="button" className="button-secondary" onClick={handleSkipReel}>
                    {reelSkipUsed ? "Skipping..." : "Skip"}
                  </button>
                ) : (
                  <button type="button" className="button-secondary" onClick={handleCloseReel}>
                    Close
                  </button>
                )}
              </div>
            </div>

            <div ref={reelWindowRef} className="lootbox-reel-window">
              <div
                ref={markerRef}
                className="lootbox-reel-center-marker"
              />
              <div
                ref={stripRef}
                key={reelRunId}
                className="lootbox-reel-strip"
              >
                {reelItems.map((item, index) => (
                  <article
                    key={`${item.id}-${index}`}
                    className={`lootbox-reel-card ${rarityClass(item.rarity)}${index === REEL_WINNER_INDEX ? " winner" : ""}`}
                  >
                    <div className="lootbox-reel-image-wrap">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="lootbox-reel-image" />
                      ) : (
                        <div className="lootbox-card-image-fallback">?</div>
                      )}
                    </div>
                    <strong className="lootbox-reel-name">{item.name}</strong>
                    <span className={`lootbox-rarity-chip ${rarityClass(item.rarity)}`}>{item.rarity}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="lootbox-reel-result">
              {reelRevealed ? (
                <>
                  <span className="muted">You unboxed</span>
                  <strong className={rarityClass(reelResult.item.rarity)}>{reelResult.item.name}</strong>
                  <span className={`lootbox-rarity-chip ${rarityClass(reelResult.item.rarity)}`}>{reelResult.item.rarity}</span>
                  <span className="muted">{formatMarketPrice(reelResult.item.marketPrice)}</span>
                </>
              ) : (
                <>
                  <span className="muted">{reelSpinning ? "Rolling..." : "Ready"}</span>
                  <strong ref={reelNameRef as React.RefObject<HTMLElement>} className="common">...</strong>
                  <span ref={reelRarityChipRef} className="lootbox-rarity-chip common">common</span>
                </>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
};

export default Lootbox;
