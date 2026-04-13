const getApiBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://${hostname}:4000`;
    }

    return window.location.origin;
  }

  return "http://127.0.0.1:4000";
};

export const API_BASE_URL = getApiBaseUrl();

export type Cs2ItemMeta = {
  isCs2: boolean;
  sourceDefIndex: number | null;
  sourcePaintIndex: number | null;
  sourceQuality: string | null;
  sourcePhase: string | null;
};

export type Project = {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
};

type ProjectsResponse = {
  items: Project[];
};

export const fetchProjects = async (): Promise<ProjectsResponse> => {
  const response = await fetch(`${API_BASE_URL}/projects`);
  if (!response.ok) {
    throw new Error("Failed to load projects");
  }
  return (await response.json()) as ProjectsResponse;
};

export type LootboxPreviewItem = {
  id: string;
  name: string;
  image: string | null;
  rarity: string;
  marketPrice?: number;
  weight: number;
  dropRatePercent?: number;
  quantity: number;
  cs2?: Cs2ItemMeta;
};

export type LootboxCatalogItem = {
  id: string;
  name: string;
  image: string | null;
  description: string | null;
  cost: number;
  spendCurrency: "currency" | "specialCurrency";
  isFavorited: boolean;
  totalDropPoolItems: number;
  previewItems: LootboxPreviewItem[];
};

export type LootboxDetailItem = {
  id: string;
  name: string;
  image: string | null;
  description: string | null;
  rarity: string;
  marketPrice: number;
  weight: number;
  dropRatePercent?: number;
  quantity: number;
  cs2?: Cs2ItemMeta;
};

export type LootboxDetail = {
  id: string;
  name: string;
  image: string | null;
  description: string | null;
  cost: number;
  spendCurrency: "currency" | "specialCurrency";
  isFavorited: boolean;
  items: LootboxDetailItem[];
  oddsModel?: {
    mode: string;
    buckets: Array<{
      bucket: string;
      baseChance: number;
      normalizedChance: number;
      poolSize: number;
    }>;
  };
  stats: {
    totalOpens: number;
    userOpens: number;
  };
  recentDrops: Array<{
    rollId: string;
    droppedBy: string;
    createdAt: string;
    item: {
      id: string;
      name: string;
      image: string | null;
      rarity: string;
      cs2?: Cs2ItemMeta;
    };
  }>;
};

export type LootboxOpenResult = {
  idempotentReplay: boolean;
  rollId: string;
  requestId?: string;
  lootbox: {
    id: string;
    name: string;
    image: string | null;
  };
  spent: {
    wallet: "currency" | "specialCurrency";
    amount: number;
    balanceAfter?: number;
  };
  item: {
    id: string;
    name: string;
    image: string | null;
    description: string | null;
    rarity: string;
    marketPrice: number;
    cs2?: Cs2ItemMeta;
  };
  inventory: {
    quantity: number;
    reservedForTrade: number;
    reservedForMarket: number;
  };
  trace: {
    rollValue: number | null;
    totalWeight: number | null;
  };
  createdAt: string;
  pool: Array<{
    id: string;
    name: string;
    image: string | null;
    rarity: string;
    weight: number;
    marketPrice: number;
    cs2?: Cs2ItemMeta;
  }>;
};

type LootboxCatalogResponse = {
  lootboxes: LootboxCatalogItem[];
};

type LootboxDetailResponse = {
  lootbox: LootboxDetail;
};

type LootboxOpenResponse = {
  result: LootboxOpenResult;
};

export type LootboxOddsSimulation = {
  lootboxId: string;
  lootboxName: string;
  mode: string;
  samples: number;
  expectedBuckets: Array<{
    bucket: string;
    baseChance: number;
    normalizedChance: number;
    poolSize: number;
  }>;
  observedBuckets: Array<{
    bucket: string;
    hits: number;
    observedChance: number;
  }>;
  observedRarities: Array<{
    rarity: string;
    hits: number;
    observedChance: number;
  }>;
  observedItemsTop20: Array<{
    itemId: string;
    name: string;
    rarity: string;
    hits: number;
    observedChance: number;
    expectedChance: number;
  }>;
};

type LootboxOddsSimulationResponse = {
  simulation: LootboxOddsSimulation;
};

type LootboxFavoritesResponse = {
  lootboxes: Array<{
    id: string;
    name: string;
    image: string | null;
    description: string | null;
    cost: number;
    isFavorited: boolean;
    favoritedAt: string;
  }>;
};

const createAuthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

export const fetchLootboxCatalog = async (token: string): Promise<LootboxCatalogItem[]> => {
  const response = await fetch(`${API_BASE_URL}/api/lootbox/catalog`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load lootbox catalog");
  }

  const data = (await response.json()) as LootboxCatalogResponse;
  return data.lootboxes;
};

