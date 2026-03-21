import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api";
import { useAppContext } from "../context/AppContext";

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkPath: string;
  linkLabel: string | null;
  isActive: boolean;
  displayOrder: number;
};

const VALID_LINK_PATHS = ["/home", "/forum", "/lootbox", "/market", "/trade", "/profile"];

const emptyForm = (): Omit<Banner, "id"> => ({
  title: "",
  subtitle: "",
  imageUrl: "",
  linkPath: "/lootbox",
  linkLabel: "",
  isActive: true,
  displayOrder: 0,
});

const Admin = () => {
  const { token } = useAppContext();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/banners/admin`, { headers: authHeaders });
      if (!res.ok) throw new Error();
      const data = await res.json() as { banners: Banner[] };
      setBanners(data.banners);
    } catch {
      setError("Failed to load banners.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (banner: Banner) => {
    setEditingId(banner.id);
    setForm({
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      imageUrl: banner.imageUrl,
      linkPath: banner.linkPath,
      linkLabel: banner.linkLabel ?? "",
      isActive: banner.isActive,
      displayOrder: banner.displayOrder,
    });
    setError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.imageUrl.trim()) {
      setError("Title and Image URL are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId
        ? `${API_BASE_URL}/api/banners/admin/${editingId}`
        : `${API_BASE_URL}/api/banners/admin`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({
          title: form.title.trim(),
          subtitle: form.subtitle?.trim() || undefined,
          imageUrl: form.imageUrl.trim(),
          linkPath: form.linkPath,
          linkLabel: form.linkLabel?.trim() || undefined,
          isActive: form.isActive,
          displayOrder: Number(form.displayOrder),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error: string };
        setError(err.error ?? "Save failed.");
        return;
      }
      await fetchBanners();
      closeForm();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this banner? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`${API_BASE_URL}/api/banners/admin/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      await fetchBanners();
    } catch {
      setError("Failed to delete banner.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section>
      <div className="page-title-row">
        <h1>Admin Panel</h1>
        <span className="muted">Site management</span>
      </div>

      {/* ── Banner Management ──────────────────────────────────────────── */}
      <article className="card" style={{ marginTop: "1rem" }}>
        <div className="admin-section-header">
          <h2>Banners</h2>
          <button type="button" onClick={openCreate} className="admin-add-btn">
            + Add Banner
          </button>
        </div>

        {error && !formOpen && <p className="error-text">{error}</p>}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : banners.length === 0 ? (
          <p className="muted">No banners yet. Add one to get started.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Link Path</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id}>
                    <td>{b.displayOrder}</td>
                    <td>
                      <span className="admin-banner-title">{b.title}</span>
                      {b.subtitle && <span className="muted admin-banner-sub"> — {b.subtitle}</span>}
                    </td>
                    <td>
                      <code className="admin-link-path">{b.linkPath}</code>
                    </td>
                    <td>
                      <span className={`admin-badge ${b.isActive ? "active" : "inactive"}`}>
                        {b.isActive ? "Active" : "Hidden"}
                      </span>
                    </td>
                    <td className="admin-actions">
                      <button type="button" onClick={() => openEdit(b)} className="admin-edit-btn">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        className="admin-delete-btn"
                        disabled={deletingId === b.id}
                      >
                        {deletingId === b.id ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* ── Banner Form Modal ─────────────────────────────────────────── */}
      {formOpen && (
        <div className="admin-modal-backdrop" onClick={closeForm}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? "Edit Banner" : "New Banner"}</h3>

            <label>
              Title <span className="required">*</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Genesis Crate is Live"
              />
            </label>

            <label>
              Subtitle
              <input
                type="text"
                value={form.subtitle ?? ""}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="Optional short description"
              />
            </label>

            <label>
              Image URL <span className="required">*</span>
              <input
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://example.com/banner.jpg"
              />
            </label>

            <label>
              Link Path <span className="required">*</span>
              <select
                value={form.linkPath}
                onChange={(e) => setForm({ ...form, linkPath: e.target.value })}
              >
                {VALID_LINK_PATHS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>

            <label>
              CTA Label
              <input
                type="text"
                value={form.linkLabel ?? ""}
                onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                placeholder='e.g. "Open Now"'
              />
            </label>

            <label>
              Display Order
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                min={0}
              />
            </label>

            <label className="admin-checkbox-label">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active (visible on Home page)
            </label>

            {error && <p className="error-text">{error}</p>}

            <div className="admin-modal-actions">
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Update Banner" : "Create Banner"}
              </button>
              <button type="button" onClick={closeForm} className="button-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Admin;
