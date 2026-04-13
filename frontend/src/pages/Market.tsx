import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createMarketListing,
  fetchMarketCatalogItems,
  fetchMarketCatalogTypes,
  fetchMarketCatalogWeapons,
  fetchMarketListingDetail,
  fetchMarketListings,
  fetchMyMarketListings,
  fetchProfileInventory,
  removeMarketListing,
  type MarketCatalogItem,
  type MarketCatalogTypeCard,
  type MarketCatalogWeaponCard,
  type MarketListing,
  type MarketSortBy,
  purchaseMarketListing,
  type ProfileInventoryItem,
} from "../api";
import { resolveAvatarUrl } from "../avatar";
import { useAppContext } from "../context/AppContext";
import { useNotifications } from "../context/NotificationContext";

const PAGE_SIZE_OPTIONS: Array<10 | 15 | 30 | 50> = [10, 15, 30, 50];
const WEAR_OPTIONS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

type UnitWear = "Factory New" | "Minimal Wear" | "Field-Tested" | "Well-Worn" | "Battle-Scarred";

type InventoryUnit = {
  unitId: string;
  index: number;
  source: ProfileInventoryItem;
  floatValue: number;
  wear: UnitWear;
  holdType: "available" | "trade" | "market";
};

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

const formatGrouped = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const clampFloatDisplay = (value: number) => value.toFixed(6);


const seededUnitValue = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
};

const deriveUnitWear = (floatValue: number): UnitWear => {
  if (floatValue <= 0.07) {
    return "Factory New";
  }
  if (floatValue <= 0.15) {
    return "Minimal Wear";
  }
  if (floatValue <= 0.38) {
    return "Field-Tested";
  }
  if (floatValue <= 0.45) {
    return "Well-Worn";
  }

  return "Battle-Scarred";
};

const deriveInventoryUnit = (entry: ProfileInventoryItem, index: number): InventoryUnit => {
  const seed = `${entry.id}:${entry.item.id}:${index}`;
  const floatValue = Number(seededUnitValue(seed).toFixed(6));
  const tradeBoundary = entry.reservedForTrade;
  const marketBoundary = entry.reservedForTrade + entry.reservedForMarket;
  const holdType = index < tradeBoundary ? "trade" : index < marketBoundary ? "market" : "available";

  return {
    unitId: `${entry.id}:${index}`,
    index,
    source: entry,
    floatValue,
    wear: deriveUnitWear(floatValue),
    holdType,
  };
};

const toggleArrayValue = (values: string[], value: string) => {
  if (values.includes(value)) {
    return values.filter((entry) => entry !== value);
  }

  return [...values, value];
};

