// ─── Hagitori Extension SDK ────────────────────────────────────────────────
// TypeScript types for the Hagitori extension runtime.

// ── Extension Contract ─────────────────────────────────────────────────────

interface HagitoriExtension {
  getManga(url: string): Promise<Manga>;
  getChapters(mangaId: string): Promise<Chapter[]>;
  getPages(chapter: Chapter): Promise<Pages>;
  getDetails?(mangaId: string): Promise<MangaDetails>;
}

// ── Entities ───────────────────────────────────────────────────────────────

interface MangaDetails {
  id: string;
  name: string;
  cover?: string;
  synopsis?: string;
  author?: string;
  artist?: string;
  status?: string;
  alt_titles?: string[];
  tags?: string[];
}

// ── Entities ───────────────────────────────────────────────────────────────

declare class Manga {
  constructor(data: { id: string; name: string; cover?: string });
  id: string;
  name: string;
  cover: string | null;
  source: string;
}

declare class Chapter {
  constructor(data: {
    id: string;
    number: string;
    name: string;
    title?: string;
    date?: string;
    scanlator?: string;
  });
  id: string;
  number: string;
  name: string;
  title: string | null;
  date: string | null;
  scanlator: string | null;
}

declare class Pages {
  constructor(data: {
    id: string;
    number: string;
    name: string;
    urls: string[];
    headers?: Record<string, string>;
    useBrowser?: boolean;
  });
  chapter_id: string;
  chapter_number: string;
  manga_name: string;
  pages: string[];
  headers: Record<string, string> | null;
  useBrowser: boolean;
}

// ── HTTP (fetch) ───────────────────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  form?: Record<string, string>;
  referer?: string;
}

interface FetchResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  text(): string;
  json(): any;
  bytes(): number[];
}

declare function fetch(url: string, options?: FetchOptions): Promise<FetchResponse>;

// ── DOM (parseHtml) ────────────────────────────────────────────────────────

declare class Element {
  // ── Reading ──
  text(): string;
  html(): string;
  outerHtml(): string;
  attr(name: string): string | null;
  hasAttribute(name: string): boolean;
  attributes(): Record<string, string>;
  readonly tagName: string | null;

  // ── CSS Selection ──
  select(css: string): Element[];
  selectOne(css: string): Element | null;

  // ── Attribute Manipulation ──
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;

  // ── Content Manipulation ──
  setText(text: string): void;
  setHtml(html: string): void;

  // ── Tree Manipulation ──
  appendChild(child: Element): void;
  prependChild(child: Element): void;
  insertBefore(newChild: Element, refChild: Element): void;
  insertAfter(newChild: Element, refChild: Element): void;
  remove(): void;
  removeChildren(): void;

  // ── Traversal ──
  parent(): Element | null;
  children(): Element[];
  firstChild(): Element | null;
  lastChild(): Element | null;
  nextSibling(): Element | null;
  prevSibling(): Element | null;
}

declare class Document {
  select(css: string): Element[];
  selectOne(css: string): Element | null;
  text(): string;
  html(): string;
  serialize(): string;
  createElement(tag: string): Element;
  createTextNode(text: string): Element;
}

declare function parseHtml(html: string): Document;

// ── Browser (requires "browser" capability) ───────────────────────────────

interface InterceptedRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  postBody?: string;
  resourceType?: string;
}

interface InterceptedResponse {
  url: string;
  status: number;
  body: any;
  headers?: Record<string, string>;
}

interface InterceptOptions {
  /** Wait time in seconds (default: 30). */
  waitTime?: number;
}

interface InterceptAllOptions {
  /** URL patterns to intercept requests. */
  requests?: string[];
  /** URL patterns to intercept responses. */
  responses?: string[];
  /** Wait time in seconds (default: 30). */
  waitTime?: number;
}

interface InterceptResult {
  /** Intercepted requests. */
  readonly requests: InterceptedRequest[];
  /** Intercepted responses. */
  readonly responses: InterceptedResponse[];
}

interface CloudflareBypassOptions {
  /** If true, automatically clicks the Turnstile checkbox (default: true). */
  autoClick?: boolean;
}

interface CloudflareResult {
  /** Extracted cookies as { name: value }. */
  readonly cookies: Record<string, string>;
  /** User-agent of the browser used for bypass. */
  readonly userAgent: string;
  /** If true, the cf_clearance cookie was found. */
  readonly hasCfClearance: boolean;
  /** Cookies formatted as header: "name=value; name2=value2". */
  readonly cookieHeader: string;
}

