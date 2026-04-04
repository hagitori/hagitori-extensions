// SakuraMangás — helper types, constants, and utility functions

export const BASE_URL = "https://sakuramangas.org";
export const WAIT_SECONDS = 10;
export const WAIT_SECONDS_PAGES = 8;
export const REQUEST_INTERVAL_MS = 500;
export const RATE_LIMIT_SELECTOR = "#rate-limit-challenge";
export const RATE_LIMIT_TRACK_SELECTOR = "#slider-track";
export const RATE_LIMIT_THUMB_SELECTOR = "#slider-thumb";
export const RATE_LIMIT_APPEAR_TIMEOUT_MS = 3_000;
export const RATE_LIMIT_POST_DRAG_TIMEOUT_MS = 5_000;
export const RATE_LIMIT_MAX_ATTEMPTS = 3;
export const RATE_LIMIT_POLL_INTERVAL_MS = 250;
export const RATE_LIMIT_DRAG_STEPS = 20;
export const RATE_LIMIT_DRAG_DURATION_MS = 420;
export const RATE_LIMIT_MIN_FORWARD_PX = 36;
export const RATE_LIMIT_RIGHT_PADDING_PX = 2;

// Headers estáticos para requests de imagens (hardcoded no JS do site)
export const IMG_ACCEPT = "image/webp,image/jpeg,image/png,image/svg+xml,image/*,*/*;q=0.9";
export const IMG_CONTENT_TYPE = "application/octet-stream";
export const IMG_ACCEPT_LANG = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.5";
export const IMG_X_REQUESTED_WITH = "ab4731de321128opk";
export const IMG_X_SIGNATURE_VERSION = "v7-fetch-secure";
export const IMG_X_HARRY_POTTER = "morsmordre";

/**
 * Gera o header X-Realtime da mesma forma que o JS do site:
 * Math.random().toString(36).substring(2) + Date.now().toString(36)
 */
