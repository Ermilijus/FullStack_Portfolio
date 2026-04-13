/**
 * ============================================================================
 * GLOBAL APPLICATION CONFIG TUNER
 * ============================================================================
 * 
 * This is the SINGLE SOURCE OF TRUTH for all global, tunable configuration
 * across the entire frontend application. Instead of hunting through TypeScript
 * files and CSS, modify values here to control:
 * 
 *   • Notification timing (auto-dismiss durations by severity)
 *   • Notification colors & styling (type-specific accent colors)
 *   • Notification positioning & layout (stack position, max width, gaps)
 *   • Animation speeds & curves (fade, scale, progress bar)
 *   • UI dimensions (icon sizes, padding, button sizes)
 *   • Behavioral thresholds (max concurrent toasts, dedup window)
 * 
 * Each tunable is grouped by feature/system and includes:
 *   - WHAT it controls
 *   - WHERE it's used (files + line references)
 *   - WHY you might tweak it
 *   - UNITS it expects
 * 
 * ============================================================================
 */

// ===========================================================================
// NOTIFICATIONS: Timing & Auto-Dismiss Durations
// ===========================================================================
/**
 * How long (in milliseconds) each notification type displays before auto-dismissing.
 * User can manually dismiss any toast by clicking the × button anytime.
 * 
 * WHERE USED:
 *   - NotificationContext.tsx: DEFAULT_DURATIONS dict, notify() method
 *   - Passed to CSS animation via CSS custom property --notification-duration
 *   - All pages calling: notifySuccess(), notifyError(), notifyWarning(), notifyInfo()
 * 
 * UNITS: milliseconds (1000 = 1 second)
 * 
 * TWEAKING GUIDE:
 *   - Increase if users complain messages disappear too fast
 *   - Decrease if stack gets crowded with old messages
 *   - Error duration should be longest (most important)
 *   - Info duration can be shortest (least critical)
 */
export const NOTIFICATION_DURATIONS = {
  /** Info messages (neutral status updates) - visible for 3.8 seconds */
  info: 3800,
  
  /** Success messages (operations completed) - visible for 3.8 seconds */
  success: 3800,
  
  /** Warning messages (user should review action) - visible for 4.6 seconds */
  warning: 4600,
  
  /** Error messages (action failed, user needs to re-act) - visible for 5.6 seconds */
  error: 5600,
} as const;

// ===========================================================================
// NOTIFICATIONS: Color & Type Styling (Severity-Based)
// ===========================================================================
/**
 * Color scheme for notification types. These reference CSS theme variables
 * that are defined in frontend/src/styles/theme.css
 * 
 * The "accent color" (left 4px border) communicates severity at a glance:
 *   Green (success) = good, action completed
 *   Gold (warning) = caution, review recommended
 *   Red (error) = bad, action failed
 *   Blue (info) = neutral, just informing
 * 
 * WHERE USED:
 *   - styles.css: .app-notification-{type}::before { background: color(N) }
 *   - Uses CSS variables from theme.css (--rarity-common-text, --text-error, etc.)
 * 
 * REFERENCE MAP (update if theme variables change):
 *   success → --rarity-common-text (bright green)
 *   warning → --rarity-legendary-text (bright gold)
 *   error → --text-error (bright red/pink)
 *   info → --button-bg (blue, default button color)
 * 
 * TWEAKING GUIDE:
 *   - To change a color, update the corresponding CSS variable in theme.css
 *   - Example: To make errors orange instead of red, edit --text-error in theme.css
 */
export const NOTIFICATION_ACCENT_COLORS = {
  info: "var(--button-bg)",              // Blue accent
  success: "var(--rarity-common-text)",  // Green accent
  warning: "var(--rarity-legendary-text)", // Gold accent
  error: "var(--text-error)",            // Red accent
} as const;