interface NavigateOptions {
  /** CSS selector to wait for before resolving (optional). */
  waitForSelector?: string;
  /** Timeout in milliseconds for waitForSelector (default: 10000). */
  timeout?: number;
}

declare const browser: {
  /** Intercepts requests matching the patterns when navigating to the URL. */
  interceptRequests(url: string, patterns: string[], options?: InterceptOptions): Promise<string>;
  /** Intercepts responses matching the patterns when navigating to the URL. */
  interceptResponses(url: string, patterns: string[], options?: InterceptOptions): Promise<string>;
  /** Intercepts requests and responses simultaneously. */
  intercept(url: string, options?: InterceptAllOptions): Promise<InterceptResult>;
  /** Returns browser cookies as JSON string { name: value }. */
  getCookies(url: string): Promise<string>;
  /**
   * Cloudflare bypass via CDP disconnect.
   * Cookies and User-Agent are automatically propagated to the session store,
   * so subsequent fetch() calls already include the cookies.
   */
  bypassCloudflare(url: string, options?: CloudflareBypassOptions): Promise<CloudflareResult>;

  // ── Active-page API ──
  // These methods operate on a persistent page that stays open across calls,
  // enabling multi-step interactions (navigate -> evaluate -> click -> …).

  /** Navigates the active page to a URL. Optionally waits for a selector. */
  navigate(url: string, options?: NavigateOptions): Promise<void>;
  /**
   * Executes JavaScript on the active page and returns the result as a JSON string.
   * Use `JSON.parse()` on the result to get the actual value.
   */
  evaluate(jsCode: string): Promise<string>;
  /** Clicks the first element matching the CSS selector on the active page. */
  click(selector: string): Promise<void>;
  /** Waits for a CSS selector to match an element. Returns true if found, false on timeout. */
  waitForSelector(selector: string, timeout?: number): Promise<boolean>;
  /** Polls until the JS expression returns a truthy value. Returns true if truthy, false on timeout. */
  waitForFunction(jsCode: string, timeout?: number): Promise<boolean>;

  /** Closes the browser (including the active page). */
  close(): Promise<void>;
};

// ── Cookies ────────────────────────────────────────────────────────────────

declare const cookies: {
  set(domain: string, cookies: Record<string, string>): void;
  get(domain: string): Record<string, string>;
  remove(domain: string, name: string): void;
  clear(domain: string): void;
};

// ── Session ────────────────────────────────────────────────────────────────

declare const session: {
  setHeaders(domain: string, headers: Record<string, string>): void;
  setUserAgent(domain: string, ua: string): void;
};

// ── Crypto (requires "crypto" capability) ──────────────────────────────────

declare const crypto: {
  md5(input: string): string;
  sha256(input: string): string;
  sha512(input: string): string;
  hmacSha256(key: string, msg: string): string;
  hmacSha512(key: string, msg: string): string;
  randomUUID(): string;
  randomBytes(n: number): number[];
};

// ── Date ───────────────────────────────────────────────────────────────────

/**
 * Parses a date string in various formats.
 * Returns "dd-MM-yyyy" format or null on failure.
 * @param input - Date string (ISO, timestamps, common formats)
 * @param format - Optional Java format (e.g., "yyyy-MM-dd", "dd/MM/yyyy")
 */
declare function parseDate(input: string, format?: string): string | null;

// ── Utils ──────────────────────────────────────────────────────────────────

declare function atob(encoded: string): string;
declare function btoa(data: string): string;
declare function sleep(ms: number): Promise<void>;
declare function setTimeout(fn: () => void, ms?: number): Promise<number>;
declare function clearTimeout(): void;
declare function clearInterval(): void;

// ── URLSearchParams ────────────────────────────────────────────────────────

declare class URLSearchParams {
  constructor(init?: string | Record<string, string>);
  get(key: string): string | null;
  has(key: string): boolean;
  set(key: string, value: string): void;
  append(key: string, value: string): void;
  delete(key: string): void;
  toString(): string;
  getAll(key: string): string[];
  keys(): string[];
  values(): string[];
  entries(): [string, string][];
}

// ── Console ────────────────────────────────────────────────────────────────

declare const console: {
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

// ── Runtime-injected variables ─────────────────────────────────────────────

declare const __lang__: string;
declare const __id__: string;