export const fetchLootboxDetail = async (token: string, id: string): Promise<LootboxDetail> => {
  const response = await fetch(`${API_BASE_URL}/api/lootbox/${id}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load lootbox details");
  }

  const data = (await response.json()) as LootboxDetailResponse;
  return data.lootbox;
};

export const addLootboxFavorite = async (token: string, id: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/lootbox/${id}/favorite`, {
    method: "POST",
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to add favorite");
  }
};

export const removeLootboxFavorite = async (token: string, id: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/lootbox/${id}/favorite`, {
    method: "DELETE",
    headers: createAuthHeaders(token),
  });

  if (!response.ok && response.status !== 204) {
    throw new Error("Failed to remove favorite");
  }
};

export const fetchLootboxFavorites = async (
  token: string,
): Promise<LootboxFavoritesResponse["lootboxes"]> => {
  const response = await fetch(`${API_BASE_URL}/api/lootbox/favorites`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load favorites");
  }

  const data = (await response.json()) as LootboxFavoritesResponse;
  return data.lootboxes;
};

export const openLootbox = async (
  token: string,
  id: string,
  requestId: string,
): Promise<LootboxOpenResult> => {
  const response = await fetch(`${API_BASE_URL}/api/lootbox/${id}/open`, {
    method: "POST",
    headers: {
      ...createAuthHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to open lootbox" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to open lootbox");
  }

  const data = (await response.json()) as LootboxOpenResponse;
  return data.result;
};

export const fetchLootboxOddsSimulation = async (
  token: string,
  id: string,
  samples: number,
): Promise<LootboxOddsSimulation> => {
  const params = new URLSearchParams({ samples: String(samples) });
  const response = await fetch(`${API_BASE_URL}/api/lootbox/${id}/simulate-odds?${params.toString()}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to run odds simulation" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to run odds simulation");
  }

  const data = (await response.json()) as LootboxOddsSimulationResponse;
  return data.simulation;
};

export type ProfileInventoryItem = {
  id: string;
  quantity: number;
  availableQuantity: number;
  reservedForTrade: number;
  reservedForMarket: number;
  item: {
    id: string;
    name: string;
    image: string | null;
    rarity: string;
    description: string | null;
    marketPrice: number;
  };
};

type ProfileInventoryResponse = {
  items: ProfileInventoryItem[];
};

export const fetchProfileInventory = async (token: string): Promise<ProfileInventoryItem[]> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/inventory`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load inventory");
  }

  const data = (await response.json()) as ProfileInventoryResponse;
  return data.items;
};

export type MarketSortBy = "new" | "price" | "wear" | "float";
export type MarketSortDir = "asc" | "desc";

export type MarketCatalogItem = {
  id: string;
  name: string;
  image: string | null;
  rarity: string;
  classification: string | null;
  activeListingCount: number;
  cs2?: Cs2ItemMeta;
};

export type MarketCatalogTypeCard = {
  type: string;
  image: string | null;
  listingCount: number;
  itemCount: number;
};

export type MarketCatalogWeaponCard = {
  weaponName: string;
  image: string | null;
  listingCount: number;
  itemCount: number;
};

type MarketCatalogTypesResponse = {
  mode: "types";
  types: MarketCatalogTypeCard[];
};

type MarketCatalogItemsResponse = {
  mode: "items";
  itemType: string;
  weaponName: string;
  items: MarketCatalogItem[];
};

type MarketCatalogWeaponsResponse = {
  mode: "weapons";
  itemType: string;
  weapons: MarketCatalogWeaponCard[];
};

export type MarketListing = {
  id: string;
  createdAt: string;
  quantity: number;
  listedPriceUsd: number;
  seller: {
    id: string;
    username: string;
    avatar: string | null;
  };
  item: {
    id: string;
    name: string;
    image: string | null;
    description: string | null;
    rarity: string;
    type: string | null;
    basePriceUsd: number;
    float: number;
    wear: "Factory New" | "Minimal Wear" | "Field-Tested" | "Well-Worn" | "Battle-Scarred";
    cs2?: Cs2ItemMeta;
  };
  activeLootboxes: Array<{
    id: string;
    name: string;
  }>;
};

export type MarketFiltersResponse = {
  lootboxes: Array<{
    id: string;
    name: string;
  }>;
  wear: Array<"Factory New" | "Minimal Wear" | "Field-Tested" | "Well-Worn" | "Battle-Scarred">;
  types: string[];
  rarities: string[];
};

export type MarketListingsResponse = {
  listings: MarketListing[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: MarketFiltersResponse;
};

export type MyMarketListingsResponse = MarketListingsResponse & {
  account: {
    currency: number;
    specialCurrency: number;
    realWorldUsdEstimate: number;
  };
};

export type MarketListingsParams = {
  page?: number;
  pageSize?: 10 | 15 | 30 | 50;
  search?: string;
  sortBy?: MarketSortBy;
  sortDir?: MarketSortDir;
  lootboxId?: string;
  wear?: string[];
  type?: string[];
  quantityMin?: number;
  rarity?: string[];
  itemId?: string; // Global item definition identifier
};

type MarketListingDetailResponse = {
  listing: MarketListing;
};

type PurchaseMarketListingResponse = {
  success: boolean;
  purchase: {
    listingId: string;
    quantity: number;
    listedPriceUsd: number;
    item: {
      id: string;
      name: string;
      image: string | null;
      rarity: string;
      marketPrice: number;
    };
    buyerInventory: {
      quantity: number;
      reservedForTrade: number;
      reservedForMarket: number;
    };
  };
};

type CreateMarketListingResponse = {
  success: boolean;
  listing: {
    id: string;
    itemId: string;
    quantity: number;
    listedPriceUsd: number;
    createdAt: string;
  };
};

const appendCsvParam = (params: URLSearchParams, key: string, values: string[] | undefined) => {
  if (!values || values.length === 0) {
    return;
  }

  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) {
    return;
  }

  params.set(key, normalized.join(","));
};

export const fetchMarketListings = async (
  token: string,
  query: MarketListingsParams,
): Promise<MarketListingsResponse> => {
  const params = new URLSearchParams();

  if (query.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize) {
    params.set("pageSize", String(query.pageSize));
  }
  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.sortBy) {
    params.set("sortBy", query.sortBy);
  }
  if (query.sortDir) {
    params.set("sortDir", query.sortDir);
  }
  if (query.lootboxId?.trim()) {
    params.set("lootboxId", query.lootboxId.trim());
  }
  if (typeof query.quantityMin === "number" && query.quantityMin > 0) {
    params.set("quantityMin", String(query.quantityMin));
  }
  if (query.itemId?.trim()) {
    params.set("itemId", query.itemId.trim());
  }

  appendCsvParam(params, "wear", query.wear);
  appendCsvParam(params, "type", query.type);
  appendCsvParam(params, "rarity", query.rarity);

  const suffix = params.toString();
  const response = await fetch(`${API_BASE_URL}/api/market/listings${suffix ? `?${suffix}` : ""}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load market listings");
  }

  return (await response.json()) as MarketListingsResponse;
};