// ===========================================================================
// NOTIFICATIONS: Icon Labels (Type Indicator)
// ===========================================================================
/**
 * Single-character icon shown in the circular badge for each notification type.
 * These are simple ASCII symbols visible at any zoom level.
 * 
 * WHERE USED:
 *   - NotificationViewport.tsx: TYPE_LABELS dict, rendered in .app-notification-icon
 * 
 * TWEAKING GUIDE:
 *   - Change to any single character: ✓, ★, ⚠, etc. (emoji works too)
 *   - Keep it 1 character to fit in the 1.9rem circular badge
 *   - Examples:
 *     info: "ℹ" or "i"
 *     success: "✓" or "✔" or "OK"
 *     warning: "⚠" or "!"
 *     error: "✕" or "✗" or "x"
 */
export const NOTIFICATION_TYPE_LABELS = {
  info: "i",
  success: "OK",
  warning: "!",
  error: "x",
} as const;

// ===========================================================================
// NOTIFICATIONS: Default Titles (Fallback Labels)
// ===========================================================================
/**
 * Default title shown when calling notify methods without explicit title.
 * Example: notifySuccess("Item added") uses title "Success"
 * Can be overridden per-notification: notifySuccess("msg", "Custom Title")
 * 
 * WHERE USED:
 *   - NotificationContext.tsx: DEFAULT_TITLES dict, notify() fallback
 *   - Displayed as <strong> in .app-notification-copy
 * 
 * TWEAKING GUIDE:
 *   - Change to match your app's tone/branding
 *   - Custom pages can pass explicit titles: notifyError(msg, "Upload Error")
 */
export const NOTIFICATION_DEFAULT_TITLES = {
  info: "Notice",
  success: "Success",
  warning: "Warning",
  error: "Error",
} as const;

// ===========================================================================
// NOTIFICATIONS: Behavioral Thresholds
// ===========================================================================
/**
 * Control how aggressively the notification system prevents spam and limits memory.
 * 
 * MAX_CONCURRENT_NOTIFICATIONS:
 *   - Maximum number of toasts shown simultaneously on screen
 *   - When exceeded, oldest toast is removed to make room
 *   - WHERE USED: NotificationContext.tsx line ~95 (keeps last N notifications)
 *   - TWEAKING: Set to 3-6. Higher = more clutter on small screens, lower = messages lost
 * 
 * DEDUPLICATION_WINDOW_MS:
 *   - Identical message+type combos are ignored if they occur within this window
 *   - Prevents accidental duplicate toasts from rapid clicks or network retries
 *   - WHERE USED: NotificationContext.tsx isDuplicate check, line ~86
 *   - TWEAKING: Increase if users reopen the same dialog and trigger same error twice
 *               Decrease if dedup window is too aggressive (ignores legitimate retries)
 */
export const NOTIFICATION_BEHAVIORAL = {
  /** Maximum toasts on screen simultaneously (older ones removed when exceeded) */
  maxConcurrentNotifications: 4,

  /** Duplicate message suppression window in milliseconds */
  deduplicationWindowMs: 1200,
} as const;

// ===========================================================================
// NOTIFICATIONS: Layout & Positioning
// ===========================================================================
/**
 * Controls where the notification stack appears and how big it is.
 * 
 * WHERE USED:
 *   - styles.css: .app-notification-stack { position, top, right, width, gap }
 *   - Animates from top-right corner, doesn't block main content
 * 
 * Stack position is relative to app-header height (72px) + 1rem spacing.
 * On mobile (<900px), width auto-narrows and position adjusts.
 * 
 * TWEAKING GUIDE:
 *   - stackTopOffsetRem: gap above header (1rem = ~16px)
 *   - stackRightOffsetRem: gap from right edge (1rem = ~16px)
 *   - maxWidthRem: max width of stack (360px ~= 22.5rem)
 *   - Change to move toast elsewhere (e.g., bottom-left for alt layout)
 */
