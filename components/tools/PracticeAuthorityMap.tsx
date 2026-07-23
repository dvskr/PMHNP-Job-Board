'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, MousePointerClick } from 'lucide-react';
import {
    STATE_PRACTICE_AUTHORITY,
    getStatesByAuthority,
    getAuthorityColor,
    getAuthorityLabel,
    type PracticeAuthority,
} from '@/lib/state-practice-authority';

/* ═══ Clay design tokens (match app/salary-guide/page.tsx) ═══ */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

/**
 * Square-tile cartogram coordinates — the classic 12-column US tile grid
 * (NPR/538-style layout). Pure presentation data: which cell each state
 * occupies. All authority data comes from lib/state-practice-authority.ts.
 *
 * Array order is reading order (row-by-row, left-to-right) — Home/End and
 * the roving tabindex rely on that.
 */
interface TileDef {
    name: string;
    abbr: string;
    col: number;
    row: number;
}

const TILE_GRID: readonly TileDef[] = [
    // Row 1
    { name: 'Alaska', abbr: 'AK', col: 1, row: 1 },
    { name: 'Maine', abbr: 'ME', col: 12, row: 1 },
    // Row 2
    { name: 'Vermont', abbr: 'VT', col: 11, row: 2 },
    { name: 'New Hampshire', abbr: 'NH', col: 12, row: 2 },
    // Row 3
    { name: 'Washington', abbr: 'WA', col: 1, row: 3 },
    { name: 'Idaho', abbr: 'ID', col: 2, row: 3 },
    { name: 'Montana', abbr: 'MT', col: 3, row: 3 },
    { name: 'North Dakota', abbr: 'ND', col: 4, row: 3 },
    { name: 'Minnesota', abbr: 'MN', col: 5, row: 3 },
    { name: 'Illinois', abbr: 'IL', col: 6, row: 3 },
    { name: 'Wisconsin', abbr: 'WI', col: 7, row: 3 },
    { name: 'Michigan', abbr: 'MI', col: 9, row: 3 },
    { name: 'New York', abbr: 'NY', col: 10, row: 3 },
    { name: 'Massachusetts', abbr: 'MA', col: 11, row: 3 },
    // Row 4
    { name: 'Oregon', abbr: 'OR', col: 1, row: 4 },
    { name: 'Nevada', abbr: 'NV', col: 2, row: 4 },
    { name: 'Wyoming', abbr: 'WY', col: 3, row: 4 },
    { name: 'South Dakota', abbr: 'SD', col: 4, row: 4 },
    { name: 'Iowa', abbr: 'IA', col: 5, row: 4 },
    { name: 'Indiana', abbr: 'IN', col: 6, row: 4 },
    { name: 'Ohio', abbr: 'OH', col: 7, row: 4 },
    { name: 'Pennsylvania', abbr: 'PA', col: 9, row: 4 },
    { name: 'New Jersey', abbr: 'NJ', col: 10, row: 4 },
    { name: 'Connecticut', abbr: 'CT', col: 11, row: 4 },
    { name: 'Rhode Island', abbr: 'RI', col: 12, row: 4 },
    // Row 5
    { name: 'California', abbr: 'CA', col: 1, row: 5 },
    { name: 'Utah', abbr: 'UT', col: 2, row: 5 },
    { name: 'Colorado', abbr: 'CO', col: 3, row: 5 },
    { name: 'Nebraska', abbr: 'NE', col: 4, row: 5 },
    { name: 'Missouri', abbr: 'MO', col: 5, row: 5 },
    { name: 'Kentucky', abbr: 'KY', col: 6, row: 5 },
    { name: 'West Virginia', abbr: 'WV', col: 7, row: 5 },
    { name: 'Virginia', abbr: 'VA', col: 8, row: 5 },
    { name: 'Maryland', abbr: 'MD', col: 9, row: 5 },
    { name: 'Delaware', abbr: 'DE', col: 10, row: 5 },
    // Row 6
    { name: 'Arizona', abbr: 'AZ', col: 2, row: 6 },
    { name: 'New Mexico', abbr: 'NM', col: 3, row: 6 },
    { name: 'Kansas', abbr: 'KS', col: 4, row: 6 },
    { name: 'Arkansas', abbr: 'AR', col: 5, row: 6 },
    { name: 'Tennessee', abbr: 'TN', col: 6, row: 6 },
    { name: 'North Carolina', abbr: 'NC', col: 7, row: 6 },
    { name: 'South Carolina', abbr: 'SC', col: 8, row: 6 },
    { name: 'District of Columbia', abbr: 'DC', col: 9, row: 6 },
    // Row 7
    { name: 'Oklahoma', abbr: 'OK', col: 4, row: 7 },
    { name: 'Louisiana', abbr: 'LA', col: 5, row: 7 },
    { name: 'Mississippi', abbr: 'MS', col: 6, row: 7 },
    { name: 'Alabama', abbr: 'AL', col: 7, row: 7 },
    { name: 'Georgia', abbr: 'GA', col: 8, row: 7 },
    // Row 8
    { name: 'Hawaii', abbr: 'HI', col: 1, row: 8 },
    { name: 'Texas', abbr: 'TX', col: 4, row: 8 },
    { name: 'Florida', abbr: 'FL', col: 9, row: 8 },
];

