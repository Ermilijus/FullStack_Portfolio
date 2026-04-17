import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createMarketListing,
  fetchLootboxFavorites,
  fetchMyProfileSummary,
  fetchProfileInventory,
  fetchUserForumPosts,
  fetchUserForumReplies,
  ProfileInventoryItem,
  ProfileSummary,
  updateProfileAvatar,
  updateProfileEmail,
  updateProfilePassword,
  updateProfileUsername,
  UserForumPost,
  UserForumReply,
} from "../api";
import { resolveAvatarUrl } from "../avatar";
import { useAppContext } from "../context/AppContext";
import { useNotifications } from "../context/NotificationContext";

type FavoriteLootbox = {
  id: string;
  name: string;
  image: string | null;
  description: string | null;
  cost: number;
  isFavorited: boolean;
  favoritedAt: string;
};

const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "video/webm"]);

const isVideoAvatar = (value: string | null | undefined) => Boolean(value && value.includes("video/webm"));
const toAvatarLinkInput = (value: string | null | undefined) => (value && value.startsWith("data:") ? "" : value ?? "");

type UnitWear = "Factory New" | "Minimal Wear" | "Field-Tested" | "Well-Worn" | "Battle-Scarred";

type InventoryUnit = {
  unitId: string;
  index: number;
  source: ProfileInventoryItem;
  floatValue: number;
  wear: UnitWear;
  holdType: "available" | "trade" | "market";
};

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

const rarityClass = (rarity: string) => rarity.trim().toLowerCase();

const formatUsd = (value: number | undefined) => {
  const resolved = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(resolved);
};

const formatGrouped = (value: number | undefined) => {
  const resolved = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(resolved);
};