export function generateXRealtime(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

type Point = {
  x: number;
  y: number;
};

type RateLimitSliderState = {
  visible: boolean;
  ready: boolean;
  from?: Point;
  to?: Point;
};

type ChapterImageAsset = {
  hash: string;
  extension: string;
};

const CHAPTER_IMAGE_URL_REGEX =
  /\/imagens\/([^/?#]+)\/(\d{3})\.(jpe?g|png|webp|gif)(?:[?#].*)?$/i;

// ═══════════════════════════════════════════════════════════════
// Cache (shared state between getManga → getDetails)
// ═══════════════════════════════════════════════════════════════

export let cachedMangaInfo: any = null;
export let cfBypassed = false;

export function setCachedMangaInfo(v: any) { cachedMangaInfo = v; }
export function setCfBypassed(v: boolean) { cfBypassed = v; }

// ═══════════════════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════════════════

/** Extract the manga slug from a URL or path. */
export function extractSlug(url: string): string {
  if (url.startsWith("http")) {
    url = url.replace(/^https?:\/\/sakuramangas\.org\/?/, "");
  }
  return url.replace(/^\//, "").replace(/\/$/, "");
}

function parseBrowserJson<T>(raw: string): T {
  return JSON.parse(JSON.parse(raw)) as T;
}

function normalizeChapterImageExtension(extension: string): string {
  const normalized = extension.toLowerCase();
  return normalized === "jpeg" ? "jpg" : normalized;
}

function parseChapterImageAsset(url: string): ChapterImageAsset | null {
  const match = url.match(CHAPTER_IMAGE_URL_REGEX);
  if (!match) {
    return null;
  }

  return {
    hash: match[1],
    extension: normalizeChapterImageExtension(match[3]),
  };
}

export function findChapterImageAssetFromRequests(
  requests: Array<{ url: string }>,
): ChapterImageAsset | null {
  for (const request of requests) {
    const asset = parseChapterImageAsset(request.url);
    if (asset) {
      return asset;
    }
  }

  return null;
}

async function readRateLimitSliderState(): Promise<RateLimitSliderState | null> {
  const raw = await browser.evaluate(`
    JSON.stringify((() => {
      const root = document.querySelector('${RATE_LIMIT_SELECTOR}');
      if (!root) return null;

      const style = window.getComputedStyle(root);
      const rootRect = root.getBoundingClientRect();
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        rootRect.width > 0 &&
        rootRect.height > 0;

      if (!visible) return null;

      const track = document.querySelector('${RATE_LIMIT_TRACK_SELECTOR}');
      const thumb = document.querySelector('${RATE_LIMIT_THUMB_SELECTOR}');
      if (!track || !thumb) {
        return { visible: true, ready: false };
      }

      const trackRect = track.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      const fromX = thumbRect.left + (thumbRect.width / 2);
      const fromY = thumbRect.top + (thumbRect.height / 2);
      const targetX = Math.max(
        fromX + ${RATE_LIMIT_MIN_FORWARD_PX},
        trackRect.right - (thumbRect.width / 2) - ${RATE_LIMIT_RIGHT_PADDING_PX}
      );

      return {
        visible: true,
        ready: true,
        from: { x: fromX, y: fromY },
        to: { x: targetX, y: fromY },
      };
    })())
  `);

  return parseBrowserJson<RateLimitSliderState | null>(raw);
}

async function waitForRateLimitSlider(
  appearTimeoutMs: number,
): Promise<RateLimitSliderState | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < appearTimeoutMs) {
    const state = await readRateLimitSliderState();
    if (state?.visible) {
      return state;
    }
    await sleep(RATE_LIMIT_POLL_INTERVAL_MS);
  }

  return readRateLimitSliderState();
}

export async function solveRateLimitSliderIfPresent(
  context: string,
  appearTimeoutMs = RATE_LIMIT_APPEAR_TIMEOUT_MS,
): Promise<boolean> {
  for (let attempt = 1; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
    const state = await waitForRateLimitSlider(appearTimeoutMs);
    if (!state?.visible) {
      return false;
    }

    if (!state.ready || !state.from || !state.to) {
      console.warn(
        `[SakuraMangás] ${context}: rate-limit challenge visible but slider is not ready (attempt ${attempt}/${RATE_LIMIT_MAX_ATTEMPTS})`
      );
      await sleep(400);
      continue;
    }

    console.warn(
      `[SakuraMangás] ${context}: rate-limit challenge detected, solving slider (attempt ${attempt}/${RATE_LIMIT_MAX_ATTEMPTS})`
    );

    await browser.drag(state.from, state.to, {
      steps: RATE_LIMIT_DRAG_STEPS,
      durationMs: RATE_LIMIT_DRAG_DURATION_MS,
    });

    const solved = await browser.waitForFunction(
      `(() => {
        const root = document.querySelector('${RATE_LIMIT_SELECTOR}');
        if (!root) return true;
        const style = window.getComputedStyle(root);
        const rect = root.getBoundingClientRect();
        return (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          rect.width === 0 ||
          rect.height === 0
        );
      })()`,
      RATE_LIMIT_POST_DRAG_TIMEOUT_MS,
    );

    if (solved) {
      console.log(`[SakuraMangás] ${context}: slider solved`);
      await sleep(500);
      return true;
    }

    console.warn(
      `[SakuraMangás] ${context}: slider drag finished but challenge is still visible`
    );
    await sleep(500);
  }

  throw new Error(
    "Não foi possível resolver o slide de rate limit da Sakura Mangás."
  );
}



/** Try to parse a JSON body from a response, returning null on failure. */
export function tryParseBody(body: any): any | null {
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return null; }
  }
  return body ?? null;
}

/** Find the first response matching a URL pattern that has manga data. */
export function findMangaResponse(responses: any[]): any | null {
  for (const resp of responses) {
    const body = tryParseBody(resp.body);
    if (body && (body.titulo || body.title)) return body;
  }
  return null;
}

/** Converts DOM-scraped chapter data into Chapter objects. */
export function scrapedToChapters(
  scraped: Array<{ id: string; url: string; title: string }>,
  mangaId: string,
): Chapter[] {
  return scraped.map((ch, i) => {
    let url = ch.url;
    if (url.startsWith("/")) url = url.substring(1);

    const parts = url.replace(/\/$/, "").split("/");
    const chapterNum = parts[parts.length - 1] || String(i + 1);

    return new Chapter({
      id: url || `${mangaId}/${ch.id}`,
      number: chapterNum,
      name: mangaId,
      title: ch.title || undefined,
    });
  });
}

/**
 * Garante que o bypass de Cloudflare foi feito.
 * Cookies e UA são propagados automaticamente para o session store.
 */
export async function ensureCloudflareBypass(): Promise<void> {
  if (cfBypassed) return;

  console.log("[SakuraMangás] Iniciando bypass de Cloudflare...");
  const result = await browser.bypassCloudflare(BASE_URL);

  if (result.hasCfClearance) {
    console.log("[SakuraMangás] Bypass OK — cf_clearance obtido");
  } else {
    console.warn("[SakuraMangás] Bypass concluído sem cf_clearance");
  }

  setCfBypassed(true);
}
