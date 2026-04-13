import type { CSSProperties } from "react";
import { useNotifications } from "../context/NotificationContext";
import { NOTIFICATION_TYPE_LABELS } from "../config/Config_tuner";

// ✅ TUNING: Type icons are defined in Config_tuner.ts
// Change them there to use ✓, ★, ⚠, etc. instead of i, OK, !, x
const TYPE_LABELS = NOTIFICATION_TYPE_LABELS;

const NotificationViewport = () => {
  const { notifications, dismissNotification } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="app-notification-stack" aria-live="polite" aria-atomic="false">
      {notifications.map((notification) => (
        <article
          key={notification.id}
          className={`app-notification app-notification-${notification.type}`}
          style={{ "--notification-duration": `${notification.durationMs}ms` } as CSSProperties}
        >
          <div className="app-notification-icon" aria-hidden="true">
            {TYPE_LABELS[notification.type]}
          </div>
          <div className="app-notification-copy">
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
          </div>
          <button
            type="button"
            className="app-notification-close"
            onClick={() => dismissNotification(notification.id)}
            aria-label={`Dismiss ${notification.title.toLowerCase()} notification`}
          >
            ×
          </button>
          <span className="app-notification-progress" aria-hidden="true" />
        </article>
      ))}
    </div>
  );
};

export default NotificationViewport;
