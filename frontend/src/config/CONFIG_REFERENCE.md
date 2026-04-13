/**
 * ============================================================================
 * HOW TO USE: Config_tuner.ts - Quick Reference
 * ============================================================================
 * 
 * Location: frontend/src/config/Config_tuner.ts
 * 
 * ALL global "knobs and dials" for your app are now in ONE place.
 * Instead of hunting through .ts and .css files, tweak values here.
 * 
 * ============================================================================
 * COMMON TWEAKS YOU'LL WANT TO MAKE:
 * ============================================================================
 * 
 * 1️⃣  NOTIFICATION DURATIONS (Auto-dismiss timing)
 *     ──────────────────────────────────────────
 *     Location: NOTIFICATION_DURATIONS
 *     Example: Change error duration from 5600ms to 8000ms if users miss it
 *     
 *     notifyError("Insufficient balance");
 *     // Currently visible for 5.6 seconds, then auto-dismisses
 *     // Tweak NOTIFICATION_DURATIONS.error to change
 * 
 * 
 * 2️⃣  NOTIFICATION ICONS (What symbol appears in the badge)
 *     ─────────────────────────────────────────────────────
 *     Location: NOTIFICATION_TYPE_LABELS
 *     Example: Change from "OK" to "✓" for success notifications
 *     
 *     Current icons: i, OK, !, x
 *     Try also: ℹ, ✓, ✔, ⚠, ★, ✕, ✗, ●, ◆, ◇, ♦
 * 
 * 
 * 3️⃣  NOTIFICATION COLORS (Red = error, Green = success, etc.)
 *     ────────────────────────────────────────────────────────
 *     Location: NOTIFICATION_ACCENT_COLORS (references CSS --theme-variables)
 *     
 *     To change: Edit the CSS variables in frontend/src/styles/theme.css
 *     Example: To make errors orange instead of red:
 *     
 *       // frontend/src/styles/theme.css
 *       :root[data-theme="dark"] {
 *         --text-error: #ff8844;  // was #ff9ca5 (red)
 *       }
 *     
 *     Colors map to:
 *       success → --rarity-common-text (green)
 *       warning → --rarity-legendary-text (gold)
 *       error → --text-error (red)
 *       info → --button-bg (blue)
 * 
 * 
 * 4️⃣  SPAM PREVENTION (Duplicate detection + Max tooltips on screen)
 *     ────────────────────────────────────────────────────────────
 *     Location: NOTIFICATION_BEHAVIORAL
 *     
 *     deduplicationWindowMs: 1200
 *       → If same message appears twice within 1200ms, ignore the 2nd one
 *       → Increase if users report legitimate retries being blocked
 *       → Decrease if you see lots of accidental duplicates
 *     
 *     maxConcurrentNotifications: 4
 *       → Max 4 toasts on screen at once
 *       → Older ones are removed to make room for new ones
 *       → Increase if your app fires many simultaneous messages
 *       → Decrease to reduce clutter on small screens
 * 
 * 
 * 5️⃣  TOAST POSITIONING (Where on screen?)
 *     ────────────────────────────────────
 *     Location: NOTIFICATION_LAYOUT
 *     
 *     stackTopOffsetRem: 1     → 1rem (16px) below header
 *     stackRightOffsetRem: 1   → 1rem (16px) from right edge
 *     
 *     To move to top-LEFT instead of top-RIGHT:
 *       → Change CSS media query in styles.css @media
 *       → Or change stackRightOffsetRem to stackLeftOffsetRem
 *     
 *     To move to bottom-right:
 *       → Add a bottomOffsetRem value here
 *       → Update CSS .app-notification-stack to use bottom: instead of top:
 * 
 * 
 * 6️⃣  ANIMATION SPEEDS (Fade in/out timing)
 *     ──────────────────────────────────────
 *     Location: NOTIFICATION_ANIMATION
 *     
 *     fadeInPercentage: 8        → Toast fully visible at 8% into its duration
 *     fadeOutPercentage: 82      → Toast starts fading at 82% through
 *     
 *     Example: Slower entrance
 *       fadeInPercentage: 20     → Takes longer to reach full opacity
 * 
 * 
 * 7️⃣  TOAST APPEARANCE (Size, padding, corners)
 *     ──────────────────────────────────────────
 *     Location: NOTIFICATION_VISUAL
 *     
 *     borderRadiusPx: 14         → Corner roundedness (try 4 for sharp, 24 for pill)
 *     iconSizeRem: 1.9           → Badge circle diameter
 *     closeButtonSizeRem: 1.7    → Dismiss (×) button size
 *     progressBarHeightRem: 0.1875 → Bottom progress bar thickness
 * 
 * 
 * ============================================================================
 * WHERE CONFIG VALUES ARE USED:
 * ============================================================================
 * 
 * TypeScript Files:
 *   NotificationContext.tsx
 *     → Imports: NOTIFICATION_DURATIONS, NOTIFICATION_DEFAULT_TITLES,
 *                NOTIFICATION_BEHAVIORAL
 *     → Controls: auto-dismiss timers, default text, dedup window, max count
 *   
 *   NotificationViewport.tsx
 *     → Imports: NOTIFICATION_TYPE_LABELS
 *     → Controls: icon text in badge (i, OK, !, x)
 * 
 * CSS Files:
 *   styles.css (hardcoded values, but documented with comments)
 *     → Positioned via Config_tuner values in comments
 *     → Colors via CSS theme variables (which you can also tweak)
 * 
 * All Pages: (Profile.tsx, Market.tsx, Lootbox.tsx, Admin.tsx, etc.)
 *     → Call: notifySuccess(), notifyError(), notifyWarning(), notifyInfo()
 *     → These use NOTIFICATION_DURATIONS + NOTIFICATION_BEHAVIORAL
 * 
 * 
 * ============================================================================
 * WORKFLOW: Making a Change
 * ============================================================================
 * 
 * Example: Users say error messages disappear too fast. Make them visible longer.
 * 
 * 1. Open: frontend/src/config/Config_tuner.ts
 * 
 * 2. Find: NOTIFICATION_DURATIONS = { ... error: 5600, ... }
 * 
 * 3. Change:   error: 5600,    →    error: 8000,
 *    (from 5.6 seconds to 8 seconds)
 * 
 * 4. Save file
 * 
 * 5. Run: npm run build (from frontend directory)
 * 
 * 6. Restart dev server or reload browser
 * 
 * 7. Test: Trigger an error notification and confirm it stays longer
 * 
 * 
 * ============================================================================
 * WHY CENTRALIZE CONFIGURATION?
 * ============================================================================
 * 
 * ❌ BEFORE (scattered hardcoded values):
 *    - Notification timing in NotificationContext.tsx
 *    - Styling in styles.css
 *    - Icons in NotificationViewport.tsx
 *    - Colors in CSS theme variables
 *    → If you want to tweak "how long errors stay", you visit 3+ files
 *    → Inconsistencies emerge: different UI values in different places
 * 
 * ✅ AFTER (everything in one Config_tuner.ts):
 *    - All tunables in one place with extensive comments
 *    - You know EXACTLY what affects what
 *    - No more hunting through code
 *    - Easy to document "why this value"
 *    - Easy to add feature flags or A/B test values
 * 
 * 
 * ============================================================================
 * FUTURE ENHANCEMENTS:
 * ============================================================================
 * 
 * You can extend Config_tuner.ts to include:
 *   - Feature flags (enable/disable toast animations)
 *   - Environment-specific configs (dev vs prod durations)
 *   - User preference overrides (dark mode, high contrast)
 *   - A/B test configuration (different designs for different users)
 *   - Locale-specific strings (multilingual default titles)
 * 
 * Example structure:
 * 
 *   export const FEATURE_FLAGS = {
 *     enableToastAnimations: true,
 *     enableAutoGrouping: false,
 *   };
 *   
 *   export const ENV_CONFIG = {
 *     development: { ... longer durations for testing },
 *     production: { ... shorter durations in production },
 *   };
 * 
 * 
 * ============================================================================
 */
