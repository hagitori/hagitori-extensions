// SakuraMangás — helper types, constants, and utility functions

export const BASE_URL = "https://sakuramangas.org";
export const WAIT_SECONDS = 10;
export const WAIT_SECONDS_PAGES = 8;

// Headers estáticos para requests de imagens (hardcoded no JS do site)
export const IMG_ACCEPT = "image/avif,image/webp,image/jpeg,image/png,image/svg+xml,image/*,*/*;q=0.8";
export const IMG_CONTENT_TYPE = "application/octet-stream";
export const IMG_ACCEPT_LANG = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.5";
export const IMG_X_REQUESTED_WITH = "ab4741de32I128opk";
export const IMG_X_SIGNATURE_VERSION = "v5-fetch-secure";

/**
 * Gera o header X-Realtime da mesma forma que o JS do site:
 * Math.random().toString(36).substring(2) + Date.now().toString(36)
 */
export function generateXRealtime(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

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