export const NOTIFICATION_LAYOUT = {
  /** Vertical offset below app header (in rem units). Header is 72px. */
  stackTopOffsetRem: 1,

  /** Horizontal offset from right edge of viewport (in rem units) */
  stackRightOffsetRem: 1,

  /** Maximum width of notification stack (narrows on mobile) */
  maxWidthRem: 22.5, // ~360px at default 16px font-size

  /** Gap between stacked notifications (in rem units) */
  stackGapRem: 0.75,

  /** Z-index for notification stack (ensure above modals but below system UI) */
  zIndex: 220,
} as const;

// ===========================================================================
// NOTIFICATIONS: Visual Styling (Border Radius, Padding, Shadows)
// ===========================================================================
/**
 * Fine-grained control over toast appearance and spacing.
 * 
 * WHERE USED:
 *   - styles.css: .app-notification { padding, border-radius, box-shadow, gap }
 *   - .app-notification-icon { border-radius }
 *   - .app-notification-close { border-radius, padding, width, height }
 *   - .app-notification-progress { height }
 * 
 * TWEAKING GUIDE:
 *   - Increase borderRadiusPx for more rounded corners (pill vs rounded-square)
 *   - Adjust paddingRem for compact vs spacious feel
 *   - Tweak iconSizeRem to make badge larger/smaller
 *   - Change progressBarHeightPx for thicker/thinner progress bar
 */
export const NOTIFICATION_VISUAL = {
  /** Radius of toast card corners (rem units) */
  borderRadiusPx: 14,

  /** Internal padding of toast card (rem units) */
  paddingTopRem: 0.9,
  paddingBottomRem: 0.95,
  paddingLeftRem: 0.95,
  paddingRightRem: 0.95,

  /** Spacing between icon/copy/close button (rem units) */
  contentGapRem: 0.8,

  /** Size of circular icon badge (rem units) */
  iconSizeRem: 1.9,

  /** Font size of type icon (rem units) */
  iconFontSizeRem: 0.72,

  /** Size of close button (rem units) */
  closeButtonSizeRem: 1.7,

  /** Progress bar thickness at bottom of toast (rem units) */
  progressBarHeightRem: 0.1875, // 3px at 16px base

  /** Width of left accent border (px) */
  accentBorderWidthPx: 4,

  /** Box shadow blur radius (px) */
  shadowBlurPx: 32,

  /** Box shadow offset Y (px) */
  shadowOffsetYPx: 14,

  /** Backdrop blur effect (px) */
  backdropBlurPx: 14,
} as const;

// ===========================================================================
// NOTIFICATIONS: Typography
// ===========================================================================
/**
 * Font sizing for different text layers in toasts.
 * 
 * WHERE USED:
 *   - styles.css: .app-notification-icon { font-size }
 *   - styles.css: .app-notification-copy strong { font-size } (title)
 *   - styles.css: .app-notification-copy p { font-size } (message)
 * 
 * TWEAKING GUIDE:
 *   - Increase if text is hard to read
 *   - Decrease if toast feels cramped on small screens
 *   - Line heights are set separately in CSS for proper vertical rhythm
 */
export const NOTIFICATION_TYPOGRAPHY = {
  /** Title strength (strong tag, top line of copy) - rem units */
  titleSizeRem: 0.88,

  /** Message body text (bottom line of copy) - rem units */
  messageSizeRem: 0.82,

  /** Icon label font size (i, OK, !, x) - rem units */
  iconLabelSizeRem: 0.72,
} as const;

// ===========================================================================
// NOTIFICATIONS: Animation Timing
// ===========================================================================
/**
 * Controls how toasts fade in/out and progress bars animate.
 * 
 * WHERE USED:
 *   - styles.css: @keyframes notification-life { ... } (toast fade)
 *   - styles.css: @keyframes notification-progress { ... } (bar animation)
 *   - CSS animations use --notification-duration from notification object
 * 
 * KEYFRAME PERCENTAGES (in notification-life keyframe):
 *   0%: Toast invisible, scaled down (entry state)
 *   8%: Toast fully visible, normal scale (holds until 82%)
 *   82%: Still visible, about to fade out
 *   100%: Toast invisible, final scale (exit state)
 * 
 * TWEAKING GUIDE:
 *   - Increase fadeInPercentage to show toast longer at full opacity before fading
 *   - Decrease fadeOutPercentage to start fade earlier
 *   - Adjust initialScalePercent / finalScalePercent for entrance/exit animation feel
 *   - Durations are per-type in NOTIFICATION_DURATIONS (not here)
 */
