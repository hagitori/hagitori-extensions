// SakuraMangás — sakuramangas.org
// Browser-based extension: intercept for manga info, active-page scraping for chapters

import * as h from "./helpers";

// ═══════════════════════════════════════════════════════════════
// EXTENSION
// ═══════════════════════════════════════════════════════════════

class SakuraMangasExtension implements HagitoriExtension {

  async getManga(url: string): Promise<Manga> {
    h.setCachedMangaInfo(null);

    const slug = h.extractSlug(url);
    const fullUrl = `${h.BASE_URL}/${slug}`;

    // Bypass Cloudflare (cookies propagated to session store)
    await h.ensureCloudflareBypass();

    const pageData = await browser.intercept(fullUrl, {
      responses: ["__obf__manga_info"],
      waitTime: h.WAIT_SECONDS,
    });

    // Extract manga data from intercepted responses
    const mangaData = h.findMangaResponse(pageData.responses);
    if (!mangaData) {
      throw new Error(
        "Não foi possível obter informações do mangá. Tente novamente."
      );
    }
    h.setCachedMangaInfo(mangaData);

    const title = mangaData.titulo || mangaData.title || slug;
    const coverUrl = `${h.BASE_URL}/${slug}/thumb_256.jpg`;
    return new Manga({ id: slug, name: title, cover: coverUrl });
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    console.log(`[SakuraMangás] getChapters: starting for ${mangaId}`);
    await h.ensureCloudflareBypass();

    const fullUrl = `${h.BASE_URL}/${mangaId}`;
    const chapterSelector = ".chapter-item.parent[data-url]";

    const finish = async (chapters: Chapter[]): Promise<Chapter[]> => {
      await browser.close();
      h.setCfBypassed(false);
      return chapters;
    };

    // Navigate and wait for initial chapters to render
    console.log(`[SakuraMangás] getChapters: navigating to ${fullUrl}`);
    await browser.navigate(fullUrl, {
      waitForSelector: chapterSelector,
      timeout: 30_000,
    });
    console.log("[SakuraMangás] getChapters: navigate done, waiting for ver-mais button...");

    // Wait for the "ver mais" button to become VISIBLE (not just exist in DOM).
    // The site creates it hidden and shows it via JS after the AJAX confirms has_more.
    const hasVerMaisVisible = await browser.waitForFunction(
      `(() => { const btn = document.querySelector('#ver-mais'); return !!(btn && btn.offsetParent !== null); })()`,
      8000,
    );
    console.log(`[SakuraMangás] getChapters: ver-mais visible=${hasVerMaisVisible}`);

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
      console.log(`[SakuraMangás] getChapters: no ver-mais, returning ${scraped.length} chapters`);
      return finish(h.scrapedToChapters(scraped, mangaId));
    }

    let lastCount = 0;
    let stalledRounds = 0;
    const maxStalled = 3;
    const maxIterations = 200;

    for (let i = 0; i < maxIterations; i++) {
      // Scrape current chapters from the DOM
      const raw = await browser.evaluate(`
        JSON.stringify(
          Array.from(document.querySelectorAll('${chapterSelector}')).map(el => ({
            id: el.getAttribute('data-id') || '',
            url: el.getAttribute('data-url') || '',
            title: (el.querySelector('a.a-scan') || {}).textContent?.trim() || ''
          }))
        )
      `);
      const scraped: Array<{ id: string; url: string; title: string }> = JSON.parse(JSON.parse(raw));
      const count = scraped.length;

      // Check if "ver mais" button is still visible
      const btnVisible = await browser.evaluate(`
        JSON.stringify((() => {
          const btn = document.querySelector('#ver-mais');
          return !!(btn && btn.offsetParent !== null);
        })())
      `);
      const hasMore = JSON.parse(JSON.parse(btnVisible)) === true;
      console.log(`[SakuraMangás] getChapters: round ${i}, chapters=${count}, hasMore=${hasMore}`);

      if (!hasMore) {
        console.log(`[SakuraMangás] getChapters: no more chapters, returning ${count}`);
        return finish(h.scrapedToChapters(scraped, mangaId));
      }

      // Stall detection
      if (count === lastCount && i > 0) {
        stalledRounds++;
        if (stalledRounds >= maxStalled) {
          console.warn(`[SakuraMangás] chapter count stalled at ${count}, stopping`);
          return finish(h.scrapedToChapters(scraped, mangaId));
        }
        await sleep(1500);
        continue;
      }
      stalledRounds = 0;
      lastCount = count;

      // Click "ver mais" and wait for new chapters to appear
      console.log(`[SakuraMangás] getChapters: clicking ver-mais...`);
      await browser.click("#ver-mais");
      const waitResult = await browser.waitForFunction(
        `document.querySelectorAll('${chapterSelector}').length > ${count}`,
        15_000,
      );
      console.log(`[SakuraMangás] getChapters: waitForFunction result=${waitResult}`);
      await sleep(600);
    }