const Profile = () => {
  const { user, setUser, token, refreshUser } = useAppContext();
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [favoriteLootboxes, setFavoriteLootboxes] = useState<FavoriteLootbox[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  const [forumPosts, setForumPosts] = useState<UserForumPost[]>([]);
  const [forumReplies, setForumReplies] = useState<UserForumReply[]>([]);
  const [forumLoading, setForumLoading] = useState(false);
  const [forumError, setForumError] = useState<string | null>(null);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameFeedback, setUsernameFeedback] = useState<string | null>(null);

  const [emailInput, setEmailInput] = useState("");
  const [emailPasswordInput, setEmailPasswordInput] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);

  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);

  const [avatarInput, setAvatarInput] = useState("");
  const [avatarUploadDataUrl, setAvatarUploadDataUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState<string | null>(null);

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<ProfileInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellTargetItem, setSellTargetItem] = useState<InventoryUnit | null>(null);
  const [sellPriceInput, setSellPriceInput] = useState("");
  const [sellSubmitting, setSellSubmitting] = useState(false);
  const [sellFeedback, setSellFeedback] = useState<string | null>(null);

  const viewedUserId = useMemo(() => profile?.id ?? user?.id ?? null, [profile?.id, user?.id]);
  const inventoryUnits = useMemo(
    () => inventoryItems.flatMap((entry) => Array.from({ length: Math.max(0, entry.availableQuantity) }, (_, index) => deriveInventoryUnit(entry, index))),
    [inventoryItems],
  );
  const hiddenEscrowCount = useMemo(
    () => inventoryItems.reduce((sum, entry) => sum + Math.max(0, entry.quantity - entry.availableQuantity), 0),
    [inventoryItems],
  );

  useEffect(() => {
    if (profileError) {
      notifyError(profileError, "Profile");
    }
  }, [notifyError, profileError]);

  useEffect(() => {
    if (favoritesError) {
      notifyError(favoritesError, "Profile");
    }
  }, [favoritesError, notifyError]);

  useEffect(() => {
    if (forumError) {
      notifyError(forumError, "Profile");
    }
  }, [forumError, notifyError]);

  useEffect(() => {
    if (inventoryError) {
      notifyError(inventoryError, "Inventory");
    }
  }, [inventoryError, notifyError]);

  useEffect(() => {
    if (sellFeedback) {
      notifyError(sellFeedback, "Profile");
    }
  }, [notifyError, sellFeedback]);

  useEffect(() => {
    if (!usernameFeedback) {
      return;
    }

    if (usernameFeedback === "Username updated.") {
      notifySuccess(usernameFeedback, "Profile");
      return;
    }

    notifyError(usernameFeedback, "Profile");
  }, [notifyError, notifySuccess, usernameFeedback]);

  useEffect(() => {
    if (!emailFeedback) {
      return;
    }

    if (emailFeedback === "Email updated.") {
      notifySuccess(emailFeedback, "Profile");
      return;
    }

    notifyError(emailFeedback, "Profile");
  }, [emailFeedback, notifyError, notifySuccess]);

  useEffect(() => {
    if (!passwordFeedback) {
      return;
    }

    if (passwordFeedback === "Password updated.") {
      notifySuccess(passwordFeedback, "Profile");
      return;
    }

    notifyError(passwordFeedback, "Profile");
  }, [notifyError, notifySuccess, passwordFeedback]);

  useEffect(() => {
    if (!avatarFeedback) {
      return;
    }

    if (avatarFeedback === "Avatar updated.") {
      notifySuccess(avatarFeedback, "Profile");
      return;
    }

    if (avatarFeedback === "File ready. Save to apply this avatar.") {
      notifyInfo(avatarFeedback, "Profile");
      return;
    }

    notifyError(avatarFeedback, "Profile");
  }, [avatarFeedback, notifyError, notifyInfo, notifySuccess]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const data = await fetchMyProfileSummary(token);
        setProfile(data);
        setUsernameInput(data.username ?? "");
        setEmailInput(data.email ?? "");
        setAvatarInput(toAvatarLinkInput(data.avatar));
      } catch {
        setProfileError("Could not load your profile summary.");
      } finally {
        setProfileLoading(false);
      }
    };

    void loadProfile();
  }, [token]);

  useEffect(() => {
    if (!token) {
      setFavoriteLootboxes([]);
      setFavoritesLoading(false);
      return;
    }

    const loadFavorites = async () => {
      setFavoritesLoading(true);
      setFavoritesError(null);
      try {
        const favorites = await fetchLootboxFavorites(token);
        setFavoriteLootboxes(favorites);
      } catch {
        setFavoritesError("Could not load your favorite lootboxes.");
      } finally {
        setFavoritesLoading(false);
      }
    };

    void loadFavorites();
  }, [token]);

  useEffect(() => {
    if (!viewedUserId) {
      return;
    }

    const loadForum = async () => {
      setForumLoading(true);
      setForumError(null);
      try {
        const [posts, replies] = await Promise.all([
          fetchUserForumPosts(viewedUserId),
          fetchUserForumReplies(viewedUserId),
        ]);
        setForumPosts(posts);
        setForumReplies(replies);
      } catch {
        setForumError("Could not load your forum activity.");
      } finally {
        setForumLoading(false);
      }
    };

    void loadForum();
  }, [viewedUserId]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showSellModal) {
          setShowSellModal(false);
          return;
        }

        if (showAvatarModal) {
          setShowAvatarModal(false);
          return;
        }

        if (showAccountModal) {
          setShowAccountModal(false);
          return;
        }

        if (showInventoryModal) {
          setShowInventoryModal(false);
        }
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [showAvatarModal, showAccountModal, showInventoryModal, showSellModal]);

  const syncUserContext = (payload: {
    id: string;
    username: string;
    email?: string | null;
    role?: string;
    avatar?: string | null;
  }) => {
    setUser({
      id: payload.id,
      username: payload.username,
      email: payload.email ?? "",
      role: payload.role,
      avatar: payload.avatar ?? undefined,
      currency: user?.currency,
      specialCurrency: user?.specialCurrency,
    });

    setProfile((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        username: payload.username,
        email: payload.email ?? current.email,
        avatar: payload.avatar ?? current.avatar,
      };
    });
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

  const handleAccountModalOpen = () => {
    setShowAccountModal(true);
    setUsernameFeedback(null);
    setEmailFeedback(null);
    setPasswordFeedback(null);
  };

  const handleAvatarModalOpen = () => {
    setShowAvatarModal(true);
    setAvatarFeedback(null);
  };

  const handleAvatarFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
      setAvatarFeedback("Unsupported file type. Allowed: PNG, JPEG, WEBM, GIF, WEBP.");
      return;
    }

    if (file.size > AVATAR_MAX_FILE_SIZE) {
      setAvatarFeedback("File size exceeds 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        setAvatarFeedback("Could not read the selected file.");
        return;
      }
      setAvatarUploadDataUrl(result);
      setAvatarFeedback("File ready. Save to apply this avatar.");
    };
    reader.onerror = () => {
      setAvatarFeedback("Failed to process selected file.");
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarSave = async () => {
    if (!token) {
      return;
    }

    const nextAvatar = avatarUploadDataUrl ?? avatarInput.trim();
    if (!nextAvatar) {
      setAvatarFeedback("Provide an avatar link or choose a file.");
      return;
    }

    if (!avatarUploadDataUrl && !/^https?:\/\/.+/.test(nextAvatar)) {
      setAvatarFeedback("Avatar link must be a valid http/https URL.");
      return;
    }

    setAvatarSaving(true);
    setAvatarFeedback(null);
    try {
      const updatedUser = await updateProfileAvatar(token, nextAvatar);
      syncUserContext(updatedUser);
      setAvatarInput(toAvatarLinkInput(updatedUser.avatar));
      setAvatarUploadDataUrl(null);
      setAvatarFeedback("Avatar updated.");
    } catch (error) {
      setAvatarFeedback(error instanceof Error ? error.message : "Failed to save avatar.");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleUsernameSave = async () => {
    if (!token) {
      return;
    }

    const nextUsername = usernameInput.trim();
    if (nextUsername.length < 3) {
      setUsernameFeedback("Username must be at least 3 characters.");
      return;
    }

    setUsernameSaving(true);
    setUsernameFeedback(null);
    try {
      const updatedUser = await updateProfileUsername(token, nextUsername);
      syncUserContext(updatedUser);
      setUsernameFeedback("Username updated.");
    } catch (error) {
      setUsernameFeedback(error instanceof Error ? error.message : "Failed to update username.");
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleEmailSave = async () => {
    if (!token) {
      return;
    }

    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailFeedback("Please enter a valid email.");
      return;
    }

    if (!emailPasswordInput) {
      setEmailFeedback("Current password is required to change email.");
      return;
    }

    setEmailSaving(true);
    setEmailFeedback(null);
    try {
      const updatedUser = await updateProfileEmail(token, normalizedEmail, emailPasswordInput);
      syncUserContext(updatedUser);
      setEmailPasswordInput("");
      setEmailFeedback("Email updated.");
    } catch (error) {
      setEmailFeedback(error instanceof Error ? error.message : "Failed to update email.");
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!token) {
      return;
    }

    if (!currentPasswordInput || !newPasswordInput) {
      setPasswordFeedback("Both current and new password are required.");
      return;
    }

    if (newPasswordInput.length < 6) {
      setPasswordFeedback("New password must be at least 6 characters.");
      return;
    }

    setPasswordSaving(true);
    setPasswordFeedback(null);
    try {
      await updateProfilePassword(token, currentPasswordInput, newPasswordInput);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setPasswordFeedback("Password updated.");
    } catch (error) {
      setPasswordFeedback(error instanceof Error ? error.message : "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
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
      void refreshUser();
      setSellFeedback(null);
      setInventoryError(null);
      notifySuccess("Listing created from inventory.", "Profile");
    } catch (error) {
      setSellFeedback(error instanceof Error ? error.message : "Failed to create market listing.");
    } finally {
      setSellSubmitting(false);
    }
  };

  const avatarValue = profile?.avatar ?? user?.avatar ?? null;
  const resolvedAvatarValue = resolveAvatarUrl(
    avatarValue,
    profile?.id ?? profile?.username ?? user?.id ?? user?.username,
  );

  return (
    <section className="profile-page ui-section">
      <div className="page-title-row">
        <h1>Profile</h1>
        <button type="button" className="profile-inventory-launch" onClick={openInventoryModal}>
          Open Inventory
        </button>
      </div>
      <div className="wallet-chip-row">
        <span className="wallet-chip">
          <span className="wallet-chip-label">Currency</span>
          <strong>{formatUsd(user?.currency)}</strong>
        </span>
        <span className="wallet-chip">
          <span className="wallet-chip-label">Shards</span>
          <strong>{formatGrouped(user?.specialCurrency)}</strong>
        </span>
      </div>

      <article className="card profile-identity-card">
        <div className="profile-identity-main">
          <button type="button" className="profile-avatar-trigger" onClick={handleAvatarModalOpen} title="Change avatar">
            <div className="avatar-preview-wrap">
              {avatarValue && isVideoAvatar(avatarValue) ? (
                <video src={avatarValue} className="avatar-preview" autoPlay muted loop playsInline />
              ) : (
                <img
                  src={resolvedAvatarValue}
                  alt={avatarValue ? "Your avatar" : "Default avatar"}
                  className="avatar-preview"
                />
              )}
            </div>
            <span className="muted">Change avatar</span>
          </button>

          <div>
            <h3>{profileLoading ? "Loading..." : profile?.username ?? user?.username ?? "Unknown user"}</h3>
            <p className="muted">{profile?.email ?? user?.email ?? "No email on file"}</p>
            <p className="muted">Member since {profile ? new Date(profile.createdAt).toLocaleDateString() : "-"}</p>
          </div>
        </div>

        <div className="profile-stats-grid">
          <article className="profile-stat-chip"><span className="muted">Reputation</span><strong>{profile?.stats.reputation ?? 0}</strong></article>
          <article className="profile-stat-chip"><span className="muted">Posts</span><strong>{profile?.stats.posts ?? 0}</strong></article>
          <article className="profile-stat-chip"><span className="muted">Replies</span><strong>{profile?.stats.replies ?? 0}</strong></article>
          <article className="profile-stat-chip"><span className="muted">Favorites</span><strong>{profile?.stats.favoriteLootboxes ?? 0}</strong></article>
        </div>

        <div className="compact-row">
          <button type="button" className="button-secondary" onClick={handleAccountModalOpen}>
            Account Management
          </button>
          <span className="muted">Manage username, email, and password</span>
        </div>
      </article>

      <article className="card" style={{ marginTop: "1rem" }}>
        <div className="page-title-row">
          <h3>Favorite Lootboxes</h3>
          <span className="muted">Quick access</span>
        </div>
        {favoritesLoading ? (
          <p className="muted">Loading favorites...</p>
        ) : favoriteLootboxes.length === 0 ? (
          <p className="muted">No favorite lootboxes yet. Star a case from the Lootbox page.</p>
        ) : (
          <div className="list-stack">
            {favoriteLootboxes.map((lootbox) => (
              <article key={lootbox.id} className="card compact-row">
                <div>
                  <strong>{lootbox.name}</strong>
                  <p className="muted" style={{ marginBottom: 0 }}>{formatUsd(lootbox.cost)} Currency</p>
                </div>
                <Link to={`/lootbox?lootbox=${encodeURIComponent(lootbox.id)}`} className="profile-lootbox-link">
                  View Case
                </Link>
              </article>
            ))}
          </div>
        )}
      </article>

      <article className="card profile-forum-section" style={{ marginTop: "1rem" }}>
        <div className="page-title-row">
          <h3>Forum Activity</h3>
          <span className="muted">Posts and comments</span>
        </div>

        {forumLoading ? (
          <p className="muted">Loading forum activity...</p>
        ) : (
          <div className="profile-forum-grid">
            <article>
              <h4>Recent Posts</h4>
              {forumPosts.length === 0 ? (
                <p className="muted">No posts yet.</p>
              ) : (
                <div className="list-stack">
                  {forumPosts.slice(0, 6).map((post) => (
                    <article key={post.id} className="card">
                      <strong>{post.title}</strong>
                      <p className="muted">{post.category.name} - {post.replyCount} replies</p>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article>
              <h4>Recent Replies</h4>
              {forumReplies.length === 0 ? (
                <p className="muted">No replies yet.</p>
              ) : (
                <div className="list-stack">
                  {forumReplies.slice(0, 6).map((reply) => (
                    <article key={reply.id} className="card">
                      <strong>{reply.post.title}</strong>
                      <p className="muted">{reply.content}</p>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </div>
        )}
      </article>

      {showAccountModal && (
        <div className="profile-inventory-backdrop ui-modal-backdrop" onClick={() => setShowAccountModal(false)}>
          <article className="profile-inventory-modal profile-account-modal ui-modal modal-md" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>Account Management</h3>
              <button type="button" className="button-secondary" onClick={() => setShowAccountModal(false)}>
                Close
              </button>
            </div>

            <div className="profile-account-panel">
              <article className="profile-account-block">
                <h4>Username</h4>
                <div className="profile-inline-form">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                    placeholder="Username"
                  />
                  <button type="button" onClick={handleUsernameSave} disabled={usernameSaving}>
                    {usernameSaving ? "Saving..." : "Update Username"}
                  </button>
                </div>
              </article>

              <article className="profile-account-block">
                <h4>Email</h4>
                <div className="profile-inline-form profile-inline-form-stack">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    placeholder="email@example.com"
                  />
                  <input
                    type="password"
                    value={emailPasswordInput}
                    onChange={(event) => setEmailPasswordInput(event.target.value)}
                    placeholder="Current password"
                  />
                  <button type="button" onClick={handleEmailSave} disabled={emailSaving}>
                    {emailSaving ? "Updating..." : "Update Email"}
                  </button>
                </div>
              </article>

              <article className="profile-account-block">
                <h4>Password</h4>
                <div className="profile-inline-form profile-inline-form-stack">
                  <input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(event) => setCurrentPasswordInput(event.target.value)}
                    placeholder="Current password"
                  />
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(event) => setNewPasswordInput(event.target.value)}
                    placeholder="New password"
                  />
                  <button type="button" onClick={handlePasswordSave} disabled={passwordSaving}>
                    {passwordSaving ? "Updating..." : "Update Password"}
                  </button>
                </div>
              </article>
            </div>
          </article>
        </div>
      )}

      {showAvatarModal && (
        <div className="profile-inventory-backdrop ui-modal-backdrop" onClick={() => setShowAvatarModal(false)}>
          <article className="profile-inventory-modal profile-account-modal ui-modal modal-md" onClick={(event) => event.stopPropagation()}>
            <div className="compact-row">
              <h3>Change Avatar</h3>
              <button type="button" className="button-secondary" onClick={() => setShowAvatarModal(false)}>
                Close
              </button>
            </div>

            <article className="profile-account-block">
              <h4>Upload File</h4>
              <p className="muted">Allowed: PNG, JPEG, WEBM, GIF, WEBP. Max size: 5MB.</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,video/webm"
                onChange={handleAvatarFileSelection}
              />
            </article>

            <article className="profile-account-block">
              <h4>Or Use Link</h4>
              {avatarUploadDataUrl && <p className="muted">Uploaded file is ready. Link field is hidden for uploaded avatars.</p>}
              <div className="profile-inline-form profile-inline-form-stack">
                <input
                  type="url"
                  value={avatarInput}
                  onChange={(event) => setAvatarInput(event.target.value)}
                  placeholder="https://example.com/avatar.png"
                />
                <button type="button" onClick={handleAvatarSave} disabled={avatarSaving}>
                  {avatarSaving ? "Saving..." : "Save Avatar"}
                </button>
              </div>
            </article>
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
                <strong>{formatUsd(user?.currency)}</strong>
              </span>
              <span className="wallet-chip">
                <span className="wallet-chip-label">Shards</span>
                <strong>{formatGrouped(user?.specialCurrency)}</strong>
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
                <strong>{formatUsd(user?.currency)}</strong>
              </span>
              <span className="wallet-chip">
                <span className="wallet-chip-label">Shards</span>
                <strong>{formatGrouped(user?.specialCurrency)}</strong>
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

export default Profile;