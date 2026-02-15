export const API_BASE_URL = "http://localhost:3000";
export const PROFILE_EXPORT_ENDPOINT = "/api/profile/export";
export const AUTH_EXTENSION_TOKEN_ENDPOINT = "/api/auth/extension-token";
export const AI_GENERATE_ENDPOINT = "/api/autofill/generate-answer";
export const AI_COVER_LETTER_ENDPOINT = "/api/autofill/generate-cover-letter";
export const AI_BULK_ENDPOINT = "/api/autofill/generate-bulk";
export const AUTOFILL_TRACK_ENDPOINT = "/api/autofill/track";
export const AUTOFILL_USAGE_ENDPOINT = "/api/autofill/usage";
export const CACHE_TTL = 30 * 60 * 1e3;
export const USAGE_CACHE_TTL = 5 * 60 * 1e3;
export const TOKEN_REFRESH_INTERVAL = 15;
export const PROFILE_REFRESH_INTERVAL = 30;
export const MAX_FREE_AUTOFILLS = 10;
export const MAX_FREE_AI_GENERATIONS = 10;
export const MAX_PRO_AI_GENERATIONS = 100;
export const EXTENSION_VERSION = "1.0.0";
export const LOGIN_URL = `${API_BASE_URL}/login?source=extension`;
export const SIGNUP_URL = `${API_BASE_URL}/signup`;
export const SETTINGS_URL = `${API_BASE_URL}/settings`;
export const PRICING_URL = `${API_BASE_URL}/pricing`;
export const DASHBOARD_URL = `${API_BASE_URL}/dashboard`;
export const EXTENSION_CONNECTED_PATH = "/dashboard";
export const STORAGE_KEYS = {
  AUTH: "pmhnp_auth",
  PROFILE: "pmhnp_profile",
  PROFILE_CACHED_AT: "pmhnp_profile_cached_at",
  USAGE: "pmhnp_usage",
  USAGE_CACHED_AT: "pmhnp_usage_cached_at",
  SETTINGS: "pmhnp_settings",
  FAB_POSITION: "pmhnp_fab_position",
  DISMISSED_URLS: "pmhnp_dismissed_urls",
  AUTOFILLED_URLS: "pmhnp_autofilled_urls",
  ERROR_LOG: "pmhnp_error_log"
};
export const ALARM_NAMES = {
  TOKEN_REFRESH: "pmhnp-token-refresh",
  PROFILE_REFRESH: "pmhnp-profile-refresh"
};
export const FILL_DELAYS = {
  fast: 25,
  normal: 50,
  careful: 150
};
export const AI_RESPONSE_LENGTHS = {
  brief: 150,
  standard: 300,
  detailed: 500
};
export const DEFAULT_SETTINGS = {
  autoDetectApplications: true,
  showFAB: true,
  overwriteExistingValues: false,
  fillSpeed: "normal",
  autoOpenReviewSidebar: true,
  useAIForOpenEnded: true,
  aiResponseLength: "standard",
  alwaysReviewAI: true,
  autoAttachResume: true,
  autoAttachOtherDocs: false,
  cacheProfileLocally: true,
  sendAnalytics: true
};
export const US_STATES = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC"
};
export const STATE_ABBREVIATION_TO_NAME = Object.fromEntries(
  Object.entries(US_STATES).map(([name, abbr]) => [abbr, name])
);
