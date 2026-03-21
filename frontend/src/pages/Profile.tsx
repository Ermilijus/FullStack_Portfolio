import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
	API_BASE_URL,
	fetchLootboxFavorites,
	fetchProfileInventory,
	ProfileInventoryItem,
} from "../api";
import { useAppContext } from "../context/AppContext";

type FavoriteLootbox = {
	id: string;
	name: string;
	image: string | null;
	description: string | null;
	cost: number;
	isFavorited: boolean;
	favoritedAt: string;
};

const Profile = () => {
	const { user, setUser, token } = useAppContext();
	const storageKey = useMemo(
		() => `profile-note:${user?.id ?? "unknown"}`,
		[user?.id],
	);
	const [status, setStatus] = useState("");
	const [savedAt, setSavedAt] = useState<string | null>(null);

	// Avatar state
	const [avatarInput, setAvatarInput] = useState(user?.avatar ?? "");
	const [avatarSaving, setAvatarSaving] = useState(false);
	const [avatarError, setAvatarError] = useState<string | null>(null);
	const [avatarSavedAt, setAvatarSavedAt] = useState<string | null>(null);
	const [favoriteLootboxes, setFavoriteLootboxes] = useState<FavoriteLootbox[]>([]);
	const [favoritesLoading, setFavoritesLoading] = useState(true);
	const [favoritesError, setFavoritesError] = useState<string | null>(null);
	const [showInventoryModal, setShowInventoryModal] = useState(false);
	const [inventoryItems, setInventoryItems] = useState<ProfileInventoryItem[]>([]);
	const [inventoryLoading, setInventoryLoading] = useState(false);
	const [inventoryError, setInventoryError] = useState<string | null>(null);

	useEffect(() => {
		const persisted = localStorage.getItem(storageKey);
		if (persisted) {
			setStatus(persisted);
		}
	}, [storageKey]);

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

	const saveStatus = () => {
		localStorage.setItem(storageKey, status);
		setSavedAt(new Date().toLocaleString());
	};

	const saveAvatar = async () => {
		if (!avatarInput.trim()) {
			setAvatarError("Please enter a URL.");
			return;
		}
		if (!/^https?:\/\/.+/.test(avatarInput.trim())) {
			setAvatarError("Must be a valid http or https URL.");
			return;
		}
		setAvatarError(null);
		setAvatarSaving(true);
		try {
			const res = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ avatarUrl: avatarInput.trim() }),
			});
			if (!res.ok) {
				const err = await res.json() as { error: string };
				setAvatarError(err.error ?? "Failed to save avatar.");
				return;
			}
			const data = await res.json() as { user: { id: string; email: string; username: string; role?: string; avatar?: string } };
			setUser(data.user);
			setAvatarSavedAt(new Date().toLocaleString());
		} catch {
			setAvatarError("Network error — please try again.");
		} finally {
			setAvatarSaving(false);
		}
	};

	return (
		<section>
			<div className="page-title-row">
				<h1>Profile</h1>
				<div className="compact-row">
					<button type="button" className="profile-inventory-launch" onClick={openInventoryModal}>
						Inventory
					</button>
					<span className="muted">Manage your account settings</span>
				</div>
			</div>

			<article className="card">
				<h3>Account</h3>
				<p>Username: {user?.username ?? "Unknown"}</p>
				<p>Email: {user?.email ?? "Unknown"}</p>
			</article>

			<article className="card" style={{ marginTop: "1rem" }}>
				<h3>Avatar</h3>
				<div className="avatar-row">
					<div className="avatar-preview-wrap">
						{user?.avatar ? (
							<img
								src={user.avatar}
								alt="Your avatar"
								className="avatar-preview"
								onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
							/>
						) : (
							<div className="avatar-preview avatar-preview-placeholder">
								{user?.username?.charAt(0).toUpperCase() ?? "?"}
							</div>
						)}
					</div>
					<div className="avatar-input-group">
						<input
							type="url"
							value={avatarInput}
							onChange={(e) => setAvatarInput(e.target.value)}
							placeholder="https://example.com/your-avatar.png"
						/>
						{avatarError && <p className="error-text">{avatarError}</p>}
						<div className="compact-row" style={{ marginTop: "0.75rem" }}>
							<button type="button" onClick={saveAvatar} disabled={avatarSaving}>
								{avatarSaving ? "Saving…" : "Save Avatar"}
							</button>
							<span className="muted">
								{avatarSavedAt ? `Saved at ${avatarSavedAt}` : "Not saved yet"}
							</span>
						</div>
					</div>
				</div>
			</article>

			<article className="card" style={{ marginTop: "1rem" }}>
				<h3>Status</h3>
				<textarea
					value={status}
					onChange={(event) => setStatus(event.target.value)}
					rows={4}
					placeholder="Add a short status message"
				/>
				<div className="compact-row" style={{ marginTop: "0.75rem" }}>
					<button type="button" onClick={saveStatus}>
						Save
					</button>
					<span className="muted">{savedAt ? `Saved at ${savedAt}` : "Not saved in this session"}</span>
				</div>
			</article>

			<article className="card" style={{ marginTop: "1rem" }}>
				<div className="page-title-row">
					<h3>Favorite Lootboxes</h3>
					<span className="muted">Quick access</span>
				</div>
				{favoritesError && <p className="error-text">{favoritesError}</p>}
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
									<p className="muted" style={{ marginBottom: 0 }}>
										{lootbox.cost} credits
									</p>
								</div>
								<Link
									to={`/lootbox?lootbox=${encodeURIComponent(lootbox.id)}`}
									className="profile-lootbox-link"
								>
									View Case
								</Link>
							</article>
						))}
					</div>
				)}
			</article>

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
												<img
													src={entry.item.image}
													alt={entry.item.name}
													className="profile-inventory-image"
												/>
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

export default Profile;
