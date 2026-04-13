import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  NOTIFICATION_DEFAULT_TITLES,
  NOTIFICATION_DURATIONS,
  NOTIFICATION_BEHAVIORAL,
} from "../config/Config_tuner";

export type NotificationType = "info" | "success" | "warning" | "error";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  durationMs: number;
  createdAt: number;
};

type NotifyOptions = {
  message: string;
  type?: NotificationType;
  title?: string;
  durationMs?: number;
};

type NotificationContextType = {
  notifications: AppNotification[];
  notify: (options: NotifyOptions) => string;
  notifySuccess: (message: string, title?: string, durationMs?: number) => string;
  notifyError: (message: string, title?: string, durationMs?: number) => string;
  notifyWarning: (message: string, title?: string, durationMs?: number) => string;
  notifyInfo: (message: string, title?: string, durationMs?: number) => string;
  dismissNotification: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// ✅ TUNING: All values below are now from Config_tuner.ts
// Edit Config_tuner.ts to adjust durations, titles, behavioral thresholds
const DEFAULT_TITLES = NOTIFICATION_DEFAULT_TITLES;
const DEFAULT_DURATIONS = NOTIFICATION_DURATIONS;
const MAX_CONCURRENT = NOTIFICATION_BEHAVIORAL.maxConcurrentNotifications;
const DEDUP_WINDOW = NOTIFICATION_BEHAVIORAL.deduplicationWindowMs;

const createNotificationId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismissNotification = (id: string) => {
    const timerId = timersRef.current.get(id);
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }

    setNotifications((current) => current.filter((notification) => notification.id !== id));
  };

  const notify = ({ message, type = "info", title, durationMs }: NotifyOptions) => {
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
      durationMs: resolvedDuration,
      createdAt,
    };

    setNotifications((current) => {
      // ✅ DEDUP_WINDOW from Config_tuner.ts (default: 1200ms)
      // Prevents duplicate identical notifications in rapid succession
      const isDuplicate = current.some(
        (entry) => entry.type === notification.type
          && entry.message === notification.message
          && createdAt - entry.createdAt < DEDUP_WINDOW,
      );

      if (isDuplicate) {
        return current;
      }

      // ✅ MAX_CONCURRENT from Config_tuner.ts (default: 4)
      // Keeps only the latest 3 + new one = max 4 visible toasts
      return [...current.slice(-(MAX_CONCURRENT - 1)), notification];
    });

    const timerId = window.setTimeout(() => {
      dismissNotification(id);
    }, resolvedDuration);
    timersRef.current.set(id, timerId);

    return id;
  };

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
      notifySuccess: (message, title, durationMs) => notify({ message, title, durationMs, type: "success" }),
      notifyError: (message, title, durationMs) => notify({ message, title, durationMs, type: "error" }),
      notifyWarning: (message, title, durationMs) => notify({ message, title, durationMs, type: "warning" }),
      notifyInfo: (message, title, durationMs) => notify({ message, title, durationMs, type: "info" }),
      dismissNotification,
    }),
    [notifications],
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
