import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchMarketListingDetail,
  fetchMarketListings,
  fetchMyMarketListings,
  fetchProfileInventory,
  removeMarketListing,
  type MarketListing,
  type MarketSortBy,
  purchaseMarketListing,
  type ProfileInventoryItem,
} from "../api";
import { useAppContext } from "../context/AppContext";

const PAGE_SIZE_OPTIONS: Array<10 | 15 | 30 | 50> = [10, 15, 30, 50];
const WEAR_OPTIONS = ["Factory New", "Minimal Wear", "Field Tested", "Worn"];

const rarityClass = (rarity: string) => rarity.trim().toLowerCase();

const formatUsd = (value: number) => {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const clampFloatDisplay = (value: number) => value.toFixed(6);

const toggleArrayValue = (values: string[], value: string) => {
  if (values.includes(value)) {
    return values.filter((entry) => entry !== value);
  }

  return [...values, value];
};

const Market = () => {
  const { token } = useAppContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearchFromUrl = searchParams.get("itemName") ?? "";
  const initialItemIdFromUrl = searchParams.get("itemId") ?? "";
  const [loadedFromLootbox] = useState(Boolean(initialSearchFromUrl || initialItemIdFromUrl));

  const [search, setSearch] = useState(initialSearchFromUrl);
  const [requestedItemId] = useState(initialItemIdFromUrl);
  const [sortBy, setSortBy] = useState<MarketSortBy>("new");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState<10 | 15 | 30 | 50>(15);
  const [page, setPage] = useState(1);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [showListingsModal, setShowListingsModal] = useState(false);

  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null);
  const [isFindMenuOpen, setIsFindMenuOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsActionMode, setDetailsActionMode] = useState<"buy" | "remove">("buy");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [lootboxFilter, setLootboxFilter] = useState("");
  const [wearFilters, setWearFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [rarityFilters, setRarityFilters] = useState<string[]>([]);
  const [quantityMin, setQuantityMin] = useState(0);

  const [listings, setListings] = useState<MarketListing[]>([]);
  const [filterOptions, setFilterOptions] = useState<{
    lootboxes: Array<{ id: string; name: string }>;
    types: string[];
    rarities: string[];
  }>({
    lootboxes: [],
    types: [],
    rarities: [],
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 15,
    totalItems: 0,
    totalPages: 1,
  });

  const [mySearch, setMySearch] = useState("");
  const [mySortBy, setMySortBy] = useState<MarketSortBy>("new");
  const [mySortDir, setMySortDir] = useState<"asc" | "desc">("desc");
  const [myPage, setMyPage] = useState(1);
  const [myPageSize, setMyPageSize] = useState<10 | 15 | 30 | 50>(15);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [myListingsLoading, setMyListingsLoading] = useState(false);
  const [myListingsError, setMyListingsError] = useState<string | null>(null);
  const [myListingsPagination, setMyListingsPagination] = useState({
    page: 1,
    pageSize: 15,
    totalItems: 0,
    totalPages: 1,
  });
  const [myAccountSummary, setMyAccountSummary] = useState({
    currency: 0,
    specialCurrency: 0,
    realWorldUsdEstimate: 0,
  });
  const [myRefreshKey, setMyRefreshKey] = useState(0);

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<ProfileInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const toolbarRef = useRef<HTMLElement | null>(null);
  const [toolbarFloating, setToolbarFloating] = useState(false);

  useEffect(() => {
    if (!initialSearchFromUrl && !initialItemIdFromUrl) {
      return;
    }

    setSearchParams({}, { replace: true });
  }, [initialItemIdFromUrl, initialSearchFromUrl, setSearchParams]);

  useEffect(() => {
    const getHeaderHeight = () => {
      const cssValue = getComputedStyle(document.documentElement).getPropertyValue("--app-header-height");
      const parsed = Number.parseFloat(cssValue);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const updateFloatingState = () => {
      const toolbar = toolbarRef.current;
      if (!toolbar) {
        return;
      }

      const stickyTop = getHeaderHeight() + 8;
      const currentTop = toolbar.getBoundingClientRect().top;
      setToolbarFloating(currentTop <= stickyTop + 0.5);
    };

    updateFloatingState();
    window.addEventListener("scroll", updateFloatingState, { passive: true });
    window.addEventListener("resize", updateFloatingState);

    return () => {
      window.removeEventListener("scroll", updateFloatingState);
      window.removeEventListener("resize", updateFloatingState);
    };
  }, []);

  const searchQuery = useMemo(() => {
    const trimmed = search.trim();
    return trimmed.length >= 3 ? trimmed : "";
  }, [search]);

  const mySearchQuery = useMemo(() => {
    const trimmed = mySearch.trim();
    return trimmed.length >= 3 ? trimmed : "";
  }, [mySearch]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchMarketListings(token, {
      page,
      pageSize,
      search: searchQuery,
      sortBy,
      sortDir,
      lootboxId: lootboxFilter || undefined,
      wear: wearFilters,
      type: typeFilters,
      rarity: rarityFilters,
      quantityMin: quantityMin > 0 ? quantityMin : undefined,
      itemId: requestedItemId || undefined,
    })
      .then((data) => {
        if (cancelled) {
          return;
        }

        setListings(data.listings);
        setPagination(data.pagination);
        setFilterOptions({
          lootboxes: data.filters.lootboxes,
          types: data.filters.types,
          rarities: data.filters.rarities,
        });
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : "Failed to load market listings");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    lootboxFilter,
    page,
    pageSize,
    quantityMin,
    rarityFilters,
    refreshKey,
    requestedItemId,
    searchQuery,
    sortBy,
    sortDir,
    token,
    typeFilters,
    wearFilters,
  ]);

  useEffect(() => {
    if (!showListingsModal || !token) {
      return;
    }

    let cancelled = false;
    setMyListingsLoading(true);
    setMyListingsError(null);

    void fetchMyMarketListings(token, {
      page: myPage,
      pageSize: myPageSize,
      search: mySearchQuery,
      sortBy: mySortBy,
      sortDir: mySortDir,
    })
      .then((data) => {
        if (cancelled) {
          return;
        }

        setMyListings(data.listings);
        setMyListingsPagination(data.pagination);
        setMyAccountSummary(data.account);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }

        setMyListingsError(fetchError instanceof Error ? fetchError.message : "Failed to load your listings");
      })
      .finally(() => {
        if (!cancelled) {
          setMyListingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [myPage, myPageSize, myRefreshKey, mySearchQuery, mySortBy, mySortDir, showListingsModal, token]);

  useEffect(() => {
    if (!selectedListingId || !token) {
      setSelectedListing(null);
      return;
    }

    let cancelled = false;
    setDetailsLoading(true);

    void fetchMarketListingDetail(token, selectedListingId)
      .then((data) => {
        if (!cancelled) {
          setSelectedListing(data);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load listing details");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedListingId, token]);

  useEffect(() => {
    if (!showInventoryModal) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowInventoryModal(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [showInventoryModal]);

  const clearAdvancedFilters = () => {
    setLootboxFilter("");
    setWearFilters([]);
    setTypeFilters([]);
    setRarityFilters([]);
    setQuantityMin(0);
    setPage(1);
  };

  const openInventoryModal = async () => {
    if (!token) {
      return;
    }

    setShowInventoryModal(true);
    setInventoryLoading(true);
    setInventoryError(null);

    try {
      const items = await fetchProfileInventory(token);
      setInventoryItems(items);
    } catch {
      setInventoryError("Could not load your inventory right now.");
    } finally {
      setInventoryLoading(false);
    }
  };

  const closeDetailsModal = () => {
    setSelectedListingId(null);
    setSelectedListing(null);
    setIsFindMenuOpen(false);
    setDetailsActionMode("buy");
  };

  const handleOpenLootboxFromDetail = (lootboxId: string) => {
    navigate(`/lootbox?lootbox=${encodeURIComponent(lootboxId)}&open=details`);
    closeDetailsModal();
  };

  const handleBuyListing = async () => {
    if (!selectedListingId || !token) {
      return;
    }

    try {
      setError(null);
      await purchaseMarketListing(token, selectedListingId);
      setActionMessage("Purchase successful. Item added to your inventory.");
      closeDetailsModal();
      setRefreshKey((current) => current + 1);
      setMyRefreshKey((current) => current + 1);
    } catch (purchaseError) {
      setError(purchaseError instanceof Error ? purchaseError.message : "Failed to purchase listing");
    }
  };

  const handleRemoveListing = async () => {
    if (!selectedListingId || !token) {
      return;
    }

    try {
      setError(null);
      await removeMarketListing(token, selectedListingId);
      setActionMessage("Listing removed and item returned to your inventory.");
      closeDetailsModal();
      setRefreshKey((current) => current + 1);
      setMyRefreshKey((current) => current + 1);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Failed to remove listing");
    }
  };

  const visibleCountLabel = loading ? "Loading..." : `${pagination.totalItems} active listings`;

  return (
    <section className="market-page">
      <div className="page-title-row">
        <h1>Market</h1>
        <span className="muted">{visibleCountLabel}</span>
      </div>
      {loadedFromLootbox && <p className="muted">Filtered from Lootbox drop pool selection.</p>}
      {actionMessage && <p className="muted">{actionMessage}</p>}
      {error && <p className="error">{error}</p>}

      <article ref={toolbarRef} className={`card market-toolbar${toolbarFloating ? " is-floating" : ""}`}>
        <div className="market-toolbar-left">
          <button
            type="button"
            className="market-listings-button"
            onClick={() => {
              setShowListingsModal(true);
              setMyListingsError(null);
            }}
          >
            Listings
          </button>

          <div className="market-search-wrap">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search"
            />
          </div>
        </div>

        <div className="market-sort-wrap">
          <label className="market-inline-label">
            <span>Sort by</span>
            <select
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as MarketSortBy);
                setPage(1);
              }}
            >
              <option value="new">New</option>
              <option value="price">Price</option>
              <option value="wear">Wear</option>
              <option value="float">Float</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setSortDir((current) => (current === "asc" ? "desc" : "asc"));
              setPage(1);
            }}
          >
            {sortDir === "asc" ? "Ascending" : "Descending"}
          </button>
        </div>

        <div className="market-toolbar-right">
          <label className="market-inline-label">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as 10 | 15 | 30 | 50);
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setShowFiltersModal(true)}>
            Filters
          </button>
        </div>
      </article>

      <div className="market-list-grid">
        {loading ? (
          <p className="muted">Loading listings...</p>
        ) : listings.length === 0 ? (
          <p className="muted">No listings match your current filters.</p>
        ) : (
          listings.map((listing) => (
            <button
              type="button"
              key={listing.id}
              className={`market-listing-card card ${rarityClass(listing.item.rarity)}`}
              onClick={() => {
                setSelectedListingId(listing.id);
                setDetailsActionMode("buy");
                setActionMessage(null);
              }}
            >
              <div className="market-listing-image-wrap">
                {listing.item.image ? (
                  <img src={listing.item.image} alt={listing.item.name} className="market-listing-image" />
                ) : (
                  <div className="market-listing-image-fallback">?</div>
                )}
              </div>
              <div className="market-listing-main">
                <div className="market-item-title-row">
                  <h3 className={`market-item-name ${rarityClass(listing.item.rarity)}`}>{listing.item.name}</h3>
                  <span className={`lootbox-rarity-chip ${rarityClass(listing.item.rarity)}`}>{listing.item.rarity}</span>
                </div>
                <div className="market-item-meta-grid">
                  <p className="market-item-meta muted market-info-line market-info-line-alt">
                    <span className="market-meta-label">Wear</span>
                    <span>{listing.item.wear}</span>
                  </p>
                  <p className="market-item-meta muted market-info-line">
                    <span className="market-meta-label">Float</span>
                    <span>{clampFloatDisplay(listing.item.float)}</span>
                  </p>
                </div>
                <div className="market-listing-bottom-row market-info-line market-info-line-alt">
                  <p className="market-item-price">{formatUsd(listing.listedPriceUsd)}</p>
                  <div className="market-seller-chip" title={`Seller: ${listing.seller.username}`}>
                    <span className="market-seller-icon" aria-hidden="true">
                      👤
                    </span>
                    <span className="market-seller-name">Seller: {listing.seller.username}</span>
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="market-pagination-row">
        <button type="button" disabled={pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Prev
        </button>
        <span className="muted">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          type="button"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
        >
          Next
        </button>
      </div>

      {showFiltersModal && (
        <div className="lootbox-modal-backdrop" onClick={() => setShowFiltersModal(false)}>
          <article className="lootbox-modal market-filters-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h2>Advanced Filters</h2>
              <button type="button" onClick={() => setShowFiltersModal(false)}>
                Close
              </button>
            </div>

            <div className="market-filter-grid">
              <label>
                Lootbox
                <select
                  value={lootboxFilter}
                  onChange={(event) => {
                    setLootboxFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All Active Lootboxes</option>
                  {filterOptions.lootboxes.map((lootbox) => (
                    <option key={lootbox.id} value={lootbox.id}>
                      {lootbox.name}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <p>Wear</p>
                <div className="market-check-grid">
                  {WEAR_OPTIONS.map((wear) => (
                    <label key={wear}>
                      <input
                        type="checkbox"
                        checked={wearFilters.includes(wear)}
                        onChange={() => {
                          setWearFilters((current) => toggleArrayValue(current, wear));
                          setPage(1);
                        }}
                      />
                      {wear}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p>Type</p>
                <div className="market-check-grid">
                  {filterOptions.types.map((type) => (
                    <label key={type}>
                      <input
                        type="checkbox"
                        checked={typeFilters.includes(type)}
                        onChange={() => {
                          setTypeFilters((current) => toggleArrayValue(current, type));
                          setPage(1);
                        }}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p>Rarity</p>
                <div className="market-check-grid">
                  {filterOptions.rarities.map((rarity) => (
                    <label key={rarity}>
                      <input
                        type="checkbox"
                        checked={rarityFilters.includes(rarity)}
                        onChange={() => {
                          setRarityFilters((current) => toggleArrayValue(current, rarity));
                          setPage(1);
                        }}
                      />
                      <span className={rarityClass(rarity)}>{rarity}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label>
                Quantity
                <select
                  value={quantityMin}
                  onChange={(event) => {
                    setQuantityMin(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  <option value={0}>Any</option>
                  <option value={2}>2+</option>
                  <option value={5}>5+</option>
                  <option value={10}>10+</option>
                </select>
              </label>
            </div>

            <div className="compact-row">
              <button type="button" onClick={clearAdvancedFilters}>
                Clear Filters
              </button>
              <button type="button" onClick={() => setShowFiltersModal(false)}>
                Done
              </button>
            </div>
          </article>
        </div>
      )}

      {showListingsModal && (
        <div className="lootbox-modal-backdrop" onClick={() => setShowListingsModal(false)}>
          <article className="lootbox-modal market-listings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <button type="button" className="profile-inventory-launch" onClick={openInventoryModal}>
                Inventory
              </button>
              <div className="market-account-summary muted">
                <span>USD Est: {formatUsd(myAccountSummary.realWorldUsdEstimate)}</span>
                <span>Credits: {myAccountSummary.currency}</span>
                <span>Special: {myAccountSummary.specialCurrency}</span>
              </div>
            </div>

            <article className="card market-listings-toolbar">
              <div className="market-search-wrap">
                <input
                  value={mySearch}
                  onChange={(event) => {
                    setMySearch(event.target.value);
                    setMyPage(1);
                  }}
                  placeholder="Search your listings"
                />
              </div>
              <div className="market-sort-wrap">
                <label className="market-inline-label">
                  <span>Sort by</span>
                  <select
                    value={mySortBy}
                    onChange={(event) => {
                      setMySortBy(event.target.value as MarketSortBy);
                      setMyPage(1);
                    }}
                  >
                    <option value="new">New</option>
                    <option value="price">Price</option>
                    <option value="wear">Wear</option>
                    <option value="float">Float</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMySortDir((current) => (current === "asc" ? "desc" : "asc"));
                    setMyPage(1);
                  }}
                >
                  {mySortDir === "asc" ? "Ascending" : "Descending"}
                </button>
              </div>
              <div className="market-toolbar-right">
                <label className="market-inline-label">
                  <span>Show</span>
                  <select
                    value={myPageSize}
                    onChange={(event) => {
                      setMyPageSize(Number(event.target.value) as 10 | 15 | 30 | 50);
                      setMyPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => setShowListingsModal(false)}>
                  Close
                </button>
              </div>
            </article>

            {myListingsError && <p className="error">{myListingsError}</p>}
            <div className="market-listings-scroll">
              {myListingsLoading ? (
                <p className="muted">Loading your listings...</p>
              ) : myListings.length === 0 ? (
                <p className="muted">You have no items currently listed on the market.</p>
              ) : (
                <div className="market-list-grid market-list-grid-single">
                  {myListings.map((listing) => (
                    <button
                      type="button"
                      key={listing.id}
                      className={`market-listing-card card ${rarityClass(listing.item.rarity)}`}
                      onClick={() => {
                        setSelectedListingId(listing.id);
                        setDetailsActionMode("remove");
                        setActionMessage(null);
                      }}
                    >
                      <div className="market-listing-image-wrap">
                        {listing.item.image ? (
                          <img src={listing.item.image} alt={listing.item.name} className="market-listing-image" />
                        ) : (
                          <div className="market-listing-image-fallback">?</div>
                        )}
                      </div>
                      <div className="market-listing-main">
                        <div className="market-item-title-row">
                          <h3 className={`market-item-name ${rarityClass(listing.item.rarity)}`}>{listing.item.name}</h3>
                          <span className={`lootbox-rarity-chip ${rarityClass(listing.item.rarity)}`}>{listing.item.rarity}</span>
                        </div>
                        <div className="market-item-meta-grid">
                          <p className="market-item-meta muted market-info-line market-info-line-alt">
                            <span className="market-meta-label">Wear</span>
                            <span>{listing.item.wear}</span>
                          </p>
                          <p className="market-item-meta muted market-info-line">
                            <span className="market-meta-label">Float</span>
                            <span>{clampFloatDisplay(listing.item.float)}</span>
                          </p>
                        </div>
                        <div className="market-listing-bottom-row market-info-line market-info-line-alt">
                          <p className="market-item-price">{formatUsd(listing.listedPriceUsd)}</p>
                          <div className="market-seller-chip" title={`Seller: ${listing.seller.username}`}>
                            <span className="market-seller-icon" aria-hidden="true">
                              👤
                            </span>
                            <span className="market-seller-name">Seller: {listing.seller.username}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="market-pagination-row">
              <button type="button" disabled={myListingsPagination.page <= 1} onClick={() => setMyPage((current) => Math.max(1, current - 1))}>
                Prev
              </button>
              <span className="muted">
                Page {myListingsPagination.page} of {myListingsPagination.totalPages}
              </span>
              <button
                type="button"
                disabled={myListingsPagination.page >= myListingsPagination.totalPages}
                onClick={() => setMyPage((current) => Math.min(myListingsPagination.totalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </article>
        </div>
      )}

      {selectedListingId && (
        <div className="lootbox-modal-backdrop" onClick={closeDetailsModal}>
          <article className="lootbox-modal market-detail-modal" onClick={(event) => event.stopPropagation()}>
            {detailsLoading || !selectedListing ? (
              <p className="muted">Loading listing details...</p>
            ) : (
              <div className="market-detail-layout">
                <div className="market-detail-hero">
                  <div className="market-detail-image-panel">
                    {selectedListing.item.image ? (
                      <img src={selectedListing.item.image} alt={selectedListing.item.name} className="market-detail-image" />
                    ) : (
                      <div className="market-detail-image market-listing-image-fallback">?</div>
                    )}
                    <p className="market-detail-image-price">{formatUsd(selectedListing.listedPriceUsd)}</p>
                  </div>
                  <h2 className={`market-detail-title ${rarityClass(selectedListing.item.rarity)}`}>{selectedListing.item.name}</h2>
                </div>

                <div className="market-detail-copy">
                  <p className="market-detail-description muted">
                    A premium market listing with authenticated ownership transfer. Inspect the condition details below before finalizing your transaction.
                  </p>

                  <div className="market-detail-stats">
                    <p className="market-item-meta muted market-info-line market-info-line-alt">
                      <span className="market-meta-label">Wear</span>
                      <span>{selectedListing.item.wear}</span>
                    </p>
                    <p className="market-item-meta muted market-info-line">
                      <span className="market-meta-label">Float</span>
                      <span>{clampFloatDisplay(selectedListing.item.float)}</span>
                    </p>
                    <p className="market-item-meta muted market-info-line market-info-line-alt">
                      <span className="market-meta-label">Rarity</span>
                      <span className={rarityClass(selectedListing.item.rarity)}>{selectedListing.item.rarity}</span>
                    </p>
                    <p className="market-item-meta muted market-info-line">
                      <span className="market-meta-label">Type</span>
                      <span>{selectedListing.item.type ?? "Unknown"}</span>
                    </p>
                    <p className="market-item-meta muted market-info-line market-info-line-alt">
                      <span className="market-meta-label">Seller</span>
                      <span>{selectedListing.seller.username}</span>
                    </p>
                  </div>
                </div>

                <div className="market-detail-actions">
                  {selectedListing.activeLootboxes.length > 0 ? (
                    <div className={`market-find-wrap${isFindMenuOpen ? " is-open" : ""}`}>
                      <button
                        type="button"
                        className="market-find-trigger market-find-trigger-button"
                        onClick={() => setIsFindMenuOpen((current) => !current)}
                      >
                        Find in lootboxes
                      </button>
                      <ul className="market-find-menu">
                        {selectedListing.activeLootboxes.map((lootbox) => (
                          <li key={lootbox.id}>
                            <button
                              type="button"
                              className="market-find-link"
                              onClick={() => {
                                setIsFindMenuOpen(false);
                                handleOpenLootboxFromDetail(lootbox.id);
                              }}
                            >
                              {lootbox.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <span />
                  )}

                  {detailsActionMode === "buy" ? (
                    <button type="button" className="market-buy-button market-buy-button-large" onClick={handleBuyListing}>
                      Purchase
                    </button>
                  ) : (
                    <button type="button" className="market-buy-button market-buy-button-large" onClick={handleRemoveListing}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      {showInventoryModal && (
        <div className="profile-inventory-backdrop" onClick={() => setShowInventoryModal(false)}>
          <article className="profile-inventory-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>Your Inventory</h3>
              <button type="button" className="button-secondary" onClick={() => setShowInventoryModal(false)}>
                Close
              </button>
            </div>

            {inventoryError && <p className="error-text">{inventoryError}</p>}
            {inventoryLoading ? (
              <p className="muted">Loading inventory...</p>
            ) : inventoryItems.length === 0 ? (
              <p className="muted">No items in your inventory yet.</p>
            ) : (
              <div className="profile-inventory-grid">
                {inventoryItems.map((entry) => (
                  <article key={entry.id} className="profile-inventory-card">
                    <div className="profile-inventory-image-wrap">
                      {entry.item.image ? (
                        <img src={entry.item.image} alt={entry.item.name} className="profile-inventory-image" />
                      ) : (
                        <div className="lootbox-card-image-fallback">?</div>
                      )}
                    </div>
                    <strong title={entry.item.name}>{entry.item.name}</strong>
                    <div className="profile-inventory-meta muted">
                      <span>{entry.item.rarity}</span>
                      <span>${entry.item.marketPrice.toFixed(2)}</span>
                    </div>
                    <div className="profile-inventory-meta muted">
                      <span>Qty {entry.quantity}</span>
                      <span>Avail {entry.availableQuantity}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
};

export default Market;
