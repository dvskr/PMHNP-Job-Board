import { FILL_DELAYS } from '@/shared/constants';
import { getSettings, setFABPosition, getFABPosition } from '@/shared/storage';
import type { ExtensionSettings } from '@/shared/types';

type FabState = 'idle' | 'detected' | 'filling' | 'success' | 'error' | 'loading';

interface FabPosition {
  x: number;
  y: number;
}

const FAB_HTML = `
<div id="pmhnp-fab-wrapper" style="all:initial;">
  <div id="pmhnp-fab" role="button" tabindex="0" aria-label="PMHNP Autofill">
    <div id="pmhnp-fab-icon"></div>
    <div id="pmhnp-fab-pulse"></div>
    <div id="pmhnp-fab-tooltip">Click to autofill</div>
  </div>
</div>
`;

const FAB_STYLES = `
  #pmhnp-fab-wrapper {
    position: fixed;
    z-index: 2147483647;
    font-family: 'Inter', -apple-system, sans-serif;
  }
  #pmhnp-fab {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #00d4aa 0%, #00b894 100%);
    box-shadow: 0 4px 20px rgba(0, 212, 170, 0.4), 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    user-select: none;
  }
  #pmhnp-fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 28px rgba(0, 212, 170, 0.5), 0 3px 12px rgba(0, 0, 0, 0.2);
  }
  #pmhnp-fab:active { cursor: grabbing; }
  #pmhnp-fab-icon {
    width: 28px;
    height: 28px;
    background: white;
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M9 12l2 2 4-4'/%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E");
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M9 12l2 2 4-4'/%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E");
    mask-size: contain;
    -webkit-mask-size: contain;
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
    pointer-events: none;
  }
  #pmhnp-fab-pulse {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid rgba(0, 212, 170, 0.5);
    animation: pmhnp-pulse 2s ease-out infinite;
    pointer-events: none;
  }
  @keyframes pmhnp-pulse {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  #pmhnp-fab-tooltip {
    position: absolute;
    right: 64px;
    top: 50%;
    transform: translateY(-50%);
    background: #1a1a2e;
    color: #fff;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  #pmhnp-fab:hover #pmhnp-fab-tooltip { opacity: 1; }

  /* State variants */
  #pmhnp-fab.pmhnp-state-idle { background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%); }
  #pmhnp-fab.pmhnp-state-idle #pmhnp-fab-pulse { display: none; }
  #pmhnp-fab.pmhnp-state-detected { background: linear-gradient(135deg, #00d4aa 0%, #00b894 100%); }
  #pmhnp-fab.pmhnp-state-filling {
    background: linear-gradient(135deg, #00d4aa 0%, #00b894 100%);
    pointer-events: none;
    animation: pmhnp-spin 1s linear infinite;
  }
  @keyframes pmhnp-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  #pmhnp-fab.pmhnp-state-success {
    background: linear-gradient(135deg, #28a745 0%, #218838 100%);
    box-shadow: 0 4px 20px rgba(40, 167, 69, 0.4);
  }
  #pmhnp-fab.pmhnp-state-success #pmhnp-fab-pulse { display: none; }
  #pmhnp-fab.pmhnp-state-error {
    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
    box-shadow: 0 4px 20px rgba(220, 53, 69, 0.4);
  }
  #pmhnp-fab.pmhnp-state-error #pmhnp-fab-pulse { display: none; }
  #pmhnp-fab.pmhnp-state-loading {
    background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%);
    pointer-events: none;
  }
`;

let fabRoot: ShadowRoot | null = null;
let fabElement: HTMLElement | null = null;
let currentState: FabState = 'idle';
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let fabPosition: FabPosition = { x: window.innerWidth - 80, y: window.innerHeight - 120 };