const MAX_ROW = 8;

/** One-sentence meaning per authority level — derived from the level itself. */
const LEVEL_MEANING: Record<PracticeAuthority, string> = {
    full: 'PMHNPs can evaluate patients, diagnose, and prescribe medications independently, with no physician oversight or collaborative agreement required.',
    reduced: 'PMHNPs must maintain a collaborative agreement with a physician to practice and prescribe.',
    restricted: 'PMHNPs must practice under physician supervision or a supervisory protocol.',
};

/**
 * Local tile/legend styling per level. Deliberately NOT the pastel badge
 * palette from getAuthorityColor (still used for the detail-panel badge):
 * tiles need clearly separated fills PLUS a non-color signal so the three
 * levels stay distinguishable for color-blind users —
 *   full       → emerald fill, solid 2px emerald border
 *   reduced    → amber fill,   DASHED 2px amber border (unique border style)
 *   restricted → darker red fill, solid 2px red border (unique fill depth)
 */
const LEVEL_TILE_STYLE: Record<PracticeAuthority, React.CSSProperties> = {
    full: { background: '#A7F3D0', color: '#065F46', border: '2px solid #047857' },
    reduced: { background: '#FDE68A', color: '#78350F', border: '2px dashed #B45309' },
    restricted: { background: '#FCA5A5', color: '#7F1D1D', border: '2px solid #B91C1C' },
};

const AUTHORITY_LEVELS: readonly PracticeAuthority[] = ['full', 'reduced', 'restricted'];

function toSlug(stateName: string): string {
    return stateName.toLowerCase().replace(/\s+/g, '-');
}

/** Index of the tile in `row` whose column is nearest to `targetCol`. */
function nearestInRow(row: number, targetCol: number): number | null {
    const candidates = TILE_GRID
        .map((tile, index) => ({ tile, index }))
        .filter(({ tile }) => tile.row === row);
    if (candidates.length === 0) return null;
    const best = candidates.reduce((a, b) =>
        Math.abs(b.tile.col - targetCol) < Math.abs(a.tile.col - targetCol) ? b : a
    );
    return best.index;
}

/** Roving-tabindex navigation over TILE_GRID coordinates. */
function getNavigationTarget(currentIndex: number, key: string): number | null {
    const current = TILE_GRID[currentIndex];
    if (key === 'Home') return 0;
    if (key === 'End') return TILE_GRID.length - 1;
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const direction = key === 'ArrowLeft' ? -1 : 1;
        const sameRow = TILE_GRID
            .map((tile, index) => ({ tile, index }))
            .filter(({ tile }) => tile.row === current.row && Math.sign(tile.col - current.col) === direction);
        if (sameRow.length === 0) return null;
        const best = sameRow.reduce((a, b) =>
            Math.abs(b.tile.col - current.col) < Math.abs(a.tile.col - current.col) ? b : a
        );
        return best.index;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
        const direction = key === 'ArrowUp' ? -1 : 1;
        for (let row = current.row + direction; row >= 1 && row <= MAX_ROW; row += direction) {
            const target = nearestInRow(row, current.col);
            if (target !== null) return target;
        }
        return null;
    }
    return null;
}

interface PracticeAuthorityMapProps {
    /** State names with ≥1 published job — /jobs/state/{slug} 404s otherwise. */
    statesWithJobs: readonly string[];
    /** State names with ≥1 published job carrying salary data — /salary-guide/{slug} 404s otherwise. */
    statesWithSalaryData: readonly string[];
}

