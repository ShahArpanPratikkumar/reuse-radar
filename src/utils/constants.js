// =============================================================================
// REUSE RADAR - CONSTANTS & DESIGN SYSTEM (constants.js)
// Purpose: Central registry for all design tokens, category lists, sort options,
//          and filter values used across the entire app.
//          Importing from here (instead of hardcoding) ensures visual consistency
//          and makes design updates easy — change one place, updates everywhere.
// Contents:
//   1. COLORS — Stitch design system color palette (brand greens, badges, neutrals)
//   2. CATEGORIES — Item categories matching server Item model enum
//   3. CATEGORY_ICONS — Emoji icons for each category
//   4. CONDITIONS — Item condition options
//   5. RADIUS_OPTIONS — Nearby search radius choices (km)
//   6. SORT_OPTIONS — Feed sort order options
//   7. DEFAULT_COORDINATES — Default map center (Ahmedabad)
// =============================================================================

// =============================================================================
// 1. COLORS — Stitch Design System Color Palette
// All colors are hex codes from the official Stitch design specification.
// Using constants prevents inconsistent shades across components.
// =============================================================================

export const COLORS = {
  // ── Brand Greens (Primary Palette) ──────────────────────────────────────────
  primary: '#059669',      // Emerald-600: main brand green for buttons and accents
  primaryDark: '#064E3B',  // Forest Dark: used in hero banners, tab bar active, headers
  primaryCard: '#065F46',  // Deep Forest: dark card backgrounds (item type badges)
  primaryLight: '#D1FAE5', // Soft Mint: badge backgrounds, verification tick backgrounds
  primaryMint: '#ECFDF5',  // Super Light Mint: card backgrounds (subtle green tint)
  appBackground: '#F0FDF4', // Master App Background: the lightest mint-white (screens)

  // ── Accents & Lime (Stitch Highlight Colors) ─────────────────────────────────
  limeAccent: '#BEF264',   // Electric Lime: used for primary CTA buttons highlight rings
  limeText: '#14532D',     // Deep Green: text on lime-colored button backgrounds
  limeSoft: '#F7FEE7',     // Soft Lime: very light lime for card highlight sections

  // ── Badge Colors (Status Indicators) ─────────────────────────────────────────
  // Each badge has a background + text color pair for WCAG contrast compliance
  badgeGreenBg: '#DCFCE7',   // Green badge background (available, verified, free)
  badgeGreenText: '#166534', // Green badge text
  badgeAmberBg: '#FEF3C7',   // Amber badge background (borrow, pending, reserved)
  badgeAmberText: '#92400E', // Amber badge text
  badgeBlueBg: '#E0F2FE',    // Blue badge background (sell, information)
  badgeBlueText: '#075985',  // Blue badge text
  badgeGrayBg: '#F3F4F6',    // Gray badge background (inactive, used, expired)
  badgeGrayText: '#4B5563',  // Gray badge text

  // ── Status & Utility Colors ───────────────────────────────────────────────────
  danger: '#EF4444',       // Red-500: error states, delete buttons, offline banner
  dangerLight: '#FEE2E2',  // Light Red: error message backgrounds
  warning: '#F59E0B',      // Amber-500: warning messages, borrow due-soon timer
  success: '#10B981',      // Emerald-500: success toasts, completed status

  // ── Neutrals (Typography & Layout) ───────────────────────────────────────────
  card: '#FFFFFF',          // Pure white: card and modal backgrounds
  textPrimary: '#0F172A',   // Slate-900: main headings and body text
  textSecondary: '#334155', // Slate-700: secondary text, descriptions
  textMuted: '#64748B',     // Slate-500: timestamps, placeholders, metadata
  border: '#E2E8F0',        // Slate-200: borders, dividers, input outlines
  borderLight: '#F1F5F9',   // Slate-100: very light separators
  white: '#FFFFFF',
  black: '#000000',
};

// =============================================================================
// 2. CATEGORIES — Item Category List
// MUST match the 'category' enum in server/models/Item.js and Wishlist.js.
// 'All' is added as the first option for the "show everything" filter.
// =============================================================================

export const CATEGORIES = [
  'All',           // No category filter — show all listings
  'Books',         // Textbooks, novels, study guides
  'Electronics',   // Laptops, phones, calculators, chargers
  'Furniture',     // Chairs, tables, shelves
  'Clothes',       // T-shirts, jackets, formal wear
  'Bags',          // Backpacks, laptop bags, travel bags
  'Cycles',        // Bicycles, cycle accessories
  'Study Material', // Notes, printed materials, stationery
  'Toys',          // Board games, sports equipment, hobby items
  'Household',     // Kitchen items, cleaning supplies, decor
  'Other',         // Anything that doesn't fit the above categories
];

// =============================================================================
// 3. CATEGORY_ICONS — Emoji icons for each category
// Used in filter chips, category selectors, and item cards.
// Key must match CATEGORIES array values exactly.
// =============================================================================

export const CATEGORY_ICONS = {
  All: '✨',
  Books: '📚',
  Electronics: '💻',
  Furniture: '🪑',
  Clothes: '👕',
  Bags: '🎒',
  Cycles: '🚲',
  'Study Material': '📖',
  Toys: '🎮',
  Household: '🏠',
  Other: '📦',
};

// =============================================================================
// 4. CONDITIONS — Item condition options
// MUST match the 'condition' enum in server/models/Item.js
// 'All' added for the "no condition filter" option
// =============================================================================

export const CONDITIONS = ['All', 'Like New', 'Good', 'Excellent', 'Fair', 'Used'];

// =============================================================================
// 5. RADIUS_OPTIONS — Search radius choices for the Explore Radar screen (km)
// Values are in kilometers, displayed as "1 km", "5 km", etc. in filter UI
// =============================================================================

export const RADIUS_OPTIONS = [1, 5, 10, 25];

// =============================================================================
// 6. SORT_OPTIONS — Feed sort order options
// Controls how the item list is ordered in HomeScreen and ExploreScreen
// =============================================================================

export const SORT_OPTIONS = ['Newest', 'Nearest', 'Most Popular'];

// =============================================================================
// 7. DEFAULT_COORDINATES — Default map center when GPS is unavailable
// Set to Ahmedabad, Gujarat (the student's city from the Stitch design)
// Used by ExploreScreen map and as GPS fallback in AddItemScreen
// =============================================================================

export const DEFAULT_COORDINATES = {
  latitude: 23.0225,        // Ahmedabad latitude
  longitude: 72.5714,       // Ahmedabad longitude
  cityName: 'Ahmedabad, Gujarat', // Human-readable city name for display
};
