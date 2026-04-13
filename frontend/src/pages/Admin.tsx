import { useEffect, useState } from "react";
import {
  API_BASE_URL,
  fetchLootboxCatalog,
  fetchLootboxOddsSimulation,
  LootboxOddsSimulation,
} from "../api";
import { useAppContext } from "../context/AppContext";
import { useNotifications } from "../context/NotificationContext";

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
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [simCaseOptions, setSimCaseOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [simCaseId, setSimCaseId] = useState("");
  const [simSamples, setSimSamples] = useState(100000);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<LootboxOddsSimulation | null>(null);

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

  useEffect(() => {
    const loadCaseOptions = async () => {
      if (!token) {
        return;
      }

      try {
        const catalog = await fetchLootboxCatalog(token);
        const options = catalog
          .map((lootbox) => ({ id: lootbox.id, name: lootbox.name }))
          .sort((left, right) => left.name.localeCompare(right.name));

        setSimCaseOptions(options);
        setSimCaseId((current) => current || options[0]?.id || "");
      } catch {
        setSimError("Could not load lootboxes for odds simulation.");
      }
    };

    loadCaseOptions();
  }, [token]);

  useEffect(() => {
    if (error) {
      notifyError(error, "Admin");
    }
  }, [error, notifyError]);

  useEffect(() => {
    if (simError) {
      notifyError(simError, "Admin");
    }
  }, [notifyError, simError]);

  const runSimulation = async () => {
    if (!token || !simCaseId) {
      setSimError("Choose a lootbox before running the simulation.");
      return;
    }

    const normalizedSamples = Math.max(1000, Math.min(Math.floor(simSamples), 1_000_000));
    setSimSamples(normalizedSamples);
    setSimLoading(true);
    setSimError(null);

    try {
      const simulation = await fetchLootboxOddsSimulation(token, simCaseId, normalizedSamples);
      setSimResult(simulation);
      notifySuccess(`Odds simulation completed for ${simulation.lootboxName}.`, "Admin");
    } catch (err) {
      setSimResult(null);
      setSimError(err instanceof Error ? err.message : "Failed to run simulation.");
    } finally {
      setSimLoading(false);
    }
  };

  const selectedSimCaseName = simCaseOptions.find((option) => option.id === simCaseId)?.name ?? "";

  const bucketRows = simResult
    ? simResult.expectedBuckets.map((expected) => {
      const observed = simResult.observedBuckets.find((row) => row.bucket === expected.bucket);
      const observedChance = observed?.observedChance ?? 0;
      return {
        ...expected,
        observedChance,
        deviation: Number((observedChance - expected.normalizedChance).toFixed(6)),
      };
    })
    : [];

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
      notifySuccess(editingId ? "Banner updated." : "Banner created.", "Admin");
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
      notifyInfo("Banner deleted.", "Admin");
    } catch {
      setError("Failed to delete banner.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="ui-section admin-page">
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

      <article className="card" style={{ marginTop: "1rem" }}>
        <div className="admin-section-header">
          <h2>Odds Simulator</h2>
          <span className="muted">Admin-only CS2 case odds validation</span>
        </div>

        <div className="admin-odds-controls">
          <label>
            Lootbox
            <select value={simCaseId} onChange={(event) => setSimCaseId(event.target.value)}>
              {simCaseOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>

          <label>
            Samples
            <input
              type="number"
              min={1000}
              max={1000000}
              step={1000}
              value={simSamples}
              onChange={(event) => setSimSamples(Number(event.target.value) || 1000)}
            />
          </label>

          <button type="button" onClick={runSimulation} disabled={simLoading || !simCaseId}>
            {simLoading ? "Running..." : "Run Simulation"}
          </button>
        </div>

        <p className="muted admin-odds-hint">
          Runs server-side simulation using live opening logic. Sample bounds: 1,000 to 1,000,000.
        </p>

        {simResult && (
          <div className="admin-odds-results">
            <div className="admin-odds-kpis">
              <article className="admin-odds-kpi">
                <span className="muted">Lootbox</span>
                <strong>{simResult.lootboxName || selectedSimCaseName}</strong>
              </article>
              <article className="admin-odds-kpi">
                <span className="muted">Samples</span>
                <strong>{simResult.samples.toLocaleString()}</strong>
              </article>
              <article className="admin-odds-kpi">
                <span className="muted">Mode</span>
                <strong>{simResult.mode}</strong>
              </article>
            </div>

            <div className="admin-odds-grid">
              <section className="admin-odds-panel">
                <h3>Bucket Accuracy</h3>
                <div className="admin-odds-table-wrap">
                  <table className="admin-table admin-odds-table">
                    <thead>
                      <tr>
                        <th>Bucket</th>
                        <th>Expected</th>
                        <th>Observed</th>
                        <th>Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucketRows.map((row) => (
                        <tr key={row.bucket}>
                          <td>{row.bucket}</td>
                          <td>{row.normalizedChance.toFixed(4)}%</td>
                          <td>{row.observedChance.toFixed(4)}%</td>
                          <td className={row.deviation >= 0 ? "admin-delta-up" : "admin-delta-down"}>
                            {row.deviation >= 0 ? "+" : ""}{row.deviation.toFixed(4)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-odds-panel">
                <h3>Expected vs Observed Visual</h3>
                <div className="admin-odds-bars">
                  {bucketRows.map((row) => (
                    <div key={`${row.bucket}-bar`} className="admin-odds-bar-row">
                      <div className="admin-odds-bar-label">
                        <span>{row.bucket}</span>
                        <small className="muted">E {row.normalizedChance.toFixed(3)}% / O {row.observedChance.toFixed(3)}%</small>
                      </div>
                      <div className="admin-odds-bar-track">
                        <span
                          className="admin-odds-bar-fill expected"
                          style={{ width: `${Math.min(100, row.normalizedChance)}%` }}
                        />
                        <span
                          className="admin-odds-bar-fill observed"
                          style={{ width: `${Math.min(100, row.observedChance)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="admin-odds-grid">
              <section className="admin-odds-panel">
                <h3>Observed Rarity Spread</h3>
                <div className="admin-odds-table-wrap">
                  <table className="admin-table admin-odds-table">
                    <thead>
                      <tr>
                        <th>Rarity</th>
                        <th>Hits</th>
                        <th>Observed %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResult.observedRarities.map((row) => (
                        <tr key={row.rarity}>
                          <td>{row.rarity}</td>
                          <td>{row.hits.toLocaleString()}</td>
                          <td>{row.observedChance.toFixed(6)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-odds-panel">
                <h3>Top 20 Observed Items</h3>
                <div className="admin-odds-table-wrap">
                  <table className="admin-table admin-odds-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Rarity</th>
                        <th>Observed %</th>
                        <th>Expected %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResult.observedItemsTop20.map((row) => (
                        <tr key={row.itemId}>
                          <td>{row.name}</td>
                          <td>{row.rarity}</td>
                          <td>{row.observedChance.toFixed(6)}%</td>
                          <td>{row.expectedChance.toFixed(6)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}
      </article>

      {/* ── Banner Form Modal ─────────────────────────────────────────── */}
      {formOpen && (
        <div className="admin-modal-backdrop ui-modal-backdrop" onClick={closeForm}>
          <div className="admin-modal ui-modal modal-sm" onClick={(e) => e.stopPropagation()}>
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
