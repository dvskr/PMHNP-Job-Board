/**
 * City Data Types for pSEO Pages
 * 
 * Comprehensive type definitions for the ~3,200 US cities
 * that underpin the 50K programmatic page strategy.
 */

export interface CityData {
  /** City name, e.g., "New York" */
  name: string;
  /** Full state name, e.g., "New York" */
  state: string;
  /** State abbreviation, e.g., "NY" */
  stateCode: string;
  /** URL slug: "new-york-ny" */
  slug: string;
  /** 2020 Census population */
  population: number;
  /** Cost of living index (national avg = 100) */
  costOfLivingIndex: number;
  /** Latitude */
  lat: number;
  /** Longitude */
  lng: number;
  /** Metro area name (MSA), e.g., "New York-Newark-Jersey City" */
  metroArea: string | null;
  /** Whether this area has a Health Professional Shortage Area designation */
  mentalHealthShortage: boolean;
  /** Major healthcare systems / behavioral health employers in the area */
  healthcareSystems: string[];
  /** Nearby city slugs for cross-linking */
  nearbyCities: string[];
  /** Estimated psychiatrist-to-population ratio category */
  providerRatio: 'critical' | 'low' | 'moderate' | 'adequate';
  /** Median household income */
  medianIncome: number;
  /** Population rank within state (1 = largest) */
  stateRank: number;
}

export interface MetroArea {
  /** Metro area name */
  name: string;
  /** URL slug */
  slug: string;
  /** Constituent city slugs */
  cities: string[];
  /** Total metro population */
  population: number;
  /** Primary state(s) */
  states: string[];
}