export const fetchMarketCatalogTypes = async (token: string): Promise<MarketCatalogTypeCard[]> => {
  const response = await fetch(`${API_BASE_URL}/api/market/catalog`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load market catalog types");
  }

  const data = (await response.json()) as MarketCatalogTypesResponse;
  return data.types;
};

export const fetchMarketCatalogWeapons = async (
  token: string,
  itemType: string,
): Promise<MarketCatalogWeaponCard[]> => {
  const params = new URLSearchParams({ itemType });
  const response = await fetch(`${API_BASE_URL}/api/market/catalog?${params.toString()}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load market weapon catalog");
  }

  const data = (await response.json()) as MarketCatalogWeaponsResponse;
  return data.weapons;
};

export const fetchMarketCatalogItems = async (
  token: string,
  itemType: string,
  weaponName: string,
): Promise<MarketCatalogItem[]> => {
  const params = new URLSearchParams({ itemType, weaponName });
  const response = await fetch(`${API_BASE_URL}/api/market/catalog?${params.toString()}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load market catalog items");
  }

  const data = (await response.json()) as MarketCatalogItemsResponse;
  return data.items;
};

export const fetchMyMarketListings = async (
  token: string,
  query: MarketListingsParams,
): Promise<MyMarketListingsResponse> => {
  const params = new URLSearchParams();

  if (query.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize) {
    params.set("pageSize", String(query.pageSize));
  }
  if (query.search?.trim()) {
    params.set("search", query.search.trim());
  }
  if (query.sortBy) {
    params.set("sortBy", query.sortBy);
  }
  if (query.sortDir) {
    params.set("sortDir", query.sortDir);
  }
  if (query.lootboxId?.trim()) {
    params.set("lootboxId", query.lootboxId.trim());
  }
  if (typeof query.quantityMin === "number" && query.quantityMin > 0) {
    params.set("quantityMin", String(query.quantityMin));
  }
  if (query.itemId?.trim()) {
    params.set("itemId", query.itemId.trim());
  }

  appendCsvParam(params, "wear", query.wear);
  appendCsvParam(params, "type", query.type);
  appendCsvParam(params, "rarity", query.rarity);

  const suffix = params.toString();
  const response = await fetch(`${API_BASE_URL}/api/market/my-listings${suffix ? `?${suffix}` : ""}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load your listings");
  }

  return (await response.json()) as MyMarketListingsResponse;
};

export const fetchMarketListingDetail = async (token: string, listingId: string): Promise<MarketListing> => {
  const response = await fetch(`${API_BASE_URL}/api/market/listings/${listingId}`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to load listing" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to load listing");
  }

  const data = (await response.json()) as MarketListingDetailResponse;
  return data.listing;
};

export const createMarketListing = async (
  token: string,
  payload: { itemId: string; quantity: number; listedPriceUsd: number },
): Promise<CreateMarketListingResponse["listing"]> => {
  const response = await fetch(`${API_BASE_URL}/api/market/listings`, {
    method: "POST",
    headers: {
      ...createAuthHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Failed to create market listing" }));
    throw new Error(typeof body.error === "string" ? body.error : "Failed to create market listing");
  }

  const data = (await response.json()) as CreateMarketListingResponse;
  return data.listing;
};

export const purchaseMarketListing = async (
  token: string,
  listingId: string,
): Promise<PurchaseMarketListingResponse["purchase"]> => {
  const response = await fetch(`${API_BASE_URL}/api/market/listings/${listingId}/purchase`, {
    method: "POST",
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to purchase listing" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to purchase listing");
  }

  const data = (await response.json()) as PurchaseMarketListingResponse;
  return data.purchase;
};

export const removeMarketListing = async (token: string, listingId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/market/listings/${listingId}`, {
    method: "DELETE",
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to remove listing" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to remove listing");
  }
};
export type ProfileStats = {
  inventoryItems: number;
  favoriteLootboxes: number;
  posts: number;
  replies: number;
  reputation: number;
};

