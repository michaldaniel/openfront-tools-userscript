// ==UserScript==
// @name         OpenFront Tools
// @namespace    https://openfront.io/
// @version      0.7.1
// @description  Floating utility panels for OpenFront.
// @author       morningbird
// @license      MIT
// @homepageURL  https://github.com/michaldaniel/openfront-tools-userscript
// @supportURL   https://github.com/michaldaniel/openfront-tools-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/michaldaniel/openfront-tools-userscript/main/openfront-tools.user.js
// @updateURL    https://raw.githubusercontent.com/michaldaniel/openfront-tools-userscript/main/openfront-tools.user.js
// @match        https://openfront.io/*
// @match        https://www.openfront.io/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  if (window.__openfrontToolsLoaded) {
    return;
  }
  window.__openfrontToolsLoaded = true;

  const VERSION = "0.7.1";

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const APP_ID = "of-tools";
  const STORAGE_KEY = "openfront-tools:v1";
  const DEBUG_STORAGE_KEY = "openfront-tools:debug";
  const PANEL_GAP = 8;
  const PANEL_WIDTH = 224;
  const Z_INDEX_BASE = 2147483000;

  const MIRV = {
    PRICE_START: 25,
    PRICE_STEP: 15,
    MAX_PRICE: 700,
    MAX_THROW_COUNT: 8,
    QUICK_PRICE_COUNT: 6,
  };

  const MIRV_WATCH = {
    CLOSE_RATIO: 0.8,
    MAX_ROWS: 8,
  };

  const CLEANUP = {
    MAX_LAND_RATIO: 0.01,
    MIN_GOLD: 4_000_000,
    MAX_ROWS: 10,
  };

  const TROOPS = {
    TICK_SECONDS: 0.1,
    PLATEAU_RATIO: 0.8,
    GRAPH_POINTS: 80,
    OPTIMAL_SEARCH_STEPS: 1200,
  };

  // Register each tool here. A panel definition owns its metadata, markup,
  // event binding, render pass, and default persisted state.
  const PANEL_DEFINITIONS = [
    createSettingsPanelDefinition(),
    createMirvPanelDefinition(),
    createMirvWatchPanelDefinition(),
    createCleanupPanelDefinition(),
    createTroopCurvePanelDefinition(),
  ];

  const PANEL_BY_ID = Object.fromEntries(PANEL_DEFINITIONS.map((panel) => [panel.id, panel]));
  const reportedErrors = new Set();
  const state = loadState();
  const mountedPanels = new Map();

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const css = `
    .of-tools-panel {
      position: fixed;
      z-index: ${Z_INDEX_BASE};
      width: min(${PANEL_WIDTH}px, calc(100vw - 16px));
      color: #f4f7fb;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 11px;
      line-height: 1.35;
      background: rgba(13, 18, 28, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.34);
      border-radius: 6px;
      box-shadow: 0 13px 31px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(10px);
      user-select: none;
    }

    .of-tools-panel * {
      box-sizing: border-box;
    }

    .of-tools-panel[data-collapsed="true"] .of-tools-body {
      display: none;
    }

    .of-tools-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
      min-height: 27px;
      padding: 6px 7px;
      cursor: move;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    }

    .of-tools-title {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: #f8fafc;
      font-weight: 750;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .of-tools-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--of-tools-accent, #f59e0b);
      box-shadow: 0 0 10px color-mix(in srgb, var(--of-tools-accent, #f59e0b) 70%, transparent);
      flex: 0 0 auto;
    }

    .of-tools-actions {
      display: flex;
      gap: 4px;
      flex: 0 0 auto;
    }

    .of-tools-icon-button {
      display: inline-grid;
      place-items: center;
      width: 20px;
      height: 19px;
      color: #cbd5e1;
      background: rgba(30, 41, 59, 0.82);
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 5px;
      cursor: pointer;
      font: inherit;
      font-weight: 750;
      padding: 0;
    }

    .of-tools-icon-button:hover {
      color: #ffffff;
      border-color: color-mix(in srgb, var(--of-tools-accent, #f59e0b) 58%, rgba(255, 255, 255, 0.2));
      background: rgba(51, 65, 85, 0.92);
    }

    .of-tools-body {
      display: grid;
      gap: 8px;
      padding: 8px;
    }

    .of-tools-field {
      display: grid;
      gap: 5px;
    }

    .of-tools-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
    }

    .of-tools-label {
      color: #cbd5e1;
      font-weight: 650;
    }

    .of-tools-value {
      color: #ffffff;
      font-variant-numeric: tabular-nums;
      font-weight: 750;
    }

    .of-tools-control-row {
      display: grid;
      grid-template-columns: 21px 1fr 21px;
      align-items: center;
      gap: 5px;
    }

    .of-tools-slider {
      width: 100%;
      accent-color: var(--of-tools-accent, #f59e0b);
      cursor: pointer;
    }

    .of-tools-number-input {
      width: 60px;
      min-height: 21px;
      color: #ffffff;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 5px;
      font: inherit;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
      padding: 3px 6px;
      text-align: right;
    }

    .of-tools-number-input:focus {
      outline: 2px solid color-mix(in srgb, var(--of-tools-accent, #f59e0b) 68%, transparent);
      outline-offset: 1px;
      border-color: var(--of-tools-accent, #f59e0b);
    }

    .of-tools-number-input::-webkit-outer-spin-button,
    .of-tools-number-input::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }

    .of-tools-number-input {
      appearance: textfield;
      -moz-appearance: textfield;
    }

    .of-tools-segmented {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
    }

    .of-tools-segmented-compact {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
    }

    .of-tools-segmented button,
    .of-tools-segmented-compact button,
    .of-tools-button,
    .of-tools-stepper {
      min-height: 21px;
      color: #dbeafe;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 5px;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }

    .of-tools-segmented button[aria-pressed="true"],
    .of-tools-segmented-compact button[aria-pressed="true"],
    .of-tools-button:hover,
    .of-tools-stepper:hover {
      color: #111827;
      background: var(--of-tools-accent, #fbbf24);
      border-color: var(--of-tools-accent, #f59e0b);
    }

    .of-tools-stepper {
      width: 21px;
      padding: 0;
    }

    .of-tools-segmented-compact button {
      min-height: 17px;
      padding: 0 1px;
      font-size: 9px;
    }

    .of-tools-stepper:disabled {
      color: #64748b;
      background: rgba(15, 23, 42, 0.56);
      border-color: rgba(100, 116, 139, 0.18);
      cursor: not-allowed;
    }

    .of-tools-slider:disabled,
    .of-tools-number-input:disabled,
    .of-tools-segmented-compact button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .of-tools-results {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .of-tools-card {
      min-width: 0;
      padding: 6px;
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 5px;
    }

    .of-tools-card-title {
      margin-bottom: 2px;
      color: #94a3b8;
      font-size: 9px;
      font-weight: 750;
      text-transform: uppercase;
    }

    .of-tools-card-value {
      color: #ffffff;
      font-size: 14px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .of-tools-note {
      color: #cbd5e1;
      padding: 6px;
      background: rgba(2, 6, 23, 0.42);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 5px;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }

    .of-tools-status {
      min-height: 13px;
      color: #94a3b8;
      font-size: 10px;
    }

    .of-tools-graph {
      width: 100%;
      height: 92px;
      display: block;
      background: rgba(2, 6, 23, 0.42);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 5px;
    }

    .of-tools-graph-grid {
      stroke: rgba(148, 163, 184, 0.18);
      stroke-width: 1;
    }

    .of-tools-graph-curve {
      fill: none;
      stroke: var(--of-tools-accent, #38bdf8);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .of-tools-graph-marker {
      stroke-width: 1.25;
      stroke-dasharray: 4 4;
    }

    .of-tools-graph-dot {
      fill: #ffffff;
      stroke: #0f172a;
      stroke-width: 1.5;
    }

    .of-tools-muted {
      color: #94a3b8;
    }

    .of-tools-watch-list {
      display: grid;
      gap: 5px;
      max-height: 190px;
      overflow: auto;
      padding-right: 2px;
    }

    .of-tools-watch-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 5px 7px;
      padding: 6px;
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 5px;
    }

    .of-tools-watch-row[data-player-id] {
      cursor: pointer;
    }

    .of-tools-watch-row[data-player-id]:hover {
      border-color: color-mix(in srgb, var(--of-tools-accent, #f59e0b) 58%, rgba(255, 255, 255, 0.2));
      background: rgba(30, 41, 59, 0.9);
    }

    .of-tools-watch-name {
      min-width: 0;
      color: #f8fafc;
      font-weight: 750;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .of-tools-watch-detail {
      grid-column: 1 / -1;
      color: #94a3b8;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }

    .of-tools-badge {
      align-self: start;
      justify-self: end;
      padding: 1px 5px;
      color: #111827;
      background: var(--of-tools-accent, #fbbf24);
      border-radius: 999px;
      font-size: 9px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .of-tools-setting {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px;
      background: rgba(15, 23, 42, 0.62);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 5px;
    }

    .of-tools-setting-title {
      color: #f8fafc;
      font-weight: 750;
    }

    .of-tools-setting-description {
      margin-top: 2px;
      color: #94a3b8;
      font-size: 10px;
    }

    .of-tools-credit {
      color: #94a3b8;
      padding: 6px;
      background: rgba(2, 6, 23, 0.34);
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 5px;
      font-size: 10px;
    }

    .of-tools-credit a {
      color: #bae6fd;
      font-weight: 750;
      text-decoration: none;
    }

    .of-tools-credit a:hover {
      color: #ffffff;
      text-decoration: underline;
    }

    .of-tools-toggle {
      position: relative;
      flex: 0 0 auto;
      width: 29px;
      height: 17px;
    }

    .of-tools-toggle input {
      position: absolute;
      opacity: 0;
      inset: 0;
    }

    .of-tools-toggle span {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: rgba(51, 65, 85, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.28);
      cursor: pointer;
    }

    .of-tools-toggle span::after {
      content: "";
      position: absolute;
      width: 13px;
      height: 13px;
      left: 2px;
      top: 2px;
      border-radius: 999px;
      background: #cbd5e1;
      transition: transform 120ms ease, background 120ms ease;
    }

    .of-tools-toggle input:checked + span {
      background: color-mix(in srgb, var(--of-tools-accent, #f59e0b) 42%, rgba(15, 23, 42, 0.92));
      border-color: var(--of-tools-accent, #f59e0b);
    }

    .of-tools-toggle input:checked + span::after {
      transform: translateX(12px);
      background: #ffffff;
    }

    @media (max-width: 520px) {
      .of-tools-panel {
        width: calc(100vw - 16px);
      }
    }
  `;

  // ---------------------------------------------------------------------------
  // Panel Definitions
  // ---------------------------------------------------------------------------

  function createSettingsPanelDefinition() {
    return {
      id: "settings",
      title: "OpenFront Tools",
      accent: "#38bdf8",
      description: "Choose which floating tools are visible.",
      defaultPanel: {
        enabled: true,
        collapsed: false,
        x: null,
        y: null,
      },
      body() {
        return `
          <div data-settings-list></div>
          <div class="of-tools-credit">
            Made by morningbird. Requests/support:
            <a href="https://discord.com/users/morning.bird" target="_blank" rel="noopener noreferrer">@morning.bird</a>
          </div>
          <button class="of-tools-button" type="button" data-settings-reset>Reset all panels</button>
        `;
      },
      bind(context) {
        context.body.querySelector("[data-settings-reset]").addEventListener("click", () => {
          resetAllPanels();
        });
      },
      render(context) {
        const list = context.body.querySelector("[data-settings-list]");
        list.innerHTML = manageablePanels().map((panel) => {
          const checked = state.panels[panel.id].enabled ? "checked" : "";

          return `
            <label class="of-tools-setting">
              <span>
                <span class="of-tools-setting-title">${escapeHtml(panel.title)}</span>
                <span class="of-tools-setting-description">${escapeHtml(panel.description || "")}</span>
              </span>
              <span class="of-tools-toggle">
                <input type="checkbox" data-panel-toggle="${escapeAttribute(panel.id)}" ${checked} />
                <span></span>
              </span>
            </label>
          `;
        }).join("");

        list.querySelectorAll("[data-panel-toggle]").forEach((input) => {
          input.addEventListener("change", () => {
            setPanelEnabled(input.dataset.panelToggle, input.checked);
          });
        });
      },
    };
  }

  // Panels are independent modules: each defines its shell metadata, markup,
  // event wiring, and render pass. New tools should be added as another
  // create*PanelDefinition() and registered in PANEL_DEFINITIONS above.
  function createMirvPanelDefinition() {
    return {
      id: "mirv",
      title: "MIRV Calculator",
      accent: "#f59e0b",
      description: "Calculate MIRV throw cost and the next MIRV price.",
      defaultPanel: {
        enabled: true,
        collapsed: false,
        x: null,
        y: null,
      },
      defaultData: {
        currentPrice: MIRV.PRICE_START,
        throwCount: 1,
      },
      body() {
        return `
          <div class="of-tools-field">
            <div class="of-tools-row">
              <span class="of-tools-label">Current MIRV price</span>
              <input class="of-tools-number-input" data-mirv-current-input type="number" min="${MIRV.PRICE_START}" max="${MIRV.MAX_PRICE}" step="${MIRV.PRICE_STEP}" inputmode="numeric" aria-label="Current MIRV price" />
            </div>
            <div class="of-tools-status" data-mirv-price-status></div>
            <div class="of-tools-control-row">
              <button class="of-tools-stepper" type="button" data-mirv-price-step="-1" aria-label="Decrease current MIRV price">-</button>
              <input class="of-tools-slider" data-mirv-current-slider type="range" min="${MIRV.PRICE_START}" max="${MIRV.MAX_PRICE}" step="${MIRV.PRICE_STEP}" />
              <button class="of-tools-stepper" type="button" data-mirv-price-step="1" aria-label="Increase current MIRV price">+</button>
            </div>
            <div class="of-tools-segmented-compact" aria-label="Quick current MIRV price">
              ${quickMirvPrices().map((price) => `<button type="button" data-mirv-price="${price}">${price}</button>`).join("")}
            </div>
          </div>

          <div class="of-tools-field">
            <div class="of-tools-row">
              <span class="of-tools-label">MIRVs to throw</span>
              <span class="of-tools-value" data-mirv-throw-count></span>
            </div>
            <div class="of-tools-control-row">
              <button class="of-tools-stepper" type="button" data-mirv-count-step="-1" aria-label="Decrease MIRVs to throw">-</button>
              <input class="of-tools-slider" data-mirv-count-slider type="range" min="1" max="${MIRV.MAX_THROW_COUNT}" step="1" />
              <button class="of-tools-stepper" type="button" data-mirv-count-step="1" aria-label="Increase MIRVs to throw">+</button>
            </div>
            <div class="of-tools-segmented" aria-label="Quick MIRV count">
              <button type="button" data-mirv-count="1">1</button>
              <button type="button" data-mirv-count="2">2</button>
              <button type="button" data-mirv-count="3">3</button>
              <button type="button" data-mirv-count="5">5</button>
              <button type="button" data-mirv-count="8">8</button>
            </div>
          </div>

          <div class="of-tools-results">
            <div class="of-tools-card">
              <div class="of-tools-card-title">Throw cost</div>
              <div class="of-tools-card-value" data-mirv-total-cost></div>
            </div>
            <div class="of-tools-card">
              <div class="of-tools-card-title">Next MIRV</div>
              <div class="of-tools-card-value" data-mirv-next-price></div>
            </div>
          </div>

          <div class="of-tools-note">
            <span class="of-tools-muted">Sequence:</span>
            <span data-mirv-breakdown></span>
          </div>
        `;
      },
      bind(context) {
        const currentSlider = context.body.querySelector("[data-mirv-current-slider]");
        const currentInput = context.body.querySelector("[data-mirv-current-input]");
        const countSlider = context.body.querySelector("[data-mirv-count-slider]");

        currentSlider.addEventListener("input", () => {
          setMirvCurrentPrice(currentSlider.value);
        });

        currentInput.addEventListener("change", () => {
          setMirvCurrentPrice(currentInput.value);
        });

        currentInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            currentInput.blur();
          }
        });

        countSlider.addEventListener("input", () => {
          setMirvThrowCount(countSlider.value);
        });

        context.body.querySelectorAll("[data-mirv-price-step]").forEach((button) => {
          button.addEventListener("click", () => {
            setMirvCurrentPrice(state.data.mirv.currentPrice + Number(button.dataset.mirvPriceStep) * MIRV.PRICE_STEP);
          });
        });

        context.body.querySelectorAll("[data-mirv-price]").forEach((button) => {
          button.addEventListener("click", () => {
            setMirvCurrentPrice(button.dataset.mirvPrice);
          });
        });

        context.body.querySelectorAll("[data-mirv-count-step]").forEach((button) => {
          button.addEventListener("click", () => {
            setMirvThrowCount(state.data.mirv.throwCount + Number(button.dataset.mirvCountStep));
          });
        });

        context.body.querySelectorAll("[data-mirv-count]").forEach((button) => {
          button.addEventListener("click", () => {
            setMirvThrowCount(button.dataset.mirvCount);
          });
        });
      },
      render(context) {
        const data = state.data.mirv;
        const livePrice = readLiveMirvPrice();
        if (livePrice !== null) {
          data.currentPrice = livePrice;
        }

        const throwPrices = pricesForThrow(data.currentPrice, data.throwCount);
        const totalCost = throwPrices.reduce((sum, price) => sum + price, 0);
        const nextPrice = data.currentPrice + data.throwCount * MIRV.PRICE_STEP;
        const hasLivePrice = livePrice !== null;

        context.body.querySelector("[data-mirv-current-slider]").value = data.currentPrice;
        context.body.querySelector("[data-mirv-current-input]").value = data.currentPrice;
        context.body.querySelector("[data-mirv-price-status]").textContent = hasLivePrice
          ? "Reading live MIRV cost from game UI"
          : "Waiting for game UI; manual price controls active";
        context.body.querySelector("[data-mirv-count-slider]").value = data.throwCount;
        context.body.querySelector("[data-mirv-throw-count]").textContent = String(data.throwCount);
        context.body.querySelector("[data-mirv-total-cost]").textContent = formatCost(totalCost);
        context.body.querySelector("[data-mirv-next-price]").textContent = formatCost(nextPrice);
        context.body.querySelector("[data-mirv-breakdown]").textContent = throwPrices.map(formatCost).join(" + ");

        context.body.querySelectorAll("[data-mirv-count]").forEach((button) => {
          button.setAttribute("aria-pressed", String(Number(button.dataset.mirvCount) === data.throwCount));
        });

        context.body.querySelectorAll("[data-mirv-price]").forEach((button) => {
          button.setAttribute("aria-pressed", String(Number(button.dataset.mirvPrice) === data.currentPrice));
        });

        context.body.querySelector("[data-mirv-current-slider]").disabled = hasLivePrice;
        context.body.querySelector("[data-mirv-current-input]").disabled = hasLivePrice;
        context.body.querySelectorAll("[data-mirv-price]").forEach((button) => {
          button.disabled = hasLivePrice;
        });
        context.body.querySelector('[data-mirv-price-step="-1"]').disabled = hasLivePrice || data.currentPrice <= MIRV.PRICE_START;
        context.body.querySelector('[data-mirv-price-step="1"]').disabled = hasLivePrice || data.currentPrice >= MIRV.MAX_PRICE;
        context.body.querySelector('[data-mirv-count-step="-1"]').disabled = data.throwCount <= 1;
        context.body.querySelector('[data-mirv-count-step="1"]').disabled = data.throwCount >= MIRV.MAX_THROW_COUNT;
      },
    };
  }

  function createMirvWatchPanelDefinition() {
    return {
      id: "mirvWatch",
      title: "MIRV Watch",
      accent: "#ef4444",
      description: "Watch active MIRVs and players close to MIRV money.",
      defaultPanel: {
        enabled: false,
        collapsed: false,
        x: null,
        y: null,
      },
      body() {
        return `
          <div class="of-tools-status" data-mirv-watch-status></div>
          <div class="of-tools-results">
            <div class="of-tools-card">
              <div class="of-tools-card-title">MIRV price</div>
              <div class="of-tools-card-value" data-mirv-watch-price></div>
            </div>
            <div class="of-tools-card">
              <div class="of-tools-card-title">Watched</div>
              <div class="of-tools-card-value" data-mirv-watch-count></div>
            </div>
          </div>
          <div class="of-tools-watch-list" data-mirv-watch-list></div>
        `;
      },
      render(context) {
        const snapshot = readMirvWatchSnapshot();

        context.body.querySelector("[data-mirv-watch-status]").textContent = snapshot.status;
        context.body.querySelector("[data-mirv-watch-price]").textContent = snapshot.currentPrice
          ? formatCost(snapshot.currentPrice)
          : "-";
        context.body.querySelector("[data-mirv-watch-count]").textContent = String(snapshot.players.length);
        context.body.querySelector("[data-mirv-watch-list]").innerHTML = snapshot.players.length
          ? snapshot.players.map(renderMirvWatchRow).join("")
          : `<div class="of-tools-note">${escapeHtml(snapshot.emptyText)}</div>`;
      },
    };
  }

  function createCleanupPanelDefinition() {
    return {
      id: "cleanup",
      title: "Cleanup Watch",
      accent: "#a3e635",
      description: "Find tiny players carrying enough gold to be worth cleaning up.",
      defaultPanel: {
        enabled: false,
        collapsed: false,
        x: null,
        y: null,
      },
      body() {
        return `
          <div class="of-tools-status" data-cleanup-status></div>
          <div class="of-tools-results">
            <div class="of-tools-card">
              <div class="of-tools-card-title">Land limit</div>
              <div class="of-tools-card-value">${Math.round(CLEANUP.MAX_LAND_RATIO * 100)}%</div>
            </div>
            <div class="of-tools-card">
              <div class="of-tools-card-title">Gold min</div>
              <div class="of-tools-card-value">${formatGold(CLEANUP.MIN_GOLD)}</div>
            </div>
          </div>
          <div class="of-tools-watch-list" data-cleanup-list></div>
        `;
      },
      bind(context) {
        context.body.querySelector("[data-cleanup-list]").addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }

          const row = target.closest("[data-player-id]");
          if (!row) {
            return;
          }

          focusPlayerBySmallId(Number(row.dataset.playerId));
        });
      },
      render(context) {
        const snapshot = readCleanupSnapshot();

        context.body.querySelector("[data-cleanup-status]").textContent = snapshot.status;
        context.body.querySelector("[data-cleanup-list]").innerHTML = snapshot.players.length
          ? snapshot.players.map(renderCleanupRow).join("")
          : `<div class="of-tools-note">${escapeHtml(snapshot.emptyText)}</div>`;
      },
    };
  }

  function createTroopCurvePanelDefinition() {
    return {
      id: "troops",
      title: "Troop Curve",
      accent: "#22c55e",
      description: "Track current troops against the regeneration curve.",
      defaultPanel: {
        enabled: false,
        collapsed: false,
        x: null,
        y: null,
      },
      defaultData: {
        currentTroops: 0,
        maxTroops: 0,
      },
      body() {
        return `
          <div class="of-tools-status" data-troops-status></div>

          <div class="of-tools-field">
            <div class="of-tools-row">
              <span class="of-tools-label">Current troops</span>
              <input class="of-tools-number-input" data-troops-current-input type="number" min="0" step="1" inputmode="decimal" aria-label="Current troops" />
            </div>
            <div class="of-tools-row">
              <span class="of-tools-label">Max troops</span>
              <input class="of-tools-number-input" data-troops-max-input type="number" min="1" step="1" inputmode="decimal" aria-label="Max troops" />
            </div>
          </div>

          <svg class="of-tools-graph" data-troops-graph viewBox="0 0 300 132" role="img" aria-label="Troop regeneration curve"></svg>

          <div class="of-tools-results">
            <div class="of-tools-card">
              <div class="of-tools-card-title">Current rate</div>
              <div class="of-tools-card-value" data-troops-rate></div>
            </div>
            <div class="of-tools-card">
              <div class="of-tools-card-title">Fill</div>
              <div class="of-tools-card-value" data-troops-fill></div>
            </div>
          </div>

          <div class="of-tools-results">
            <div class="of-tools-card">
              <div class="of-tools-card-title">Optimal</div>
              <div class="of-tools-card-value" data-troops-optimal-time></div>
            </div>
            <div class="of-tools-card">
              <div class="of-tools-card-title">Plateau 80%</div>
              <div class="of-tools-card-value" data-troops-plateau-time></div>
            </div>
          </div>

          <div class="of-tools-note">
            <span class="of-tools-muted">Peak:</span>
            <span data-troops-optimal-detail></span>
          </div>
        `;
      },
      bind(context) {
        const currentInput = context.body.querySelector("[data-troops-current-input]");
        const maxInput = context.body.querySelector("[data-troops-max-input]");

        currentInput.addEventListener("change", () => {
          state.data.troops.currentTroops = displayTroopsToInternal(currentInput.value);
          saveState();
          renderPanel("troops");
        });

        maxInput.addEventListener("change", () => {
          state.data.troops.maxTroops = Math.max(1, displayTroopsToInternal(maxInput.value));
          saveState();
          renderPanel("troops");
        });

        [currentInput, maxInput].forEach((input) => {
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              input.blur();
            }
          });
        });
      },
      render(context) {
        const live = readLiveTroopState();
        const data = state.data.troops;

        if (live) {
          data.currentTroops = live.currentTroops;
          data.maxTroops = live.maxTroops;
        }

        const current = Math.max(0, Number(data.currentTroops) || 0);
        const max = Math.max(1, Number(data.maxTroops) || 1);
        const analysis = analyzeTroopCurve(current, max);

        context.body.querySelector("[data-troops-status]").textContent = live
          ? "Reading live game HUD"
          : "Waiting for game HUD; values can be edited";
        context.body.querySelector("[data-troops-current-input]").value = formatTroopInput(current);
        context.body.querySelector("[data-troops-max-input]").value = formatTroopInput(max);
        context.body.querySelector("[data-troops-rate]").textContent = `${formatTroopsPerSecond(analysis.currentRatePerSecond)}/s`;
        context.body.querySelector("[data-troops-fill]").textContent = `${Math.round(analysis.currentRatio * 100)}%`;
        context.body.querySelector("[data-troops-optimal-time]").textContent = formatTargetTime(analysis.timeToOptimalSeconds);
        context.body.querySelector("[data-troops-plateau-time]").textContent = formatTargetTime(analysis.timeToPlateauSeconds);
        context.body.querySelector("[data-troops-optimal-detail]").textContent =
          `${formatDisplayTroops(analysis.optimalTroops)} troops at ${formatTroopsPerSecond(analysis.optimalRatePerSecond)}/s`;
        context.body.querySelector("[data-troops-graph]").innerHTML = buildTroopCurveSvg(analysis);
      },
    };
  }

  function manageablePanels() {
    return PANEL_DEFINITIONS.filter((panel) => panel.id !== "settings");
  }

  // ---------------------------------------------------------------------------
  // Persisted State
  // ---------------------------------------------------------------------------

  function defaultState() {
    return {
      panels: Object.fromEntries(PANEL_DEFINITIONS.map((panel) => [
        panel.id,
        {
          enabled: panel.id === "settings" ? true : panel.defaultPanel.enabled,
          collapsed: panel.defaultPanel.collapsed,
          x: panel.defaultPanel.x,
          y: panel.defaultPanel.y,
        },
      ])),
      data: Object.fromEntries(PANEL_DEFINITIONS
        .filter((panel) => panel.defaultData)
        .map((panel) => [panel.id, { ...panel.defaultData }])),
    };
  }

  function loadState() {
    const base = defaultState();

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const merged = mergeState(base, saved);
      normalizeState(merged);
      return merged;
    } catch (error) {
      reportError("loadState", error);
      return base;
    }
  }

  function mergeState(base, saved) {
    const merged = {
      panels: { ...base.panels },
      data: { ...base.data },
    };

    Object.keys(base.panels).forEach((panelId) => {
      merged.panels[panelId] = {
        ...base.panels[panelId],
        ...(saved.panels?.[panelId] || {}),
      };
    });

    Object.keys(base.data).forEach((toolId) => {
      merged.data[toolId] = {
        ...base.data[toolId],
        ...(saved.data?.[toolId] || {}),
      };
    });

    return merged;
  }

  function normalizeState(nextState) {
    nextState.panels.settings.enabled = true;

    if (nextState.data.mirv) {
      nextState.data.mirv.currentPrice = normalizeMirvPrice(nextState.data.mirv.currentPrice);
      nextState.data.mirv.throwCount = clamp(Number(nextState.data.mirv.throwCount) || 1, 1, MIRV.MAX_THROW_COUNT);
    }

    if (nextState.data.troops) {
      nextState.data.troops.currentTroops = Math.max(0, Number(nextState.data.troops.currentTroops) || 0);
      nextState.data.troops.maxTroops = Math.max(0, Number(nextState.data.troops.maxTroops) || 0);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      reportError("saveState", error);
    }
  }

  // ---------------------------------------------------------------------------
  // Panel Framework
  // ---------------------------------------------------------------------------

  function installStyles() {
    const style = document.createElement("style");
    style.id = `${APP_ID}-style`;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function syncPanels() {
    PANEL_DEFINITIONS.forEach((definition, index) => {
      const panelState = state.panels[definition.id];
      const shouldMount = definition.id === "settings" || panelState.enabled;

      if (shouldMount && !mountedPanels.has(definition.id)) {
        mountPanel(definition, index);
      }

      if (!shouldMount && mountedPanels.has(definition.id)) {
        unmountPanel(definition.id);
      }
    });

    renderPanel("settings");
  }

  function mountPanel(definition, index) {
    const panelState = state.panels[definition.id];
    const panel = document.createElement("section");
    const bodyId = `${APP_ID}-${definition.id}-body`;

    panel.id = `${APP_ID}-${definition.id}`;
    panel.className = "of-tools-panel";
    panel.dataset.panelId = definition.id;
    panel.dataset.collapsed = String(panelState.collapsed);
    panel.style.setProperty("--of-tools-accent", definition.accent);
    panel.style.zIndex = String(Z_INDEX_BASE + index);
    panel.setAttribute("aria-label", definition.title);

    panel.innerHTML = `
      <div class="of-tools-header">
        <div class="of-tools-title">
          <span class="of-tools-dot"></span>
          <span>${escapeHtml(definition.title)}</span>
        </div>
        <div class="of-tools-actions">
          <button class="of-tools-icon-button" type="button" data-panel-action="reset" title="Reset this panel" aria-label="Reset">R</button>
          <button class="of-tools-icon-button" type="button" data-panel-action="collapse" title="Collapse panel" aria-label="Collapse">-</button>
        </div>
      </div>
      <div class="of-tools-body" id="${bodyId}">${definition.body()}</div>
    `;

    document.body.appendChild(panel);
    placePanel(panel, definition.id, index);

    const context = {
      definition,
      panel,
      body: panel.querySelector(".of-tools-body"),
    };

    wirePanelShell(context);
    try {
      definition.bind?.(context);
    } catch (error) {
      reportError(`bind:${definition.id}`, error);
    }
    mountedPanels.set(definition.id, context);
    renderPanel(definition.id);
    debugLog("mounted panel", definition.id);
  }

  function unmountPanel(panelId) {
    const context = mountedPanels.get(panelId);
    context?.panel.remove();
    mountedPanels.delete(panelId);
  }

  function placePanel(panel, panelId, index) {
    const panelState = state.panels[panelId];

    if (Number.isFinite(panelState.x) && Number.isFinite(panelState.y)) {
      panel.style.left = `${panelState.x}px`;
      panel.style.top = `${panelState.y}px`;
      return;
    }

    panel.style.right = "13px";
    panel.style.top = `${67 + index * (PANEL_GAP + 32)}px`;
  }

  function wirePanelShell(context) {
    const header = context.panel.querySelector(".of-tools-header");
    const collapseButton = context.panel.querySelector('[data-panel-action="collapse"]');
    const resetButton = context.panel.querySelector('[data-panel-action="reset"]');

    collapseButton.addEventListener("click", () => {
      const panelState = state.panels[context.definition.id];
      panelState.collapsed = !panelState.collapsed;
      saveState();
      renderPanel(context.definition.id);
    });

    resetButton.addEventListener("click", () => {
      resetPanel(context.definition.id);
    });

    makeDraggable(context);
  }

  function renderPanel(panelId) {
    const context = mountedPanels.get(panelId);
    if (!context) {
      return;
    }

    const panelState = state.panels[panelId];
    const collapseButton = context.panel.querySelector('[data-panel-action="collapse"]');

    context.panel.dataset.collapsed = String(panelState.collapsed);
    collapseButton.textContent = panelState.collapsed ? "+" : "-";
    collapseButton.title = panelState.collapsed ? "Expand panel" : "Collapse panel";
    collapseButton.setAttribute("aria-label", panelState.collapsed ? "Expand" : "Collapse");

    try {
      context.definition.render?.(context);
    } catch (error) {
      reportError(`render:${panelId}`, error);
    }
  }

  function setPanelEnabled(panelId, enabled) {
    if (!PANEL_BY_ID[panelId] || panelId === "settings") {
      return;
    }

    state.panels[panelId].enabled = enabled;
    saveState();
    syncPanels();
  }

  function resetPanel(panelId) {
    const definition = PANEL_BY_ID[panelId];
    const panelState = state.panels[panelId];

    Object.assign(panelState, {
      enabled: panelId === "settings" ? true : definition.defaultPanel.enabled,
      collapsed: definition.defaultPanel.collapsed,
      x: null,
      y: null,
    });

    if (definition.defaultData) {
      state.data[panelId] = { ...definition.defaultData };
      normalizeState(state);
    }

    saveState();
    syncPanels();

    const context = mountedPanels.get(panelId);
    if (context) {
      context.panel.style.left = "";
      context.panel.style.right = "";
      placePanel(context.panel, panelId, PANEL_DEFINITIONS.findIndex((panel) => panel.id === panelId));
      renderPanel(panelId);
    }
  }

  function resetAllPanels() {
    const nextState = defaultState();
    state.panels = nextState.panels;
    state.data = nextState.data;
    saveState();

    Array.from(mountedPanels.keys()).forEach(unmountPanel);
    syncPanels();
  }

  function makeDraggable(context) {
    const handle = context.panel.querySelector(".of-tools-header");
    let drag = null;

    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) {
        return;
      }

      const rect = context.panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };

      context.panel.style.left = `${rect.left}px`;
      context.panel.style.top = `${rect.top}px`;
      context.panel.style.right = "auto";
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const rect = context.panel.getBoundingClientRect();
      const nextX = clamp(event.clientX - drag.offsetX, 6, window.innerWidth - rect.width - 6);
      const nextY = clamp(event.clientY - drag.offsetY, 6, window.innerHeight - rect.height - 6);

      context.panel.style.left = `${nextX}px`;
      context.panel.style.top = `${nextY}px`;
      state.panels[context.definition.id].x = nextX;
      state.panels[context.definition.id].y = nextY;
      saveState();
    });

    handle.addEventListener("pointerup", (event) => {
      if (drag?.pointerId === event.pointerId) {
        drag = null;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // MIRV Calculator
  // ---------------------------------------------------------------------------

  function setMirvCurrentPrice(value) {
    state.data.mirv.currentPrice = normalizeMirvPrice(value);
    saveState();
    renderPanel("mirv");
  }

  function setMirvThrowCount(value) {
    state.data.mirv.throwCount = clamp(Number(value) || 1, 1, MIRV.MAX_THROW_COUNT);
    saveState();
    renderPanel("mirv");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeMirvPrice(value) {
    const numeric = clamp(Number(value) || MIRV.PRICE_START, MIRV.PRICE_START, MIRV.MAX_PRICE);
    const steps = Math.round((numeric - MIRV.PRICE_START) / MIRV.PRICE_STEP);
    return MIRV.PRICE_START + steps * MIRV.PRICE_STEP;
  }

  function pricesForThrow(currentPrice, throwCount) {
    return Array.from({ length: throwCount }, (_, index) => currentPrice + index * MIRV.PRICE_STEP);
  }

  function quickMirvPrices() {
    return Array.from(
      { length: MIRV.QUICK_PRICE_COUNT },
      (_, index) => MIRV.PRICE_START + index * MIRV.PRICE_STEP,
    );
  }

  // ---------------------------------------------------------------------------
  // OpenFront Live Readers
  // ---------------------------------------------------------------------------

  function readLiveMirvPrice() {
    const fromBuildables = readLiveMirvPriceFromBuildables();
    if (fromBuildables !== null) {
      return fromBuildables;
    }

    return readLiveMirvPriceFromTooltip();
  }

  // UnitDisplay already resolves the current buildable cost from game state.
  // Reading that cached value avoids guessing from translated tooltip text.
  function readLiveMirvPriceFromBuildables() {
    const unitDisplay = document.querySelector("unit-display");
    const buildables = unitDisplay?.playerBuildables;
    if (!Array.isArray(buildables)) {
      return null;
    }

    const mirv = buildables.find((unit) => unit?.type === "MIRV");
    if (!mirv || mirv.cost === undefined || mirv.cost === null) {
      return null;
    }

    const cost = Number(mirv.cost);
    if (!Number.isFinite(cost) || cost <= 0) {
      return null;
    }

    return normalizeMirvPrice(cost / 1_000_000);
  }

  // Fallback for older OpenFront builds or if UnitDisplay internals change.
  function readLiveMirvPriceFromTooltip() {
    const unitDisplay = document.querySelector("unit-display");
    const text = unitDisplay?.textContent || "";
    if (!/\bMIRV\b/i.test(text)) {
      return null;
    }

    const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*M/i);
    if (!match) {
      return null;
    }

    return normalizeMirvPrice(Number(match[1]));
  }

  function readMirvWatchSnapshot() {
    const game = readLiveGameView();
    const currentPrice = readLiveMirvPrice() || state.data.mirv?.currentPrice || null;

    if (!game || typeof game.playerViews !== "function") {
      return {
        currentPrice,
        players: [],
        status: "Waiting for live game data",
        emptyText: "OpenFront game data is not available yet.",
      };
    }

    if (!currentPrice) {
      return {
        currentPrice,
        players: [],
        status: "Waiting for MIRV price",
        emptyText: "Current MIRV price is not available yet.",
      };
    }

    const landTiles = readActiveLandTiles(game);
    const currentCost = currentPrice * 1_000_000;
    const players = game.playerViews()
      .filter((player) => player?.isAlive?.())
      .map((player) => buildMirvWatchPlayer(player, currentCost, landTiles))
      .filter((player) => player.activeMirvs > 0 || player.ready || player.close)
      .sort(compareMirvWatchPlayers)
      .slice(0, MIRV_WATCH.MAX_ROWS);

    return {
      currentPrice,
      players,
      status: `Tracking MIRVs and ${Math.round(MIRV_WATCH.CLOSE_RATIO * 100)}%+ silo players`,
      emptyText: "No active MIRVs or near-ready silo players found.",
    };
  }

  // The public HUD leaderboard receives the live GameView from OpenFront's
  // renderer. It is the lowest-friction source for read-only player snapshots.
  function readLiveGameView() {
    const leaderboard = document.querySelector("leader-board");
    const game = leaderboard?.game;
    return game && typeof game.playerViews === "function" ? game : null;
  }

  function readActiveLandTiles(game) {
    const land = Number(game.numLandTiles?.()) || 0;
    const fallout = Number(game.numTilesWithFallout?.()) || 0;
    return Math.max(1, land - fallout);
  }

  function buildMirvWatchPlayer(player, currentCost, landTiles) {
    const gold = Number(player.gold?.() ?? 0n);
    const activeMirvs = countPlayerUnits(player, "MIRV") + countPlayerUnits(player, "MIRV Warhead");
    const silos = countPlayerUnits(player, "Missile Silo");
    const ratio = currentCost > 0 ? gold / currentCost : 0;
    const ready = silos > 0 && gold >= currentCost;
    const close = silos > 0 && ratio >= MIRV_WATCH.CLOSE_RATIO;
    const landRatio = (Number(player.numTilesOwned?.()) || 0) / landTiles;

    return {
      name: player.displayName?.() || player.name?.() || "Unknown",
      gold,
      activeMirvs,
      silos,
      ratio,
      ready,
      close,
      landRatio,
    };
  }

  function countPlayerUnits(player, type) {
    try {
      const units = player.units?.(type);
      return Array.isArray(units) ? units.length : 0;
    } catch {
      return 0;
    }
  }

  function compareMirvWatchPlayers(a, b) {
    if (a.activeMirvs !== b.activeMirvs) return b.activeMirvs - a.activeMirvs;
    if (a.ready !== b.ready) return Number(b.ready) - Number(a.ready);
    if (a.ratio !== b.ratio) return b.ratio - a.ratio;
    return b.gold - a.gold;
  }

  function renderMirvWatchRow(player) {
    const badge = player.activeMirvs > 0
      ? `MIRV x${player.activeMirvs}`
      : player.ready
        ? "READY"
        : `${Math.floor(player.ratio * 100)}%`;
    const details = [
      `Gold ${formatGold(player.gold)}`,
      `Silos ${player.silos}`,
      `Land ${(player.landRatio * 100).toFixed(1)}%`,
    ].join(" · ");

    return `
      <div class="of-tools-watch-row">
        <div class="of-tools-watch-name" title="${escapeAttribute(player.name)}">${escapeHtml(player.name)}</div>
        <div class="of-tools-badge">${escapeHtml(badge)}</div>
        <div class="of-tools-watch-detail">${escapeHtml(details)}</div>
      </div>
    `;
  }

  function readCleanupSnapshot() {
    const game = readLiveGameView();

    if (!game || typeof game.playerViews !== "function") {
      return {
        players: [],
        status: "Waiting for live game data",
        emptyText: "OpenFront game data is not available yet.",
      };
    }

    const landTiles = readActiveLandTiles(game);
    const myPlayer = game.myPlayer?.();
    const players = game.playerViews()
      .filter((player) => player?.isAlive?.())
      .filter((player) => !isSamePlayerOrTeam(player, myPlayer))
      .map((player) => buildCleanupPlayer(player, landTiles))
      .filter((player) => player.landRatio < CLEANUP.MAX_LAND_RATIO && player.gold > CLEANUP.MIN_GOLD)
      .sort(compareCleanupPlayers)
      .slice(0, CLEANUP.MAX_ROWS);

    return {
      players,
      status: `Enemy players under ${Math.round(CLEANUP.MAX_LAND_RATIO * 100)}% land and over ${formatGold(CLEANUP.MIN_GOLD)}`,
      emptyText: "No cleanup targets match the current filters.",
    };
  }

  function buildCleanupPlayer(player, landTiles) {
    const tiles = Number(player.numTilesOwned?.()) || 0;

    return {
      id: Number(player.smallID?.()) || 0,
      name: player.displayName?.() || player.name?.() || "Unknown",
      gold: Number(player.gold?.() ?? 0n),
      tiles,
      landRatio: tiles / landTiles,
    };
  }

  function isSamePlayerOrTeam(player, myPlayer) {
    if (!myPlayer) {
      return false;
    }

    if (player === myPlayer) {
      return true;
    }

    try {
      return Boolean(player.isOnSameTeam?.(myPlayer));
    } catch {
      return false;
    }
  }

  function compareCleanupPlayers(a, b) {
    if (a.gold !== b.gold) return b.gold - a.gold;
    return a.landRatio - b.landRatio;
  }

  function renderCleanupRow(player) {
    const details = [
      `Gold ${formatGold(player.gold)}`,
      `Land ${(player.landRatio * 100).toFixed(2)}%`,
      `${formatCost(player.tiles)} tiles`,
    ].join(" · ");

    return `
      <div class="of-tools-watch-row" data-player-id="${escapeAttribute(player.id)}" title="Click to focus player">
        <div class="of-tools-watch-name">${escapeHtml(player.name)}</div>
        <div class="of-tools-badge">${escapeHtml(formatGold(player.gold))}</div>
        <div class="of-tools-watch-detail">${escapeHtml(details)}</div>
      </div>
    `;
  }

  function focusPlayerBySmallId(smallId) {
    if (!Number.isFinite(smallId) || smallId <= 0) {
      return false;
    }

    const game = readLiveGameView();
    const leaderboard = document.querySelector("leader-board");
    if (!game || !leaderboard || typeof leaderboard.handleRowClickPlayer !== "function") {
      return false;
    }

    try {
      const player = game.playerBySmallID?.(smallId);
      if (!player?.isPlayer?.()) {
        return false;
      }

      leaderboard.handleRowClickPlayer(player);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Troop Curve Math
  // ---------------------------------------------------------------------------

  function readLiveTroopState() {
    const panel = document.querySelector("control-panel");
    if (!panel) {
      return null;
    }

    const current = Number(panel._troops);
    const max = Number(panel._maxTroops);
    if (Number.isFinite(current) && Number.isFinite(max) && max > 0) {
      return {
        currentTroops: current,
        maxTroops: max,
      };
    }

    return readTroopStateFromControlPanelText(panel);
  }

  function readTroopStateFromControlPanelText(panel) {
    const root = panel.shadowRoot;
    if (!root) {
      return null;
    }

    const text = root.textContent || "";
    const match = text.match(/([0-9]+(?:\.[0-9]+)?[KM]?)\s*\/\s*([0-9]+(?:\.[0-9]+)?[KM]?)/i);
    if (!match) {
      return null;
    }

    const current = parseDisplayedTroops(match[1]);
    const max = parseDisplayedTroops(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
      return null;
    }

    return {
      currentTroops: displayTroopsToInternal(current),
      maxTroops: displayTroopsToInternal(max),
    };
  }

  function analyzeTroopCurve(currentTroops, maxTroops) {
    const current = clamp(currentTroops, 0, maxTroops);
    const samples = buildTroopCurveSamples(maxTroops);
    const optimal = findOptimalTroopPoint(maxTroops);
    const plateauTroops = maxTroops * TROOPS.PLATEAU_RATIO;

    return {
      currentTroops: current,
      maxTroops,
      currentRatio: current / maxTroops,
      currentRatePerSecond: troopIncreasePerSecond(current, maxTroops),
      optimalTroops: optimal.troops,
      optimalRatio: optimal.troops / maxTroops,
      optimalRatePerSecond: optimal.ratePerSecond,
      plateauTroops,
      plateauRatio: TROOPS.PLATEAU_RATIO,
      maxGraphRate: Math.max(...samples.map((sample) => sample.ratePerSecond), optimal.ratePerSecond, 1),
      samples,
      timeToOptimalSeconds: current < optimal.troops ? secondsToTroopTarget(current, maxTroops, optimal.troops) : 0,
      timeToPlateauSeconds: current < plateauTroops ? secondsToTroopTarget(current, maxTroops, plateauTroops) : 0,
    };
  }

  function troopIncreasePerTick(troops, maxTroops) {
    if (maxTroops <= 0 || troops >= maxTroops) {
      return 0;
    }

    const toAdd = (10 + Math.pow(Math.max(troops, 0), 0.73) / 4) * (1 - troops / maxTroops);
    return Math.min(troops + toAdd, maxTroops) - troops;
  }

  function troopIncreasePerSecond(troops, maxTroops) {
    return troopIncreasePerTick(troops, maxTroops) / TROOPS.TICK_SECONDS;
  }

  function buildTroopCurveSamples(maxTroops) {
    return Array.from({ length: TROOPS.GRAPH_POINTS + 1 }, (_, index) => {
      const ratio = index / TROOPS.GRAPH_POINTS;
      const troops = maxTroops * ratio;
      return {
        ratio,
        troops,
        ratePerSecond: troopIncreasePerSecond(troops, maxTroops),
      };
    });
  }

  function findOptimalTroopPoint(maxTroops) {
    let bestTroops = 0;
    let bestRate = 0;

    for (let index = 0; index <= TROOPS.OPTIMAL_SEARCH_STEPS; index += 1) {
      const troops = (maxTroops * index) / TROOPS.OPTIMAL_SEARCH_STEPS;
      const rate = troopIncreasePerSecond(troops, maxTroops);
      if (rate > bestRate) {
        bestRate = rate;
        bestTroops = troops;
      }
    }

    return {
      troops: bestTroops,
      ratePerSecond: bestRate,
    };
  }

  function secondsToTroopTarget(currentTroops, maxTroops, targetTroops) {
    let troops = clamp(currentTroops, 0, maxTroops);
    const target = clamp(targetTroops, 0, maxTroops);
    let ticks = 0;
    const maxTicks = 60 * 60 * 10;

    while (troops < target && ticks < maxTicks) {
      const increment = troopIncreasePerTick(troops, maxTroops);
      if (increment <= 0) {
        return Infinity;
      }
      troops += increment;
      ticks += 1;
    }

    return ticks * TROOPS.TICK_SECONDS;
  }

  function buildTroopCurveSvg(analysis) {
    const width = 300;
    const height = 132;
    const pad = { left: 24, right: 10, top: 10, bottom: 20 };
    const graphWidth = width - pad.left - pad.right;
    const graphHeight = height - pad.top - pad.bottom;
    const point = (ratio, rate) => {
      const x = pad.left + ratio * graphWidth;
      const y = pad.top + graphHeight - (rate / analysis.maxGraphRate) * graphHeight;
      return { x, y };
    };
    const path = analysis.samples
      .map((sample, index) => {
        const p = point(sample.ratio, sample.ratePerSecond);
        return `${index === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(" ");
    const current = point(analysis.currentRatio, analysis.currentRatePerSecond);
    const optimal = point(analysis.optimalRatio, analysis.optimalRatePerSecond);
    const plateau = point(analysis.plateauRatio, troopIncreasePerSecond(analysis.plateauTroops, analysis.maxTroops));

    return `
      <line class="of-tools-graph-grid" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + graphHeight}" />
      <line class="of-tools-graph-grid" x1="${pad.left}" y1="${pad.top + graphHeight}" x2="${pad.left + graphWidth}" y2="${pad.top + graphHeight}" />
      <line class="of-tools-graph-grid" x1="${pad.left}" y1="${pad.top + graphHeight / 2}" x2="${pad.left + graphWidth}" y2="${pad.top + graphHeight / 2}" />
      <line class="of-tools-graph-marker" stroke="#22c55e" x1="${optimal.x.toFixed(1)}" y1="${pad.top}" x2="${optimal.x.toFixed(1)}" y2="${pad.top + graphHeight}" />
      <line class="of-tools-graph-marker" stroke="#fbbf24" x1="${plateau.x.toFixed(1)}" y1="${pad.top}" x2="${plateau.x.toFixed(1)}" y2="${pad.top + graphHeight}" />
      <path class="of-tools-graph-curve" d="${path}" />
      <circle class="of-tools-graph-dot" cx="${current.x.toFixed(1)}" cy="${current.y.toFixed(1)}" r="4" />
      <text x="${pad.left}" y="${height - 5}" fill="#94a3b8" font-size="9">0%</text>
      <text x="${optimal.x.toFixed(1)}" y="9" fill="#86efac" font-size="9" text-anchor="middle">opt</text>
      <text x="${plateau.x.toFixed(1)}" y="9" fill="#fde68a" font-size="9" text-anchor="middle">80%</text>
      <text x="${width - 11}" y="${height - 5}" fill="#94a3b8" font-size="9" text-anchor="end">100%</text>
    `;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function parseDisplayedTroops(value) {
    const normalized = String(value).trim().replaceAll(",", "").toUpperCase();
    const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([KM]?)$/);
    if (!match) {
      return Number.NaN;
    }
    const number = Number(match[1]);
    const suffix = match[2];
    if (suffix === "M") return number * 1_000_000;
    if (suffix === "K") return number * 1_000;
    return number;
  }

  function displayTroopsToInternal(value) {
    return Math.max(0, Number(value) || 0) * 10;
  }

  function internalTroopsToDisplay(value) {
    return Math.max(0, Number(value) || 0) / 10;
  }

  function formatTroopInput(value) {
    return String(Math.round(internalTroopsToDisplay(value)));
  }

  function formatDisplayTroops(value) {
    return formatCompactNumber(internalTroopsToDisplay(value));
  }

  function formatTroopsPerSecond(value) {
    return formatCompactNumber(value / 10);
  }

  function formatCompactNumber(value) {
    const num = Math.max(0, Number(value) || 0);
    if (num >= 10_000_000) return `${(Math.floor(num / 100000) / 10).toFixed(1)}M`;
    if (num >= 1_000_000) return `${(Math.floor(num / 10000) / 100).toFixed(2)}M`;
    if (num >= 100_000) return `${Math.floor(num / 1000)}K`;
    if (num >= 10_000) return `${(Math.floor(num / 100) / 10).toFixed(1)}K`;
    if (num >= 1_000) return `${(Math.floor(num / 10) / 100).toFixed(2)}K`;
    return String(Math.floor(num));
  }

  function formatTargetTime(seconds) {
    if (seconds === 0) {
      return "now";
    }
    if (!Number.isFinite(seconds)) {
      return "-";
    }
    const total = Math.ceil(seconds);
    const minutes = Math.floor(total / 60);
    const remainder = total % 60;
    if (minutes <= 0) {
      return `${remainder}s`;
    }
    return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
  }

  function formatCost(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatGold(value) {
    const millions = Math.max(0, Number(value) || 0) / 1_000_000;
    if (millions >= 1_000) {
      return `${(Math.floor(millions / 10) / 100).toFixed(2)}B`;
    }
    return `${formatCost(millions)}M`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  // ---------------------------------------------------------------------------
  // Diagnostics and Startup
  // ---------------------------------------------------------------------------

  function isDebugEnabled() {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  }

  function debugLog(...args) {
    if (isDebugEnabled()) {
      console.debug("[OpenFront Tools]", ...args);
    }
  }

  function reportError(scope, error) {
    const message = error?.stack || error?.message || String(error);
    const key = `${scope}:${message}`;
    if (!isDebugEnabled() && reportedErrors.has(key)) {
      return;
    }

    reportedErrors.add(key);
    console.warn(`[OpenFront Tools] ${scope}`, error);
  }

  function installDebugApi() {
    window.OpenFrontTools = {
      version: VERSION,
      enableDebug() {
        localStorage.setItem(DEBUG_STORAGE_KEY, "1");
        console.info("[OpenFront Tools] Debug logging enabled");
      },
      disableDebug() {
        localStorage.removeItem(DEBUG_STORAGE_KEY);
        console.info("[OpenFront Tools] Debug logging disabled");
      },
      isDebugEnabled,
    };
  }

  function start() {
    if (!document.getElementById(`${APP_ID}-style`)) {
      installStyles();
    }

    installDebugApi();
    syncPanels();
    window.setInterval(() => renderPanel("mirv"), 1000);
    window.setInterval(() => renderPanel("troops"), 1000);
    window.setInterval(() => renderPanel("mirvWatch"), 1000);
    window.setInterval(() => renderPanel("cleanup"), 1000);
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
