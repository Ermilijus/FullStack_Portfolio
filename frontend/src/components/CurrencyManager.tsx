import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../api";
import { resolveAvatarUrl } from "../avatar";
import { useAppContext } from "../context/AppContext";
import { useNotifications } from "../context/NotificationContext";

type User = {
  id: string;
  username: string;
  avatar: string | null;
  currency: number;
  specialCurrency: number;
  role: string;
};

type CurrencyManagerProps = {
  onCurrencyUpdated?: () => void;
};

type ConfirmState = {
  active: boolean;
  isAdding: boolean;
  amount: number;
  users: User[];
} | null;

const CurrencyManager: React.FC<CurrencyManagerProps> = ({ onCurrencyUpdated }) => {
  const { token } = useAppContext();
  const { notifyCurrencyChange, notifyError, notifySuccess } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState<number | "">(0);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencyType, setCurrencyType] = useState<"currency" | "specialCurrency">("currency");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const fetchUsers = useCallback(async (options?: { silent?: boolean; notifyOnError?: boolean }) => {
    if (!token) return;
    const silent = options?.silent ?? false;
    const notifyOnError = options?.notifyOnError ?? !silent;

    if (!silent) {
      setUsersLoading(true);
      setError(null);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json() as { users: User[] };
      setUsers(data.users);
    } catch {
      if (notifyOnError) {
        setError("Failed to load users list");
        notifyError("Could not load users for currency manager");
      }
    } finally {
      if (!silent) {
        setUsersLoading(false);
      }
    }
  }, [authHeaders, notifyError, token]);

  // Fetch users when dropdown opens
  useEffect(() => {
    if (isOpen && users.length === 0 && !usersLoading) {
      void fetchUsers();
    }
  }, [fetchUsers, isOpen, users.length, usersLoading]);

  // Keep balances live only while the manager is open.
  useEffect(() => {
    if (!isOpen || !token) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchUsers({ silent: true, notifyOnError: false });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchUsers, isOpen, token]);

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const selectAllUsers = () => {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u) => u.id)));
    }
  };

  const handleAdjustCurrency = async (isAdding: boolean) => {
    if (selectedUserIds.size === 0) {
      setError("Please select at least one user");
      return;
    }

    if (amount === "" || amount === 0) {
      setError("Please enter an amount");
      return;
    }

    const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));

    // Show confirmation modal instead of browser popup
    setConfirmState({
      active: true,
      isAdding,
      amount: amount as number,
      users: selectedUsers,
    });
  };

  const executeAdjustCurrency = async () => {
    if (!confirmState) return;

    const adjustmentAmount = confirmState.isAdding
      ? Math.abs(confirmState.amount)
      : -Math.abs(confirmState.amount);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/adjust-currency`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          userIds: Array.from(selectedUserIds),
          amount: adjustmentAmount,
          currencyType,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to adjust currency");
      }

      const payload = await res.json() as {
        updated?: Array<{ id: string; currency: number; specialCurrency: number }>;
      };

      if (Array.isArray(payload.updated)) {
        setUsers((current) => current.map((entry) => {
          const updatedUser = payload.updated?.find((row) => row.id === entry.id);
          if (!updatedUser) {
            return entry;
          }

          return {
            ...entry,
            currency: updatedUser.currency,
            specialCurrency: updatedUser.specialCurrency,
          };
        }));
      }

      // Notify for each user with colored currency change
      confirmState.users.forEach((user) => {
        notifyCurrencyChange(user.username, adjustmentAmount, "Admin", 3000);
      });

      // Reset form
      setSelectedUserIds(new Set());
      setAmount(0);
      setError(null);
      setConfirmState(null);
      notifySuccess(`Adjusted currency for ${confirmState.users.length} user(s)`);

      if (isOpen) {
        void fetchUsers({ silent: true, notifyOnError: false });
      }

      // Callback
      onCurrencyUpdated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to adjust currency";
      setError(message);
      notifyError(message);
      setConfirmState(null);
    } finally {
      setLoading(false);
    }
  };

  const cancelConfirm = () => {
    setConfirmState(null);
  };

  const selectedCount = selectedUserIds.size;
  const amountValue = amount === "" ? "" : Math.abs(amount as number);

  return (
    <div className="currency-manager">
      <div className="currency-manager-header">
        <button
          type="button"
          className="currency-manager-toggle"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span>💰 Currency Manager</span>
          <span className={`toggle-arrow ${isOpen ? "open" : ""}`}>▼</span>
        </button>
      </div>

      {isOpen && (
        <div className="currency-manager-panel">
          {usersLoading && users.length === 0 ? (
            <p className="muted">Loading users…</p>
          ) : (
            <>
              {/* Currency Type Selection */}
              <div className="currency-manager-section">
                <label>
                  Currency Type
                  <select
                    value={currencyType}
                    onChange={(e) => setCurrencyType(e.target.value as "currency" | "specialCurrency")}
                  >
                    <option value="currency">Standard Currency</option>
                    <option value="specialCurrency">Special Currency</option>
                  </select>
                </label>
              </div>

              {/* User Selection Table */}
              <div className="currency-manager-section">
                <div className="currency-manager-user-controls">
                  <strong>Select Users ({selectedCount})</strong>
                  <button
                    type="button"
                    className="currency-manager-select-all"
                    onClick={selectAllUsers}
                  >
                    {selectedCount === users.length && users.length > 0 ? "Clear All" : "Select All"}
                  </button>
                </div>

                <div className="currency-manager-table-wrapper">
                  <table className="currency-manager-table">
                    <thead>
                      <tr>
                        <th className="col-avatar"></th>
                        <th className="col-username">Username</th>
                        <th className="col-id">ID</th>
                        <th className="col-currency">Currency</th>
                        <th className="col-special">Special</th>
                        <th className="col-role">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className={`${selectedUserIds.has(user.id) ? "selected" : ""}`}
                          onClick={() => toggleUserSelection(user.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleUserSelection(user.id);
                            }
                          }}
                          aria-label={`${selectedUserIds.has(user.id) ? "Unselect" : "Select"} ${user.username}`}
                        >
                          <td className="col-avatar">
                            <img
                              src={resolveAvatarUrl(user.avatar, user.id || user.username)}
                              alt={user.username}
                              className="user-avatar"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = resolveAvatarUrl(null, user.id || user.username);
                              }}
                            />
                          </td>
                          <td className="col-username">
                            <span className="username">{user.username}</span>
                          </td>
                          <td className="col-id">
                            <code className="user-id" title={user.id}>{user.id}</code>
                          </td>
                          <td className="col-currency">
                            <span className="currency-amount">💰 {user.currency.toLocaleString()}</span>
                          </td>
                          <td className="col-special">
                            <span className="special-amount">⭐ {user.specialCurrency.toLocaleString()}</span>
                          </td>
                          <td className="col-role">
                            <span className={`role-badge role-${user.role}`}>{user.role}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Amount and Actions */}
              <div className="currency-manager-section">
                <label>
                  Adjustment Amount
                  <input
                    type="number"
                    value={amountValue}
                    onChange={(e) => setAmount(e.target.value === "" ? "" : Math.abs(Number(e.target.value)))}
                    placeholder="Enter amount"
                    min="0"
                  />
                </label>

                <div className="currency-manager-actions">
                  <button
                    type="button"
                    onClick={() => handleAdjustCurrency(false)}
                    disabled={loading || selectedCount === 0 || amount === "" || amount === 0}
                    className="currency-manager-btn subtract"
                  >
                    {loading ? "Processing…" : "− Subtract"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustCurrency(true)}
                    disabled={loading || selectedCount === 0 || amount === "" || amount === 0}
                    className="currency-manager-btn add"
                  >
                    {loading ? "Processing…" : "+ Add"}
                  </button>
                </div>
              </div>

              {error && <p className="currency-manager-error">{error}</p>}
            </>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmState?.active && (
        <div className="currency-manager-confirm-backdrop" onClick={cancelConfirm}>
          <div className="currency-manager-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Currency Adjustment</h3>
            <div className="confirm-details">
              <p className="confirm-message">
                Are you sure you want to adjust currency for <strong>{confirmState.users.length}</strong> user(s)?
              </p>
              <div className="confirm-users-list">
                {confirmState.users.map((u) => (
                  <div key={u.id} className="confirm-user-item">
                    <span className="confirm-user-name">{u.username}</span>
                    <span
                      className={`confirm-amount ${confirmState.isAdding ? "add" : "subtract"}`}
                    >
                      {confirmState.isAdding ? "+" : "−"}{confirmState.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                onClick={executeAdjustCurrency}
                className="confirm-btn confirm"
                disabled={loading}
              >
                {loading ? "Processing…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={cancelConfirm}
                className="confirm-btn cancel"
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrencyManager;

