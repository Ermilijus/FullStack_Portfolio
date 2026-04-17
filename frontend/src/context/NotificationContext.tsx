import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type NotificationType = "info" | "success" | "warning" | "error";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  messageNode?: ReactNode; // For rich text content (e.g., colored text)
  durationMs: number;
  createdAt: number;
};

type NotifyOptions = {
  message: string;
  type?: NotificationType;
  title?: string;
  durationMs?: number;
  messageNode?: ReactNode; // For rich text content
};

type NotificationContextType = {
  notifications: AppNotification[];
  notify: (options: NotifyOptions) => string;
  notifySuccess: (message: string, title?: string, durationMs?: number) => string;
  notifyError: (message: string, title?: string, durationMs?: number) => string;
  notifyWarning: (message: string, title?: string, durationMs?: number) => string;
  notifyInfo: (message: string, title?: string, durationMs?: number) => string;
  notifyCurrencyChange: (username: string, amount: number, title?: string, durationMs?: number) => string;
  dismissNotification: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const DEFAULT_TITLES: Record<NotificationType, string> = {
  info: "Notice",
  success: "Success",
  warning: "Warning",
  error: "Error",
};

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  info: 1900,
  success: 1900,
  warning: 2300,
  error: 2800,
};

const createNotificationId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissNotification = useCallback((id: string) => {
    const timerId = timersRef.current.get(id);
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }

    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback(({ message, type = "info", title, durationMs, messageNode }: NotifyOptions) => {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      return "";
    }

    const createdAt = Date.now();
    const id = createNotificationId();
    const resolvedDuration = durationMs ?? DEFAULT_DURATIONS[type];
    const notification: AppNotification = {
      id,
      type,
      title: title?.trim() || DEFAULT_TITLES[type],
      message: normalizedMessage,
      messageNode,
      durationMs: resolvedDuration,
      createdAt,
    };

    setNotifications((current) => {
      const isDuplicate = current.some(
        (entry) => entry.type === notification.type
          && entry.message === notification.message
          && createdAt - entry.createdAt < 1200,
      );

      if (isDuplicate) {
        return current;
      }

      return [...current.slice(-3), notification];
    });

    const timerId = window.setTimeout(() => {
      dismissNotification(id);
    }, resolvedDuration);
    timersRef.current.set(id, timerId);

    return id;
  }, [dismissNotification]);

  const notifySuccess = useCallback(
    (message: string, title?: string, durationMs?: number) => notify({ message, title, durationMs, type: "success" }),
    [notify],
  );

  const notifyError = useCallback(
    (message: string, title?: string, durationMs?: number) => notify({ message, title, durationMs, type: "error" }),
    [notify],
  );

  const notifyWarning = useCallback(
    (message: string, title?: string, durationMs?: number) => notify({ message, title, durationMs, type: "warning" }),
    [notify],
  );

  const notifyInfo = useCallback(
    (message: string, title?: string, durationMs?: number) => notify({ message, title, durationMs, type: "info" }),
    [notify],
  );

  const notifyCurrencyChange = useCallback(
    (username: string, amount: number, title?: string, durationMs?: number) => {
      const isAdded = amount >= 0;
      const sign = isAdded ? "+" : "";
      const color = isAdded ? "#4ade80" : "#ff6b6b"; // green for add, red for subtract
      const message = `${username} had their balance adjusted`;
      const messageNode = (
        <span>
          {username}{" "}
          <span style={{ color }}>
            {sign}{amount}
          </span>
        </span>
      );
      return notify({
        message,
        messageNode,
        title: title || "Currency Updated",
        durationMs,
        type: "info",
      });
    },
    [notify],
  );

  useEffect(() => {
    return () => {
      for (const timerId of timersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo<NotificationContextType>(
    () => ({
      notifications,
      notify,
      notifySuccess,
      notifyError,
      notifyWarning,
      notifyInfo,
      notifyCurrencyChange,
      dismissNotification,
    }),
    [dismissNotification, notifications, notify, notifyError, notifyInfo, notifySuccess, notifyWarning, notifyCurrencyChange],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }

  return context;
};