export type ProfileSummary = {
  id: string;
  username: string;
  email?: string | null;
  role?: string;
  avatar?: string | null;
  createdAt: string;
  stats: ProfileStats;
};

type ProfileSummaryResponse = {
  user: ProfileSummary;
};

export type UserForumPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  category: {
    id: string;
    name: string;
  };
};

type UserForumPostsResponse = {
  posts: UserForumPost[];
};

export type UserForumReply = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  post: {
    id: string;
    title: string;
  };
};

type UserForumRepliesResponse = {
  replies: UserForumReply[];
};

export const fetchMyProfileSummary = async (token: string): Promise<ProfileSummary> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/me`, {
    headers: createAuthHeaders(token),
  });

  if (!response.ok) {
    throw new Error("Failed to load profile");
  }

  const data = (await response.json()) as ProfileSummaryResponse;
  return data.user;
};

export const fetchPublicProfileSummary = async (userId: string): Promise<ProfileSummary> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/${encodeURIComponent(userId)}`);

  if (!response.ok) {
    throw new Error("Failed to load public profile");
  }

  const data = (await response.json()) as ProfileSummaryResponse;
  return data.user;
};

export type ProfileUserUpdate = {
  id: string;
  username: string;
  email?: string | null;
  role?: string;
  avatar?: string | null;
};

export const updateProfileAvatar = async (token: string, avatarUrl: string): Promise<ProfileUserUpdate> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
    method: "PUT",
    headers: {
      ...createAuthHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ avatarUrl }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to save avatar" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to save avatar");
  }

  const data = (await response.json()) as { user: ProfileUserUpdate };
  return data.user;
};

export const updateProfileEmail = async (
  token: string,
  email: string,
  currentPassword: string,
): Promise<ProfileUserUpdate> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/email`, {
    method: "PUT",
    headers: {
      ...createAuthHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, currentPassword }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to update email" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to update email");
  }

  const data = (await response.json()) as { user: ProfileUserUpdate };
  return data.user;
};


export const updateProfileUsername = async (token: string, username: string): Promise<ProfileUserUpdate> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/username`, {
    method: "PUT",
    headers: {
      ...createAuthHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to update username" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to update username");
  }

  const data = (await response.json()) as { user: ProfileUserUpdate };
  return data.user;
};
export const updateProfilePassword = async (
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/password`, {
    method: "PUT",
    headers: {
      ...createAuthHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to update password" }));
    throw new Error(typeof payload.error === "string" ? payload.error : "Failed to update password");
  }
};

export const fetchUserForumPosts = async (userId: string): Promise<UserForumPost[]> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/${encodeURIComponent(userId)}/posts`);

  if (!response.ok) {
    throw new Error("Failed to load user posts");
  }

  const data = (await response.json()) as UserForumPostsResponse;
  return data.posts;
};

export const fetchUserForumReplies = async (userId: string): Promise<UserForumReply[]> => {
  const response = await fetch(`${API_BASE_URL}/api/profile/${encodeURIComponent(userId)}/replies`);

  if (!response.ok) {
    throw new Error("Failed to load user replies");
  }

  const data = (await response.json()) as UserForumRepliesResponse;
  return data.replies;
};