export default function PracticeAuthorityMap({ statesWithJobs, statesWithSalaryData }: PracticeAuthorityMapProps) {
    const [selectedState, setSelectedState] = useState<string | null>(null);
    const [focusIndex, setFocusIndex] = useState(0);
    const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const selectedInfo = selectedState ? STATE_PRACTICE_AUTHORITY[selectedState] : null;
    const selectedColors = selectedInfo ? getAuthorityColor(selectedInfo.authority) : null;
    const selectedSlug = selectedState ? toSlug(selectedState) : null;
    const selectedHasJobs = selectedState !== null && statesWithJobs.includes(selectedState);
    const selectedHasSalary = selectedState !== null && statesWithSalaryData.includes(selectedState);

    const handleTileKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        const target = getNavigationTarget(index, event.key);
        if (target === null) return;
        event.preventDefault();
        setFocusIndex(target);
        tileRefs.current[target]?.focus();
    };

    const handleTileClick = (tileName: string, index: number) => {
        setFocusIndex(index);
        setSelectedState((prev) => (prev === tileName ? null : tileName));
    };

    return (
        <div className="pa-map-layout">
            {/* ── Tile map + legend ── */}
            <div style={{ minWidth: 0 }}>
                {/* Scroll container: on narrow viewports the MAP pans horizontally
                    (min-width keeps tiles ≥ ~40px tap targets) — the page never
                    scrolls sideways. On wider screens the grid stays fluid. */}
                <div className="pa-map-scroll">
                    <div
                        role="group"
                        aria-label="United States practice authority tile map. Use arrow keys to move between states; press Enter or Space to select."
                        className="pa-tile-grid"
                    >
                        {TILE_GRID.map((tile, index) => {
                            const info = STATE_PRACTICE_AUTHORITY[tile.name];
                            if (!info) return null;
                            const isSelected = selectedState === tile.name;
                            return (
                                <button
                                    key={tile.name}
                                    ref={(el) => { tileRefs.current[index] = el; }}
                                    type="button"
                                    tabIndex={index === focusIndex ? 0 : -1}
                                    onClick={() => handleTileClick(tile.name, index)}
                                    onKeyDown={(event) => handleTileKeyDown(event, index)}
                                    aria-label={`${tile.name}, ${getAuthorityLabel(info.authority)}`}
                                    aria-pressed={isSelected}
                                    className="pa-tile"
                                    style={{
                                        ...LEVEL_TILE_STYLE[info.authority],
                                        gridColumn: tile.col,
                                        gridRow: tile.row,
                                    }}
                                >
                                    {tile.abbr}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Legend — mirrors the tile treatment (fill + border style),
                    so the pattern is taught, not just the hue. */}
                <div className="pa-legend">
                    {AUTHORITY_LEVELS.map((level) => {
                        const count = getStatesByAuthority(level).length;
                        return (
                            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                    aria-hidden="true"
                                    style={{
                                        ...LEVEL_TILE_STYLE[level],
                                        width: '18px', height: '18px', borderRadius: '5px',
                                        display: 'inline-block', flexShrink: 0,
                                        boxShadow: 'inset 1px 1px 1px rgba(255,255,255,0.6)',
                                    }}
                                />
                                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#5A4A42' }}>
                                    {getAuthorityLabel(level)}
                                    <span style={{ color: '#94A3B8', fontWeight: 500 }}> · {count}</span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Detail panel ── */}
            <aside aria-live="polite" style={{ minWidth: 0 }}>
                {selectedState && selectedInfo && selectedColors && selectedSlug ? (
                    <div style={{ ...clayCard, padding: '24px 22px' }}>
                        <h3
                            style={{
                                fontFamily: 'var(--font-lora), Georgia, serif',
                                fontSize: '22px', fontWeight: 800, color: '#1A2E35', margin: '0 0 10px',
                            }}
                        >
                            {selectedState}
                        </h3>
                        <span
                            className={`${selectedColors.bg} ${selectedColors.text} ${selectedColors.border}`}
                            style={{
                                display: 'inline-flex', alignItems: 'center',
                                padding: '4px 12px', borderRadius: '999px',
                                borderWidth: '1px', borderStyle: 'solid',
                                fontSize: '12px', fontWeight: 700,
                            }}
                        >
                            {selectedInfo.description}
                        </span>
                        <p style={{ fontSize: '13.5px', color: '#5A4A42', lineHeight: 1.65, margin: '14px 0 0' }}>
                            {LEVEL_MEANING[selectedInfo.authority]}
                        </p>
                        <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6, margin: '10px 0 18px' }}>
                            {selectedInfo.details}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {selectedHasJobs ? (
                                <Link
                                    href={`/jobs/state/${selectedSlug}`}
                                    className="pa-panel-link-primary"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        padding: '11px 18px', borderRadius: '12px',
                                        background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                                        fontSize: '13.5px', fontWeight: 700, textDecoration: 'none',
                                        boxShadow: '4px 4px 12px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                                    }}
                                >
                                    View {selectedState} PMHNP Jobs <ArrowUpRight size={14} />
                                </Link>
                            ) : (
                                <p
                                    style={{
                                        margin: 0, padding: '11px 16px', borderRadius: '12px',
                                        background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)',
                                        fontSize: '12.5px', color: '#64748B', lineHeight: 1.5, textAlign: 'center',
                                    }}
                                >
                                    No active {selectedState} openings right now. Check back soon.
                                </p>
                            )}
                            {selectedHasSalary && (
                                <Link
                                    href={`/salary-guide/${selectedSlug}`}
                                    className="pa-panel-link-secondary"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        padding: '11px 18px', borderRadius: '12px',
                                        background: '#fff', color: '#1A2E35',
                                        fontSize: '13.5px', fontWeight: 600, textDecoration: 'none',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                        boxShadow: '2px 2px 6px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    {selectedState} Salary Guide <ArrowUpRight size={14} />
                                </Link>
                            )}
                        </div>
                    </div>
                ) : (
                    <div
                        style={{
                            ...clayCard, padding: '28px 22px', textAlign: 'center',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                        }}
                    >
                        <span
                            style={{
                                width: '44px', height: '44px', borderRadius: '14px',
                                background: '#F0FDFA', border: '1px solid #99F6E4',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <MousePointerClick size={20} color="#0D9488" />
                        </span>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', margin: 0 }}>
                            Select a state
                        </p>
                        <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.6, margin: 0 }}>
                            Click, tap, or use the arrow keys to pick a state tile and see its
                            practice authority level, plus links to jobs and salary data.
                        </p>
                    </div>
                )}
            </aside>

            {/* ── Responsive layout + tile interaction styles ── */}
            <style>{`
                .pa-map-layout {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 20px;
                }
                @media (min-width: 900px) {
                    .pa-map-layout {
                        grid-template-columns: minmax(0, 1fr) 300px;
                        align-items: start;
                    }
                }
                .pa-map-scroll {
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                    /* Room for the 3px focus ring (+2px offset) so the
                       overflow container doesn't clip it at the edges. */
                    padding: 6px 6px 10px;
                    margin: -6px -6px 0;
                }
                .pa-tile-grid {
                    display: grid;
                    grid-template-columns: repeat(12, minmax(0, 1fr));
                    gap: clamp(3px, 0.6vw, 7px);
                    /* Floor: 12 × ~42px tiles + gaps. Below this the container
                       pans instead of shrinking tiles under tap-target size. */
                    min-width: 560px;
                }
                .pa-tile {
                    aspect-ratio: 1 / 1;
                    width: 100%;
                    min-width: 0;
                    border-radius: 22%;
                    font-size: clamp(11px, 1.5vw, 13px);
                    font-weight: 700;
                    letter-spacing: 0.02em;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0;
                    box-shadow: 2px 2px 5px rgba(0,0,0,0.05), inset 1px 1px 1px rgba(255,255,255,0.6);
                    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
                }
                .pa-tile:hover {
                    transform: translateY(-2px) scale(1.07);
                    filter: saturate(1.35);
                    box-shadow: 4px 4px 10px rgba(0,0,0,0.10), inset 1px 1px 1px rgba(255,255,255,0.6);
                    z-index: 1;
                    position: relative;
                }
                .pa-tile:focus-visible {
                    outline: 3px solid #0D9488;
                    outline-offset: 2px;
                    z-index: 2;
                    position: relative;
                }
                .pa-tile[aria-pressed="true"] {
                    transform: scale(0.96);
                    filter: saturate(1.5);
                    box-shadow: inset 2px 2px 5px rgba(0,0,0,0.12);
                    outline: 2px solid currentColor;
                    outline-offset: 1px;
                    z-index: 1;
                    position: relative;
                }
                .pa-legend {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px 22px;
                    margin-top: 18px;
                    padding: 14px 16px;
                    border-radius: 14px;
                    background: rgba(0,0,0,0.02);
                    border: 1px solid rgba(0,0,0,0.04);
                }
                .pa-panel-link-primary,
                .pa-panel-link-secondary {
                    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                }
                .pa-panel-link-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(13,148,136,0.3), inset 1px 1px 2px rgba(255,255,255,0.2);
                }
                .pa-panel-link-secondary:hover {
                    transform: translateY(-2px);
                    border-color: rgba(13,148,136,0.3);
                    box-shadow: 0 6px 18px rgba(0,0,0,0.08);
                }
            `}</style>
        </div>
    );
}