export function createFab(): void {
  if (fabRoot) return; // Already created

  const host = document.createElement('div');
  host.id = 'pmhnp-fab-host';
  host.style.cssText = 'all:initial !important;';
  document.body.appendChild(host);

  fabRoot = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = FAB_STYLES;
  fabRoot.appendChild(style);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = FAB_HTML;
  fabRoot.appendChild(wrapper.firstElementChild!);

  fabElement = fabRoot.getElementById('pmhnp-fab');
  if (!fabElement) return;

  // Restore saved position
  loadSavedPosition().then((pos) => {
    if (pos) fabPosition = pos;
    updateFabPosition();
  });

  // Event listeners
  fabElement.addEventListener('mousedown', onDragStart);
  fabElement.addEventListener('click', onFabClick);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  // Set initial state
  setState('idle');
}

export function destroyFab(): void {
  const host = document.getElementById('pmhnp-fab-host');
  if (host) host.remove();
  fabRoot = null;
  fabElement = null;
}

export function setState(state: FabState, tooltip?: string): void {
  currentState = state;
  if (!fabElement) return;

  // Remove all state classes
  fabElement.className = `pmhnp-state-${state}`;

  // Update tooltip
  const tooltipEl = fabRoot?.getElementById('pmhnp-fab-tooltip');
  if (tooltipEl) {
    const tooltips: Record<FabState, string> = {
      idle: 'Not on an application page',
      detected: 'Click to autofill',
      filling: 'Filling in progress...',
      success: 'Autofill complete!',
      error: tooltip || 'Autofill failed',
      loading: 'Loading...',
    };
    tooltipEl.textContent = tooltip || tooltips[state];
  }

  // Auto-reset success/error after delay
  if (state === 'success' || state === 'error') {
    setTimeout(() => setState('detected'), 3000);
  }
}

export function getState(): FabState {
  return currentState;
}

// ─── Dragging ───

function onDragStart(e: MouseEvent): void {
  isDragging = false; // Reset — we'll set to true on mousemove
  const target = e.currentTarget as HTMLElement;
  const rect = target.parentElement!.getBoundingClientRect();
  dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  e.preventDefault();
}

function onDragMove(e: MouseEvent): void {
  if (dragOffset.x === 0 && dragOffset.y === 0) return;
  isDragging = true;
  fabPosition = {
    x: Math.max(0, Math.min(window.innerWidth - 56, e.clientX - dragOffset.x)),
    y: Math.max(0, Math.min(window.innerHeight - 56, e.clientY - dragOffset.y)),
  };
  updateFabPosition();
}

function onDragEnd(): void {
  if (isDragging) {
    setFABPosition(fabPosition);
  }
  dragOffset = { x: 0, y: 0 };
  setTimeout(() => { isDragging = false; }, 0); // Delay to prevent click firing
}

function updateFabPosition(): void {
  const wrapper = fabRoot?.getElementById('pmhnp-fab-wrapper');
  if (wrapper) {
    (wrapper as HTMLElement).style.left = `${fabPosition.x}px`;
    (wrapper as HTMLElement).style.top = `${fabPosition.y}px`;
  }
}

async function loadSavedPosition(): Promise<FabPosition | null> {
  try {
    const pos = await getFABPosition();
    return pos;
  } catch {
    return null;
  }
}

// ─── Click Handler ───

async function onFabClick(): Promise<void> {
  if (isDragging) return;
  if (currentState === 'filling' || currentState === 'loading') return;
  if (currentState === 'idle') return;

  setState('filling');

  try {
    // Dispatch START_AUTOFILL to self (content script handles it directly)
    const result = await new Promise<{ filled?: number; error?: string }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'START_AUTOFILL' }, (response) => {
        // If background forwarded to us, we get the result here
        resolve(response || {});
      });
    });

    if (result?.error) {
      setState('error', result.error);
    } else {
      setState('success', `${result?.filled || 0} fields filled`);
    }
  } catch (err) {
    setState('error', err instanceof Error ? err.message : 'Unknown error');
  }
}

// ─── Settings Aware ───

export async function initFabIfEnabled(): Promise<void> {
  const settings: ExtensionSettings = await getSettings();
  if (settings.showFAB) {
    createFab();
  }
}

// ─── Auto-inject with delay ───

export function injectFabWithDelay(delayMs: number = FILL_DELAYS.slow): void {
  setTimeout(() => {
    initFabIfEnabled();
  }, delayMs);
}