    // Fallback: return whatever we have
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
    console.log(`[SakuraMangás] getChapters: fallback returning ${fallback.length}`);
    return finish(h.scrapedToChapters(fallback, mangaId));
  }

  async getPages(chapter: Chapter): Promise<Pages> {
    let chapterId = chapter.id;
    if (!chapterId.endsWith("/")) chapterId += "/";
    const fullUrl = `${h.BASE_URL}/${chapterId}`;

    await h.ensureCloudflareBypass();

    // Intercept to get the image hash from /imagens/ requests
    const pageData = await browser.intercept(fullUrl, {
      requests: ["/imagens/"],
      waitTime: h.WAIT_SECONDS_PAGES,
    });

    let imageHash: string | null = null;
    let imageExtension = "jpg";

    for (const req of pageData.requests) {
      const match = req.url.match(
        /\/imagens\/([a-f0-9]{32,})\/(\d{3})\.(jpg|png|webp|gif)/i
      );
      if (match) {
        imageHash = match[1];
        imageExtension = match[3].toLowerCase();
        break;
      }
    }

    if (!imageHash) {
      throw new Error(
        "Não foi possível obter o hash da imagem. Tente novamente."
      );
    }
    console.log(`[SakuraMangás] getPages: hash=${imageHash}, ext=${imageExtension}`);

    // Navigate with active-page to get numPages from the scroll counter
    console.log("[SakuraMangás] getPages: navigating for counter...");
    await browser.navigate(fullUrl, {
      waitForSelector: ".div-modo.div-scroll",
      timeout: 15_000,
    });

    // Force the Scroll button to a fixed position in the viewport.
    // The page loads scrolled down past the button, and scrollIntoView doesn't
    // work reliably for it. position:fixed guarantees positive viewport coords.
    await browser.evaluate(`(() => {
      const btn = document.querySelector('.div-modo.div-scroll');
      if (!btn) return false;
      btn.style.position = 'fixed';
      btn.style.top = '200px';
      btn.style.left = '200px';
      btn.style.zIndex = '999999';
      return true;
    })()`);
    await sleep(500);

    // Click "Scroll" mode button repeatedly until the counter activates.
    let numPages = 0;
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`[SakuraMangás] getPages: clicking scroll button (attempt ${attempt + 1}/${maxAttempts})...`);
      await browser.click(".div-modo.div-scroll");
      await sleep(500);

      const hasCounter = await browser.waitForFunction(
        `(() => { const el = document.querySelector('#scroll-page-counter'); return !!(el && el.textContent && el.textContent.includes('/')); })()`,
        3_000,
      );

      if (hasCounter) {
        const counterRaw = await browser.evaluate(
          `JSON.stringify(document.querySelector('#scroll-page-counter').textContent.trim())`
        );
        const counterText: string = JSON.parse(JSON.parse(counterRaw));
        console.log(`[SakuraMangás] getPages: counter text = "${counterText}"`);
        const numMatch = counterText.match(/\/\s*(\d+)/);
        if (numMatch) {
          numPages = parseInt(numMatch[1]);
          break;
        }
      }

      await sleep(800);
    }

    await browser.close();
    h.setCfBypassed(false);

    if (numPages <= 0) {
      throw new Error(
        "Não foi possível determinar o número de páginas do capítulo. Tente novamente."
      );
    }

    // Build image URLs
    const pageUrls: string[] = [];
    for (let p = 1; p <= numPages; p++) {
      const padded = String(p).padStart(3, "0");
      pageUrls.push(
        `${h.BASE_URL}/imagens/${imageHash}/${padded}.${imageExtension}`
      );
    }

    const imgHeaders: Record<string, string> = {
      Accept: h.IMG_ACCEPT,
      "Content-Type": h.IMG_CONTENT_TYPE,
      "Accept-Language": h.IMG_ACCEPT_LANG,
      "X-Requested-With": h.IMG_X_REQUESTED_WITH,
      "X-Signature-Version": h.IMG_X_SIGNATURE_VERSION,
      "X-Realtime": h.generateXRealtime(),
      Referer: fullUrl,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    };

    return new Pages({
      id: chapter.id,
      number: chapter.number,
      name: chapter.name,
      urls: pageUrls,
      useBrowser: false,
      headers: imgHeaders,
    });
  }

  async getDetails(mangaId: string): Promise<any> {
    let data = h.cachedMangaInfo;

    if (!data) {
      const fullUrl = `${h.BASE_URL}/${mangaId}`;

      // Bypass Cloudflare se necessário
      await h.ensureCloudflareBypass();

      const pageData = await browser.intercept(fullUrl, {
        responses: ["__obf__manga_info"],
        waitTime: h.WAIT_SECONDS,
      });
      data = h.findMangaResponse(pageData.responses);

      if (!data) {
        throw new Error(
          "Não foi possível obter detalhes do mangá. Tente novamente."
        );
      }
    }

    const title = data.titulo || data.title || mangaId;
    const cover = `${h.BASE_URL}/${mangaId}/thumb_256.jpg`;
    const synopsis: string | null = data.sinopse || null;

    // Status mapping
    let status: string | null = null;
    if (data.status) {
      const st = data.status.toLowerCase();
      if (st === "em andamento" || st === "ativo") status = "Em andamento";
      else if (st === "completo" || st === "finalizado") status = "Completo";
      else if (st === "cancelado") status = "Cancelado";
      else if (st === "hiato" || st === "em hiato") status = "Hiato";
      else status = data.status;
    }

    const tags: string[] | null =
      data.tags && Array.isArray(data.tags) && data.tags.length > 0
        ? data.tags
        : null;

    const alt_titles: string[] = [];
    if (data.demografia) alt_titles.push(`Demografia: ${data.demografia}`);
    if (data.ano) alt_titles.push(`Ano: ${data.ano}`);

    return {
      id: mangaId,
      name: title,
      cover,
      synopsis,
      author: data.autor || undefined,
      artist: data.artista || undefined,
      status,
      alt_titles: alt_titles.length > 0 ? alt_titles : null,
      tags,
    };
  }
}

// Expose to the Hagitori runtime
(globalThis as any).__extension_class__ = SakuraMangasExtension;
(globalThis as any).__extension__ = new SakuraMangasExtension();