const Market = () => {
  const { token, user, refreshUser } = useAppContext();
  const { notifyError, notifySuccess } = useNotifications();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearchFromUrl = searchParams.get("itemName") ?? "";
  const initialItemIdFromUrl = searchParams.get("itemId") ?? "";
  const [loadedFromLootbox] = useState(Boolean(initialSearchFromUrl || initialItemIdFromUrl));

  const [search, setSearch] = useState(initialSearchFromUrl);
  const [catalogSearch, setCatalogSearch] = useState(initialSearchFromUrl);
  const [selectedCatalogType, setSelectedCatalogType] = useState("");
  const [selectedCatalogWeaponName, setSelectedCatalogWeaponName] = useState("");
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(initialItemIdFromUrl);
  const [selectedCatalogItemName, setSelectedCatalogItemName] = useState(initialSearchFromUrl);
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
  const [catalogTypeCards, setCatalogTypeCards] = useState<MarketCatalogTypeCard[]>([]);
  const [catalogWeaponCards, setCatalogWeaponCards] = useState<MarketCatalogWeaponCard[]>([]);
  const [catalogItems, setCatalogItems] = useState<MarketCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
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
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellTargetItem, setSellTargetItem] = useState<InventoryUnit | null>(null);
  const [sellPriceInput, setSellPriceInput] = useState("");
  const [sellSubmitting, setSellSubmitting] = useState(false);
  const [sellFeedback, setSellFeedback] = useState<string | null>(null);

  const inventoryUnits = useMemo(
    () => inventoryItems.flatMap((entry) => Array.from({ length: Math.max(0, entry.availableQuantity) }, (_, index) => deriveInventoryUnit(entry, index))),
    [inventoryItems],
  );
  const hiddenEscrowCount = useMemo(
    () => inventoryItems.reduce((sum, entry) => sum + Math.max(0, entry.quantity - entry.availableQuantity), 0),
    [inventoryItems],
  );
  const hasBypassFilters = Boolean(
    lootboxFilter
    || wearFilters.length > 0
    || typeFilters.length > 0
    || rarityFilters.length > 0
    || quantityMin > 0,
  );
  const isListingsMode = selectedCatalogItemId.length > 0 || hasBypassFilters;
  const isCatalogItemsStage = !isListingsMode && selectedCatalogType.length > 0 && selectedCatalogWeaponName.length > 0;
  const isCatalogWeaponsStage = !isListingsMode && selectedCatalogType.length > 0 && selectedCatalogWeaponName.length === 0;
  const isCatalogTypesStage = !isListingsMode && selectedCatalogType.length === 0;

  const filteredCatalogItems = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    const filtered = query
      ? catalogItems.filter((item) => {
        const classification = item.classification ?? "";
        return (
          item.name.toLowerCase().includes(query)
          || item.rarity.toLowerCase().includes(query)
          || classification.toLowerCase().includes(query)
        );
      })
      : catalogItems;

    return [...filtered].sort((left, right) => {
      const countDiff = right.activeListingCount - left.activeListingCount;
      if (countDiff !== 0) {
        return countDiff;
      }

      return left.name.localeCompare(right.name);
    });
  }, [catalogItems, catalogSearch]);

  const filteredCatalogTypeCards = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      return catalogTypeCards;
    }

    return catalogTypeCards.filter((card) => card.type.toLowerCase().includes(query));
  }, [catalogSearch, catalogTypeCards]);

  const filteredCatalogWeaponCards = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      return catalogWeaponCards;
    }

    return catalogWeaponCards.filter((card) => card.weaponName.toLowerCase().includes(query));
  }, [catalogSearch, catalogWeaponCards]);

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
    if (actionMessage) {
      notifySuccess(actionMessage, "Market");
    }
  }, [actionMessage, notifySuccess]);

  useEffect(() => {
    if (error) {
      notifyError(error, "Market");
    }
  }, [error, notifyError]);

  useEffect(() => {
    if (catalogError) {
      notifyError(catalogError, "Market");
    }
  }, [catalogError, notifyError]);

  useEffect(() => {
    if (myListingsError) {
      notifyError(myListingsError, "Market");
    }
  }, [myListingsError, notifyError]);

  useEffect(() => {
    if (inventoryError) {
      notifyError(inventoryError, "Inventory");
    }
  }, [inventoryError, notifyError]);

  useEffect(() => {
    if (sellFeedback) {
      notifyError(sellFeedback, "Market");
    }
  }, [notifyError, sellFeedback]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);

    void fetchMarketCatalogTypes(token)
      .then((types) => {
        if (cancelled) {
          return;
        }

        setCatalogTypeCards(types);
        setFilterOptions((current) => ({
          ...current,
          types: [...new Set(types.map((entry) => entry.type))].sort((a, b) => a.localeCompare(b)),
        }));
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }

        setCatalogError(fetchError instanceof Error ? fetchError.message : "Failed to load market catalog types");
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, token]);

  useEffect(() => {
    if (!token || !selectedCatalogType) {
      if (!selectedCatalogType) {
        setCatalogWeaponCards([]);
        setCatalogItems([]);
      }
      return;
    }

    if (selectedCatalogWeaponName) {
      return;
    }

    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);

    void fetchMarketCatalogWeapons(token, selectedCatalogType)
      .then((weapons) => {
        if (cancelled) {
          return;
        }

        setCatalogWeaponCards(weapons);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }

        setCatalogError(fetchError instanceof Error ? fetchError.message : "Failed to load market weapon catalog");
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCatalogType, selectedCatalogWeaponName, token]);

  useEffect(() => {
    if (!token || !selectedCatalogType || !selectedCatalogWeaponName) {
      if (!selectedCatalogWeaponName) {
        setCatalogItems([]);
      }
      return;
    }

    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);

    void fetchMarketCatalogItems(token, selectedCatalogType, selectedCatalogWeaponName)
      .then((items) => {
        if (cancelled) {
          return;
        }

        setCatalogItems(items);
        setFilterOptions((current) => ({
          ...current,
          rarities: [...new Set(items.map((item) => item.rarity))].sort((a, b) => a.localeCompare(b)),
        }));
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }

        setCatalogError(fetchError instanceof Error ? fetchError.message : "Failed to load market catalog items");
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCatalogType, selectedCatalogWeaponName, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    if (!isListingsMode) {
      setListings([]);
      setPagination((current) => ({
        ...current,
        page: 1,
        totalItems: 0,
        totalPages: 1,
      }));
      setLoading(false);
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
      itemId: selectedCatalogItemId || undefined,
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
    isListingsMode,
    searchQuery,
    selectedCatalogItemId,
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
        if (showSellModal) {
          setShowSellModal(false);
          return;
        }

        setShowInventoryModal(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [showInventoryModal, showSellModal]);

  const clearAdvancedFilters = () => {
    setLootboxFilter("");
    setWearFilters([]);
    setTypeFilters([]);
    setRarityFilters([]);
    setQuantityMin(0);
    setPage(1);
  };

  const resetToCatalog = () => {
    setSelectedCatalogItemId("");
    setSelectedCatalogItemName("");
    setSelectedCatalogType("");
    setSelectedCatalogWeaponName("");
    setCatalogSearch("");
    setSearch("");
    clearAdvancedFilters();
    setError(null);
  };

  const handleBack = () => {
    if (selectedCatalogItemId) {
      setSelectedCatalogItemId("");
      setSelectedCatalogItemName("");
      setSearch("");
      setPage(1);
      setError(null);
      return;
    }

    if (selectedCatalogType) {
      if (selectedCatalogWeaponName) {
        setSelectedCatalogWeaponName("");
        setSelectedCatalogItemId("");
        setSelectedCatalogItemName("");
        setCatalogSearch("");
        setPage(1);
        setError(null);
        return;
      }

      setSelectedCatalogType("");
      setCatalogSearch("");
      setPage(1);
      setError(null);
      return;
    }

    resetToCatalog();
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

  const handleSellModalOpen = (unit: InventoryUnit) => {
    setSellTargetItem(unit);
    setSellPriceInput(unit.source.item.marketPrice.toFixed(2));
    setSellFeedback(null);
    setShowSellModal(true);
  };

  const handleCreateListing = async () => {
    if (!token || !sellTargetItem) {
      return;
    }

    const price = Number.parseFloat(sellPriceInput);

    if (sellTargetItem.holdType !== "available") {
      setSellFeedback("This unit is currently on hold and cannot be listed.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setSellFeedback("Price must be greater than 0.");
      return;
    }

    setSellSubmitting(true);
    setSellFeedback(null);

    try {
      await createMarketListing(token, {
        itemId: sellTargetItem.source.item.id,
        quantity: 1,
        listedPriceUsd: Number(price.toFixed(2)),
      });

      const refreshedInventory = await fetchProfileInventory(token);
      setInventoryItems(refreshedInventory);
      setShowSellModal(false);
      setSellTargetItem(null);
      setSellFeedback(null);
      setInventoryError(null);
      setActionMessage("Listing created from inventory.");
      setRefreshKey((current) => current + 1);
      setMyRefreshKey((current) => current + 1);
    } catch (createError) {
      setSellFeedback(createError instanceof Error ? createError.message : "Failed to create market listing.");
    } finally {
      setSellSubmitting(false);
    }
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
      void refreshUser();
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

  const visibleCountLabel = isCatalogTypesStage
    ? catalogLoading
      ? "Loading categories..."
      : `${filteredCatalogTypeCards.length} categories`
    : isCatalogWeaponsStage
      ? catalogLoading
        ? "Loading weapons..."
        : `${filteredCatalogWeaponCards.length} weapon families`
      : isCatalogItemsStage
      ? catalogLoading
        ? "Loading catalog..."
        : `${filteredCatalogItems.length} item definitions`
      : loading
        ? "Loading..."
        : `${pagination.totalItems} active listings`;
  const listingContextLabel = selectedCatalogItemName
    ? `Showing listings for ${selectedCatalogItemName}.`
    : typeFilters.length === 1
      ? `Showing listings for ${typeFilters[0]}.`
      : "Showing listings for your current filters.";

  const atCatalogBreadcrumb = isCatalogTypesStage;
  const atTypeBreadcrumb = isCatalogWeaponsStage;
  const atWeaponBreadcrumb = isCatalogItemsStage;
  const atSkinBreadcrumb = isListingsMode && selectedCatalogItemId.length > 0;
  const atListingsBreadcrumb = isListingsMode && selectedCatalogItemId.length === 0;

  return (
    <section className="market-page ui-section">
      <div className="page-title-row">
        <h1>Market</h1>
        <span className="muted">{visibleCountLabel}</span>
      </div>
      <div className="wallet-chip-row">
        <span className="wallet-chip">
          <span className="wallet-chip-label">Currency</span>
          <strong>{formatUsd(user?.currency ?? 0)}</strong>
        </span>
        <span className="wallet-chip">
          <span className="wallet-chip-label">Shards</span>
          <strong>{formatGrouped(user?.specialCurrency ?? 0)}</strong>
        </span>
      </div>

      <nav className="market-breadcrumbs" aria-label="Market navigation breadcrumbs">
        <button
          type="button"
          className={`market-breadcrumb${atCatalogBreadcrumb ? " is-active" : ""}`}
          onClick={resetToCatalog}
        >
          Catalog
        </button>

        {selectedCatalogType && (
          <>
            <span className="market-breadcrumb-separator">/</span>
            <button
              type="button"
              className={`market-breadcrumb${atTypeBreadcrumb ? " is-active" : ""}`}
              onClick={() => {
                setSelectedCatalogWeaponName("");
                setSelectedCatalogItemId("");
                setSelectedCatalogItemName("");
                setCatalogSearch("");
                setSearch("");
                setPage(1);
                setError(null);
              }}
            >
              {selectedCatalogType}
            </button>
          </>
        )}

        {selectedCatalogWeaponName && (
          <>
            <span className="market-breadcrumb-separator">/</span>
            <button
              type="button"
              className={`market-breadcrumb${atWeaponBreadcrumb ? " is-active" : ""}`}
              onClick={() => {
                setSelectedCatalogItemId("");
                setSelectedCatalogItemName("");
                setCatalogSearch("");
                setSearch("");
                setPage(1);
                setError(null);
              }}
            >
              {selectedCatalogWeaponName}
            </button>
          </>
        )}

        {selectedCatalogItemName && (
          <>
            <span className="market-breadcrumb-separator">/</span>
            <button
              type="button"
              className={`market-breadcrumb${atSkinBreadcrumb ? " is-active" : ""}`}
              onClick={() => {
                setSelectedCatalogItemId("");
                setSearch("");
                setPage(1);
                setError(null);
              }}
            >
              {selectedCatalogItemName}
            </button>
          </>
        )}

        {isListingsMode && (
          <>
            <span className="market-breadcrumb-separator">/</span>
            <span className={`market-breadcrumb market-breadcrumb-text${atListingsBreadcrumb ? " is-active" : ""}`}>
              Listings
            </span>
          </>
        )}
      </nav>

      {loadedFromLootbox && isListingsMode && <p className="muted">Filtered from Lootbox drop pool selection.</p>}
      {isCatalogItemsStage && <p className="muted">Category: {selectedCatalogType}</p>}
      {isCatalogWeaponsStage && <p className="muted">Category: {selectedCatalogType}</p>}
      {isCatalogItemsStage && <p className="muted">Weapon: {selectedCatalogWeaponName}</p>}
      {isListingsMode && <p className="muted">{listingContextLabel}</p>}

      <article
        ref={toolbarRef}
        className={`card market-toolbar${toolbarFloating ? " is-floating" : ""}${!isListingsMode ? " is-catalog" : ""}`}
      >
        <div className="market-toolbar-left">
          {!isCatalogTypesStage && (
            <button
              type="button"
              className="market-listings-button market-back-button"
              onClick={handleBack}
            >
              Back
            </button>
          )}
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
          <button type="button" className="market-listings-button" onClick={openInventoryModal}>
            Inventory
          </button>

          <div className="market-search-wrap">
            <input
              value={isListingsMode ? search : catalogSearch}
              onChange={(event) => {
                if (isListingsMode) {
                  setSearch(event.target.value);
                  setPage(1);
                } else {
                  setCatalogSearch(event.target.value);
                }
              }}
              placeholder={isCatalogTypesStage ? "Search categories" : isCatalogWeaponsStage ? "Search weapons" : isCatalogItemsStage ? "Search skins" : "Search listings"}
            />
          </div>
        </div>

        {isListingsMode ? (
          <>
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
          </>
        ) : (
          <>
            <div className="market-sort-wrap" />
            <div className="market-toolbar-right">
              <button type="button" onClick={() => setShowFiltersModal(true)}>
                Filters
              </button>
            </div>
          </>
        )}
      </article>

      {isCatalogTypesStage ? (
        <>
          <div className="market-catalog-grid market-catalog-grid-types">
            {catalogLoading ? (
              <p className="muted">Loading categories...</p>
            ) : filteredCatalogTypeCards.length === 0 ? (
              <p className="muted">No categories match this search.</p>
            ) : (
              filteredCatalogTypeCards.map((card) => (
                <button
                  type="button"
                  key={card.type}
                  className="market-catalog-card card market-type-card"
                  onClick={() => {
                    setSelectedCatalogType(card.type);
                    setSelectedCatalogItemId("");
                    setSelectedCatalogItemName("");
                    setCatalogSearch("");
                    setSearch("");
                    setPage(1);
                    setError(null);
                  }}
                >
                  <div className="market-catalog-image-wrap">
                    {card.image ? (
                      <img src={card.image} alt={card.type} className="market-listing-image" />
                    ) : (
                      <div className="market-listing-image-fallback">?</div>
                    )}
                  </div>
                  <div className="market-catalog-main">
                    <h3 className="market-item-name">{card.type}</h3>
                    <div className="market-catalog-bottom-row">
                      <span className="muted">{card.itemCount} weapons</span>
                      <span className="muted">{card.listingCount} listings</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : isCatalogWeaponsStage ? (
        <div className="market-catalog-grid market-catalog-grid-types">
          {catalogLoading ? (
            <p className="muted">Loading weapons...</p>
          ) : filteredCatalogWeaponCards.length === 0 ? (
            <p className="muted">No weapons match this search.</p>
          ) : (
            filteredCatalogWeaponCards.map((card) => (
              <button
                type="button"
                key={card.weaponName}
                className="market-catalog-card card market-type-card"
                onClick={() => {
                  setSelectedCatalogWeaponName(card.weaponName);
                  setCatalogSearch("");
                  setSearch("");
                  setPage(1);
                  setError(null);
                }}
              >
                <div className="market-catalog-image-wrap">
                  {card.image ? (
                    <img src={card.image} alt={card.weaponName} className="market-listing-image" />
                  ) : (
                    <div className="market-listing-image-fallback">?</div>
                  )}
                </div>
                <div className="market-catalog-main">
                  <h3 className="market-item-name">{card.weaponName}</h3>
                  <div className="market-catalog-bottom-row">
                    <span className="muted">{card.itemCount} skins</span>
                    <span className="muted">{card.listingCount} listings</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : isCatalogItemsStage ? (
        <div className="market-catalog-grid">
          {catalogLoading ? (
            <p className="muted">Loading catalog...</p>
          ) : filteredCatalogItems.length === 0 ? (
            <p className="muted">No item definitions match this category search.</p>
          ) : (
            filteredCatalogItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`market-catalog-card card ${rarityClass(item.rarity)}`}
                onClick={() => {
                  setSelectedCatalogItemId(item.id);
                  setSelectedCatalogItemName(item.name);
                  setSearch("");
                  setPage(1);
                  setError(null);
                }}
              >
                <div className="market-catalog-image-wrap">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="market-listing-image" />
                  ) : (
                    <div className="market-listing-image-fallback">?</div>
                  )}
                </div>
                <div className="market-catalog-main">
                  <h3 className={`market-item-name ${rarityClass(item.rarity)}`}>{item.name}</h3>
                  <p className="market-item-meta muted market-info-line market-info-line-alt">
                    <span className="market-meta-label">Class</span>
                    <span>{item.classification ?? "Unknown"}</span>
                  </p>
                  <div className="market-catalog-bottom-row">
                    <span className={`lootbox-rarity-chip ${rarityClass(item.rarity)}`}>{item.rarity}</span>
                    <span className="muted">{item.activeListingCount} listings</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="market-list-grid">
            {loading ? (
              <p className="muted">Loading listings...</p>
            ) : listings.length === 0 ? (
              <p className="muted">No listings found for this selection right now.</p>
            ) : (
              listings.map((listing, index) => (
                <button
                  type="button"
                  key={`${listing.id}:${index}`}
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
                        <img
                          src={resolveAvatarUrl(listing.seller.avatar)}
                          alt={listing.seller.username}
                          className="market-seller-avatar"
                        />
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
        </>
      )}

      {showFiltersModal && (
        <div className="lootbox-modal-backdrop ui-modal-backdrop" onClick={() => setShowFiltersModal(false)}>
          <article className="lootbox-modal market-filters-modal ui-modal modal-lg" onClick={(event) => event.stopPropagation()}>
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
        <div className="lootbox-modal-backdrop ui-modal-backdrop" onClick={() => setShowListingsModal(false)}>
          <article className="lootbox-modal market-listings-modal ui-modal modal-xl" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <button type="button" className="profile-inventory-launch" onClick={openInventoryModal}>
                Inventory
              </button>
              <div className="market-account-summary muted">
                <span>USD Est: {formatUsd(myAccountSummary.realWorldUsdEstimate)}</span>
                <span>Currency: {formatUsd(myAccountSummary.currency)}</span>
                <span>Shards: {formatGrouped(myAccountSummary.specialCurrency)}</span>
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

            <div className="market-listings-scroll">
              {myListingsLoading ? (
                <p className="muted">Loading your listings...</p>
              ) : myListings.length === 0 ? (
                <p className="muted">You have no items currently listed on the market.</p>
              ) : (
                <div className="market-list-grid market-list-grid-single">
                  {myListings.map((listing, index) => (
                    <button
                      type="button"
                      key={`${listing.id}:${index}`}
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
                            <img
                              src={resolveAvatarUrl(listing.seller.avatar)}
                              alt={listing.seller.username}
                              className="market-seller-avatar"
                            />
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
        <div className="lootbox-modal-backdrop ui-modal-backdrop" onClick={closeDetailsModal}>
          <article className="lootbox-modal market-detail-modal ui-modal modal-lg" onClick={(event) => event.stopPropagation()}>
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
                      <span className="market-seller-inline">
                        <img
                          src={resolveAvatarUrl(selectedListing.seller.avatar)}
                          alt={selectedListing.seller.username}
                          className="market-seller-avatar"
                        />
                        {selectedListing.seller.username}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="market-detail-actions">
                  <div className="market-purchase-strip">
                    <span className="wallet-chip wallet-chip-cost">
                      <span className="wallet-chip-label">Price</span>
                      <strong>{formatUsd(selectedListing.listedPriceUsd)}</strong>
                    </span>

                    <span className="wallet-chip wallet-chip-balance">
                      <span className="wallet-chip-label">Currency</span>
                      <strong>{formatUsd(user?.currency ?? 0)} Available</strong>
                    </span>

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
                      <span className="market-purchase-spacer" aria-hidden="true" />
                    )}

                    {detailsActionMode === "buy" ? (
                      <button type="button" className="market-buy-button market-buy-button-large" onClick={handleBuyListing}>
                        Purchase Item
                      </button>
                    ) : (
                      <button type="button" className="market-buy-button market-buy-button-large" onClick={handleRemoveListing}>
                        Remove Listing
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      )}

      {showInventoryModal && (
        <div className="profile-inventory-backdrop ui-modal-backdrop" onClick={() => setShowInventoryModal(false)}>
          <article className="profile-inventory-modal ui-modal modal-lg" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>Your Inventory</h3>
              <button type="button" className="button-secondary" onClick={() => setShowInventoryModal(false)}>
                Close
              </button>
            </div>

            <div className="wallet-chip-row">
              <span className="wallet-chip">
                <span className="wallet-chip-label">Currency</span>
                <strong>{formatUsd(user?.currency ?? 0)}</strong>
              </span>
              <span className="wallet-chip">
                <span className="wallet-chip-label">Shards</span>
                <strong>{formatGrouped(user?.specialCurrency ?? 0)}</strong>
              </span>
            </div>

            {inventoryLoading ? (
              <p className="muted">Loading inventory...</p>
            ) : inventoryUnits.length === 0 ? (
              <p className="muted">No available items in your inventory right now.</p>
            ) : (
              <>
                {hiddenEscrowCount > 0 && (
                  <p className="muted">{hiddenEscrowCount} item(s) currently in escrow/hold are hidden from inventory display.</p>
                )}
                <div className="profile-inventory-slot-grid">
                  {inventoryUnits.map((unit) => (
                    <button
                      type="button"
                      key={unit.unitId}
                      className={`profile-inventory-slot ${rarityClass(unit.source.item.rarity)}`}
                      onClick={() => handleSellModalOpen(unit)}
                    >
                      <span className="profile-slot-wear">{unit.wear}</span>
                      <span className="profile-slot-name" title={unit.source.item.name}>{unit.source.item.name}</span>
                      <div className="profile-slot-image-wrap">
                        {unit.source.item.image ? (
                          <img src={unit.source.item.image} alt={unit.source.item.name} className="profile-slot-image" />
                        ) : (
                          <div className="profile-slot-image profile-slot-image-fallback">?</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </article>
        </div>
      )}

      {showSellModal && sellTargetItem && (
        <div className="profile-inventory-backdrop ui-modal-backdrop" onClick={() => setShowSellModal(false)}>
          <article className="profile-inventory-modal profile-account-modal ui-modal modal-md" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>List Item on Market</h3>
              <button type="button" className="button-secondary" onClick={() => setShowSellModal(false)}>
                Close
              </button>
            </div>

            <div className="wallet-chip-row">
              <span className="wallet-chip">
                <span className="wallet-chip-label">Currency</span>
                <strong>{formatUsd(user?.currency ?? 0)}</strong>
              </span>
              <span className="wallet-chip">
                <span className="wallet-chip-label">Shards</span>
                <strong>{formatGrouped(user?.specialCurrency ?? 0)}</strong>
              </span>
            </div>

            <article className="profile-account-block">
              <h4>{sellTargetItem.source.item.name}</h4>
              <p className="muted">Wear {sellTargetItem.wear} · Float {sellTargetItem.floatValue.toFixed(6)}</p>
              <p className="muted">This lists one unit and hands it to market escrow handling while active.</p>
              <div className="profile-inline-form profile-inline-form-stack">
                <label>
                  Price (USD)
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={sellPriceInput}
                    onChange={(event) => setSellPriceInput(event.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <button type="button" onClick={handleCreateListing} disabled={sellSubmitting}>
                  {sellSubmitting ? "Creating..." : "Create Listing"}
                </button>
              </div>
            </article>
          </article>
        </div>
      )}
    </section>
  );
};

export default Market;