export const NOTIFICATION_ANIMATION = {
  /** Percentage of animation duration for fade-in to complete (0-100) */
  fadeInPercentage: 8,

  /** Percentage of animation duration where fade-out begins (0-100) */
  fadeOutPercentage: 82,

  /** Initial scale of toast as it enters (1.0 = normal size) */
  initialScalePercent: 0.98,

  /** Scale of toast at full visibility (peak of entrance) */
  peakScalePercent: 1.0,

  /** Final scale of toast as it exits (1.0 = normal size) */
  finalScalePercent: 0.985,

  /** Initial Y position offset as it enters (px, negative = up) */
  initialTranslateYPx: -10,

  /** Y position at full visibility (px) */
  peakTranslateYPx: 0,

  /** Final Y position as it exits (px, negative = up) */
  finalTranslateYPx: -6,
} as const;

// ===========================================================================
// NOTIFICATIONS: Responsive Breakpoints
// ===========================================================================
/**
 * When viewport width drops below a threshold, notifications adjust layout.
 * 
 * WHERE USED:
 *   - styles.css: @media (max-width: 900px) { .app-notification-stack { ... } }
 *   - Triggers narrower width, centered positioning on small devices
 * 
 * TWEAKING GUIDE:
 *   - Increase breakpoint if mobile users complain about width
 *   - Modify CSS media query if you want different breakpoint
 */
export const NOTIFICATION_RESPONSIVE = {
  /** Viewport width below which stack narrows and centers (px) */
  mobileBreakpointPx: 900,
} as const;

// ===========================================================================
// GLOBAL: App Shell & Layout
// ===========================================================================
/**
 * General application layout dimensions and spacing used across all pages.
 * 
 * WHERE USED:
 *   - styles.css: :root { --app-header-height, --layout-page-max, etc. }
 *   - Notifications use --app-header-height to position stack below header
 * 
 * TWEAKING GUIDE:
 *   - Increase headerHeightPx if header content needs more room
 *   - Adjust maxPageWidth for narrower/wider layouts
 */
export const GLOBAL_LAYOUT = {
  /** App header fixed height (must match CSS :root --app-header-height) */
  headerHeightPx: 72,

  /** Maximum content width for pages (rem units) */
  maxPageWidthRem: 95, // ~1520px at 16px base
} as const;

// ===========================================================================
// EXPORT ALL CONFIG AS SINGLE OBJECT (for reference)
// ===========================================================================
/**
 * Convenience export grouping all config sections.
 * Use individual imports for better tree-shaking.
 * 
 * Example usage:
 *   import { NOTIFICATION_DURATIONS } from '@/config/Config_tuner';
 *   const duration = NOTIFICATION_DURATIONS.error;
 * 
 * Or aggregate:
 *   import * as Config from '@/config/Config_tuner';
 *   const duration = Config.NOTIFICATION_DURATIONS.error;
 */
export const APP_CONFIG = {
  notifications: {
    durations: NOTIFICATION_DURATIONS,
    accentColors: NOTIFICATION_ACCENT_COLORS,
    typeLabels: NOTIFICATION_TYPE_LABELS,
    defaultTitles: NOTIFICATION_DEFAULT_TITLES,
    behavioral: NOTIFICATION_BEHAVIORAL,
    layout: NOTIFICATION_LAYOUT,
    visual: NOTIFICATION_VISUAL,
    typography: NOTIFICATION_TYPOGRAPHY,
    animation: NOTIFICATION_ANIMATION,
    responsive: NOTIFICATION_RESPONSIVE,
  },
  global: {
    layout: GLOBAL_LAYOUT,
  },
} as const;
