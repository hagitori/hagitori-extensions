// Transpiled from sakuramangas.ts
"use strict";
(() => {
  // src/pt-br/sakuramangas/helpers.ts
  var BASE_URL = "https://sakuramangas.org";
  var WAIT_SECONDS = 10;
  var WAIT_SECONDS_PAGES = 8;
  var REQUEST_INTERVAL_MS = 500;
  var RATE_LIMIT_SELECTOR = "#rate-limit-challenge";
  var RATE_LIMIT_TRACK_SELECTOR = "#slider-track";
  var RATE_LIMIT_THUMB_SELECTOR = "#slider-thumb";
  var RATE_LIMIT_APPEAR_TIMEOUT_MS = 3e3;
  var RATE_LIMIT_POST_DRAG_TIMEOUT_MS = 5e3;
  var RATE_LIMIT_MAX_ATTEMPTS = 3;
  var RATE_LIMIT_POLL_INTERVAL_MS = 250;
  var RATE_LIMIT_DRAG_STEPS = 20;
  var RATE_LIMIT_DRAG_DURATION_MS = 420;
  var RATE_LIMIT_MIN_FORWARD_PX = 36;
  var RATE_LIMIT_RIGHT_PADDING_PX = 2;
  var IMG_ACCEPT = "image/webp,image/jpeg,image/png,image/svg+xml,image/*,*/*;q=0.9";
  var IMG_CONTENT_TYPE = "application/octet-stream";
  var IMG_ACCEPT_LANG = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.5";
  var IMG_X_REQUESTED_WITH = "ab4731de321128opk";
  var IMG_X_SIGNATURE_VERSION = "v7-fetch-secure";
  var IMG_X_HARRY_POTTER = "morsmordre";
  function generateXRealtime() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
  var CHAPTER_IMAGE_URL_REGEX = /\/imagens\/([^/?#]+)\/(\d{3})\.(jpe?g|png|webp|gif)(?:[?#].*)?$/i;
  var cachedMangaInfo = null;
  var cfBypassed = false;
  function setCachedMangaInfo(v) {
    cachedMangaInfo = v;
  }
  function setCfBypassed(v) {
    cfBypassed = v;
  }
  function extractSlug(url) {
    if (url.startsWith("http")) {
      url = url.replace(/^https?:\/\/sakuramangas\.org\/?/, "");
    }
    return url.replace(/^\//, "").replace(/\/$/, "");
  }
  function parseBrowserJson(raw) {
    return JSON.parse(JSON.parse(raw));
  }
  function normalizeChapterImageExtension(extension) {
    const normalized = extension.toLowerCase();
    return normalized === "jpeg" ? "jpg" : normalized;
  }
  function parseChapterImageAsset(url) {
    const match = url.match(CHAPTER_IMAGE_URL_REGEX);
    if (!match) {
      return null;
    }
    return {
      hash: match[1],
      extension: normalizeChapterImageExtension(match[3])
    };
  }
  function findChapterImageAssetFromRequests(requests) {
    for (const request of requests) {
      const asset = parseChapterImageAsset(request.url);
      if (asset) {
        return asset;
      }
    }
    return null;
  }
  async function readRateLimitSliderState() {
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
    return parseBrowserJson(raw);
  }
  async function waitForRateLimitSlider(appearTimeoutMs) {
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
  async function solveRateLimitSliderIfPresent(context, appearTimeoutMs = RATE_LIMIT_APPEAR_TIMEOUT_MS) {
    for (let attempt = 1; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
      const state = await waitForRateLimitSlider(appearTimeoutMs);
      if (!state?.visible) {
        return false;
      }
      if (!state.ready || !state.from || !state.to) {
        console.warn(
          `[SakuraMang\xE1s] ${context}: rate-limit challenge visible but slider is not ready (attempt ${attempt}/${RATE_LIMIT_MAX_ATTEMPTS})`
        );
        await sleep(400);
        continue;
      }
      console.warn(
        `[SakuraMang\xE1s] ${context}: rate-limit challenge detected, solving slider (attempt ${attempt}/${RATE_LIMIT_MAX_ATTEMPTS})`
      );
      await browser.drag(state.from, state.to, {
        steps: RATE_LIMIT_DRAG_STEPS,
        durationMs: RATE_LIMIT_DRAG_DURATION_MS
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
        RATE_LIMIT_POST_DRAG_TIMEOUT_MS
      );
      if (solved) {
        console.log(`[SakuraMang\xE1s] ${context}: slider solved`);
        await sleep(500);
        return true;
      }
      console.warn(
        `[SakuraMang\xE1s] ${context}: slider drag finished but challenge is still visible`
      );
      await sleep(500);
    }
    throw new Error(
      "N\xE3o foi poss\xEDvel resolver o slide de rate limit da Sakura Mang\xE1s."
    );
  }
  function tryParseBody(body) {
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    }
    return body ?? null;
  }
  function findMangaResponse(responses) {
    for (const resp of responses) {
      const body = tryParseBody(resp.body);
      if (body && (body.titulo || body.title)) return body;
    }
    return null;
  }
  function scrapedToChapters(scraped, mangaId) {
    return scraped.map((ch, i) => {
      let url = ch.url;
      if (url.startsWith("/")) url = url.substring(1);
      const parts = url.replace(/\/$/, "").split("/");
      const chapterNum = parts[parts.length - 1] || String(i + 1);
      return new Chapter({
        id: url || `${mangaId}/${ch.id}`,
        number: chapterNum,
        name: mangaId,
        title: ch.title || void 0
      });
    });
  }
  async function ensureCloudflareBypass() {
    if (cfBypassed) return;
    console.log("[SakuraMang\xE1s] Iniciando bypass de Cloudflare...");
    const result = await browser.bypassCloudflare(BASE_URL);
    if (result.hasCfClearance) {
      console.log("[SakuraMang\xE1s] Bypass OK \u2014 cf_clearance obtido");
    } else {
      console.warn("[SakuraMang\xE1s] Bypass conclu\xEDdo sem cf_clearance");
    }
    setCfBypassed(true);
  }

  // src/pt-br/sakuramangas/sakuramangas.ts
  var SakuraMangasExtension = class {
    async getManga(url) {
      setCachedMangaInfo(null);
      const slug = extractSlug(url);
      const fullUrl = `${BASE_URL}/${slug}`;
      await ensureCloudflareBypass();
      const pageData = await browser.intercept(fullUrl, {
        responses: ["__obf__manga_info"],
        waitTime: WAIT_SECONDS
      });
      const mangaData = findMangaResponse(pageData.responses);
      if (!mangaData) {
        throw new Error(
          "N\xE3o foi poss\xEDvel obter informa\xE7\xF5es do mang\xE1. Tente novamente."
        );
      }
      setCachedMangaInfo(mangaData);
      const title = mangaData.titulo || mangaData.title || slug;
      const coverUrl = `${BASE_URL}/${slug}/thumb_256.jpg`;
      return new Manga({ id: slug, name: title, cover: coverUrl });
    }
    async getChapters(mangaId) {
      console.log(`[SakuraMang\xE1s] getChapters: starting for ${mangaId}`);
      await ensureCloudflareBypass();
      const fullUrl = `${BASE_URL}/${mangaId}`;
      const chapterSelector = ".chapter-item.parent[data-url]";
      const finish = async (chapters) => {
        await browser.close();
        setCfBypassed(false);
        return chapters;
      };
      console.log(`[SakuraMang\xE1s] getChapters: navigating to ${fullUrl}`);
      await browser.navigate(fullUrl);
      await solveRateLimitSliderIfPresent("getChapters:navigate", 4e3);
      let chaptersReady = await browser.waitForSelector(chapterSelector, 3e4);
      if (!chaptersReady) {
        await solveRateLimitSliderIfPresent("getChapters:chapter-list-timeout", 2e3);
        chaptersReady = await browser.waitForSelector(chapterSelector, 1e4);
      }
      if (!chaptersReady) {
        throw new Error(
          "N\xE3o foi poss\xEDvel carregar a lista de cap\xEDtulos da Sakura Mang\xE1s."
        );
      }
      console.log("[SakuraMang\xE1s] getChapters: navigate done, waiting for ver-mais button...");
      await solveRateLimitSliderIfPresent("getChapters:before-ver-mais", 1e3);
      const hasVerMaisVisible = await browser.waitForFunction(
        `(() => { const btn = document.querySelector('#ver-mais'); return !!(btn && btn.offsetParent !== null); })()`,
        8e3
      );
      console.log(`[SakuraMang\xE1s] getChapters: ver-mais visible=${hasVerMaisVisible}`);
      if (!hasVerMaisVisible) {
        const raw = await browser.evaluate(`
        JSON.stringify(
          Array.from(document.querySelectorAll('${chapterSelector}')).map(el => ({
            id: el.getAttribute('data-id') || '',
            url: el.getAttribute('data-url') || '',
            title: (el.querySelector('a.a-scan') || {}).textContent?.trim() || ''
          }))
        )
      `);
        const scraped = JSON.parse(JSON.parse(raw));
        console.log(`[SakuraMang\xE1s] getChapters: no ver-mais, returning ${scraped.length} chapters`);
        return finish(scrapedToChapters(scraped, mangaId));
      }
      let lastCount = 0;
      let stalledRounds = 0;
      const maxStalled = 3;
      const maxIterations = 200;
      for (let i = 0; i < maxIterations; i++) {
        await solveRateLimitSliderIfPresent(`getChapters:round-${i}`, 800);
        const raw = await browser.evaluate(`
        JSON.stringify(
          Array.from(document.querySelectorAll('${chapterSelector}')).map(el => ({
            id: el.getAttribute('data-id') || '',
            url: el.getAttribute('data-url') || '',
            title: (el.querySelector('a.a-scan') || {}).textContent?.trim() || ''
          }))
        )
      `);
        const scraped = JSON.parse(JSON.parse(raw));
        const count = scraped.length;
        const btnVisible = await browser.evaluate(`
        JSON.stringify((() => {
          const btn = document.querySelector('#ver-mais');
          return !!(btn && btn.offsetParent !== null);
        })())
      `);
        const hasMore = JSON.parse(JSON.parse(btnVisible)) === true;
        console.log(`[SakuraMang\xE1s] getChapters: round ${i}, chapters=${count}, hasMore=${hasMore}`);
        if (!hasMore) {
          console.log(`[SakuraMang\xE1s] getChapters: no more chapters, returning ${count}`);
          return finish(scrapedToChapters(scraped, mangaId));
        }
        if (count === lastCount && i > 0) {
          stalledRounds++;
          if (stalledRounds >= maxStalled) {
            console.warn(`[SakuraMang\xE1s] chapter count stalled at ${count}, stopping`);
            return finish(scrapedToChapters(scraped, mangaId));
          }
          await sleep(1500);
          continue;
        }
        stalledRounds = 0;
        lastCount = count;
        console.log(`[SakuraMang\xE1s] getChapters: clicking ver-mais...`);
        await solveRateLimitSliderIfPresent(`getChapters:before-click-${i}`, 800);
        await browser.click("#ver-mais");
        await sleep(400);
        await solveRateLimitSliderIfPresent(`getChapters:after-click-${i}`, 2e3);
        let waitResult = await browser.waitForFunction(
          `document.querySelectorAll('${chapterSelector}').length > ${count}`,
          15e3
        );
        if (!waitResult) {
          const solvedLateChallenge = await solveRateLimitSliderIfPresent(
            `getChapters:late-challenge-${i}`,
            1e3
          );
          if (solvedLateChallenge) {
            console.log("[SakuraMang\xE1s] getChapters: retrying ver-mais after slider...");
            await browser.click("#ver-mais");
            waitResult = await browser.waitForFunction(
              `document.querySelectorAll('${chapterSelector}').length > ${count}`,
              15e3
            );
          }
        }
        console.log(`[SakuraMang\xE1s] getChapters: waitForFunction result=${waitResult}`);
        await sleep(600);
      }
      const fallbackRaw = await browser.evaluate(`
      JSON.stringify(
        Array.from(document.querySelectorAll('${chapterSelector}')).map(el => ({
          id: el.getAttribute('data-id') || '',
          url: el.getAttribute('data-url') || '',
          title: (el.querySelector('a.a-scan') || {}).textContent?.trim() || ''
        }))
      )
    `);
      const fallback = JSON.parse(JSON.parse(fallbackRaw));
      console.log(`[SakuraMang\xE1s] getChapters: fallback returning ${fallback.length}`);
      return finish(scrapedToChapters(fallback, mangaId));
    }
    async getPages(chapter) {
      let chapterId = chapter.id;
      if (!chapterId.endsWith("/")) chapterId += "/";
      const fullUrl = `${BASE_URL}/${chapterId}`;
      await ensureCloudflareBypass();
      const openChapterAndSolveCaptcha = async (context) => {
        console.log(`[SakuraMang\xE1s] getPages: opening chapter (${context})...`);
        await browser.navigate(fullUrl);
        await solveRateLimitSliderIfPresent(`getPages:${context}`, 4e3);
      };
      const interceptImageAsset = async () => {
        const pageData = await browser.intercept(fullUrl, {
          requests: ["/imagens/"],
          waitTime: WAIT_SECONDS_PAGES
        });
        return findChapterImageAssetFromRequests(pageData.requests);
      };
      await openChapterAndSolveCaptcha("captcha-check");
      let imageAsset = await interceptImageAsset();
      if (!imageAsset) {
        console.warn(
          "[SakuraMang\xE1s] getPages: image hash not found after first intercept, retrying after captcha check..."
        );
        await openChapterAndSolveCaptcha("captcha-retry");
        imageAsset = await interceptImageAsset();
      }
      if (!imageAsset) {
        throw new Error(
          "N\xE3o foi poss\xEDvel obter o hash da imagem. Tente novamente."
        );
      }
      console.log(
        `[SakuraMang\xE1s] getPages: hash=${imageAsset.hash}, ext=${imageAsset.extension}`
      );
      console.log("[SakuraMang\xE1s] getPages: waiting for counter...");
      let scrollButtonReady = await browser.waitForSelector(
        "button.toggle-btn.div-scroll",
        15e3
      );
      if (!scrollButtonReady) {
        await solveRateLimitSliderIfPresent("getPages:scroll-button-timeout", 2e3);
        scrollButtonReady = await browser.waitForSelector(
          "button.toggle-btn.div-scroll",
          1e4
        );
      }
      if (!scrollButtonReady) {
        throw new Error(
          "N\xE3o foi poss\xEDvel carregar o bot\xE3o de leitura da Sakura Mang\xE1s."
        );
      }
      await browser.evaluate(`(() => {
      const btn = document.querySelector('button.toggle-btn.div-scroll');
      if (!btn) return false;
      btn.style.position = 'fixed';
      btn.style.top = '200px';
      btn.style.left = '200px';
      btn.style.zIndex = '999999';
      return true;
    })()`);
      await sleep(500);
      let numPages = 0;
      const maxAttempts = 8;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await solveRateLimitSliderIfPresent(
          `getPages:before-scroll-click-${attempt}`,
          800
        );
        console.log(`[SakuraMang\xE1s] getPages: clicking scroll button (attempt ${attempt + 1}/${maxAttempts})...`);
        await browser.click("button.toggle-btn.div-scroll");
        await sleep(500);
        await solveRateLimitSliderIfPresent(
          `getPages:after-scroll-click-${attempt}`,
          2e3
        );
        const hasCounter = await browser.waitForFunction(
          `(() => { const el = document.querySelector('#scroll-page-counter'); return !!(el && el.textContent && el.textContent.includes('/')); })()`,
          3e3
        );
        if (hasCounter) {
          const counterRaw = await browser.evaluate(
            `JSON.stringify(document.querySelector('#scroll-page-counter').textContent.trim())`
          );
          const counterText = JSON.parse(JSON.parse(counterRaw));
          console.log(`[SakuraMang\xE1s] getPages: counter text = "${counterText}"`);
          const numMatch = counterText.match(/\/\s*(\d+)/);
          if (numMatch) {
            numPages = parseInt(numMatch[1]);
            break;
          }
        }
        await sleep(800);
      }
      await browser.close();
      setCfBypassed(false);
      if (numPages <= 0) {
        throw new Error(
          "N\xE3o foi poss\xEDvel determinar o n\xFAmero de p\xE1ginas do cap\xEDtulo. Tente novamente."
        );
      }
      const pageUrls = [];
      for (let p = 1; p <= numPages; p++) {
        const padded = String(p).padStart(3, "0");
        pageUrls.push(
          `${BASE_URL}/imagens/${imageAsset.hash}/${padded}.${imageAsset.extension}`
        );
      }
      const imgHeaders = {
        Accept: IMG_ACCEPT,
        "Content-Type": IMG_CONTENT_TYPE,
        "Accept-Language": IMG_ACCEPT_LANG,
        "X-Requested-With": IMG_X_REQUESTED_WITH,
        "X-Signature-Version": IMG_X_SIGNATURE_VERSION,
        "X-Realtimes": generateXRealtime(),
        "X-Harry-Potter": IMG_X_HARRY_POTTER,
        Referer: fullUrl,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Pragma: "no-cache",
        "Cache-Control": "no-cache"
      };
      return new Pages({
        id: chapter.id,
        number: chapter.number,
        name: chapter.name,
        urls: pageUrls,
        requestIntervalMs: REQUEST_INTERVAL_MS,
        useBrowser: false,
        headers: imgHeaders
      });
    }
    async getDetails(mangaId) {
      let data = cachedMangaInfo;
      if (!data) {
        const fullUrl = `${BASE_URL}/${mangaId}`;
        await ensureCloudflareBypass();
        const pageData = await browser.intercept(fullUrl, {
          responses: ["__obf__manga_info"],
          waitTime: WAIT_SECONDS
        });
        data = findMangaResponse(pageData.responses);
        if (!data) {
          throw new Error(
            "N\xE3o foi poss\xEDvel obter detalhes do mang\xE1. Tente novamente."
          );
        }
      }
      const title = data.titulo || data.title || mangaId;
      const cover = `${BASE_URL}/${mangaId}/thumb_256.jpg`;
      const synopsis = data.sinopse || null;
      let status = null;
      if (data.status) {
        const st = data.status.toLowerCase();
        if (st === "em andamento" || st === "ativo") status = "Em andamento";
        else if (st === "completo" || st === "finalizado") status = "Completo";
        else if (st === "cancelado") status = "Cancelado";
        else if (st === "hiato" || st === "em hiato") status = "Hiato";
        else status = data.status;
      }
      const tags = data.tags && Array.isArray(data.tags) && data.tags.length > 0 ? data.tags : null;
      const alt_titles = [];
      if (data.demografia) alt_titles.push(`Demografia: ${data.demografia}`);
      if (data.ano) alt_titles.push(`Ano: ${data.ano}`);
      return {
        id: mangaId,
        name: title,
        cover,
        synopsis,
        author: data.autor || void 0,
        artist: data.artista || void 0,
        status,
        alt_titles: alt_titles.length > 0 ? alt_titles : null,
        tags
      };
    }
  };
  globalThis.__extension_class__ = SakuraMangasExtension;
  globalThis.__extension__ = new SakuraMangasExtension();
})();
