import { type Youtube4llmResponse } from "@/types/serviceResponses";
import { getDecryptedKey } from "@/encryptionService";
import { logError, logInfo } from "@/logger";
import { getSettings } from "@/settings/model";
import { safeFetchNoThrow } from "@/utils";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";
const PERPLEXITY_CHAT_URL = "https://api.perplexity.ai/chat/completions";
const SUPADATA_TRANSCRIPT_URL = "https://api.supadata.ai/v1/transcript";

/** Poll interval for Supadata async jobs (ms) */
const SUPADATA_POLL_INTERVAL = 2000;
/** Maximum time to wait for a Supadata async job (ms) */
const SUPADATA_POLL_TIMEOUT = 60000;

/** Clean web search result — no legacy Perplexity wrapper */
export interface SelfHostWebSearchResult {
  content: string;
  citations: string[];
}

interface FirecrawlSearchResult {
  title?: string;
  description?: string;
  url?: string;
}

/**
 * Check whether the currently selected web search provider is configured.
 * DuckDuckGo needs nothing (works out of the box); SearXNG needs a base URL;
 * the hosted providers need an API key.
 */
export function hasSelfHostSearchKey(): boolean {
  const settings = getSettings();
  switch (settings.selfHostSearchProvider) {
    case "duckduckgo":
      return true;
    case "searxng":
      return !!settings.searxngUrl?.trim();
    case "perplexity":
      return !!settings.perplexityApiKey;
    case "firecrawl":
    default:
      return !!settings.firecrawlApiKey;
  }
}

/**
 * Resolve a DuckDuckGo result href to the real destination URL. DuckDuckGo wraps
 * outbound links as `//duckduckgo.com/l/?uddg=<encoded-url>`; unwrap when present.
 */
function decodeDuckDuckGoUrl(href: string): string {
  if (!href) return "";
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return href;
  }
}

/**
 * Web search via DuckDuckGo's no-JavaScript HTML endpoint. Requires no API key
 * and no self-hosting, so web search works out of the box. This scrapes the
 * public HTML results page (an unofficial interface that may rate-limit or
 * change), parsing titles, snippets, and links from the top results.
 */
async function duckDuckGoSearch(query: string): Promise<SelfHostWebSearchResult> {
  const startTime = Date.now();
  const params = new URLSearchParams({ q: query, kl: "wt-wt" });

  const response = await safeFetchNoThrow(
    `https://html.duckduckgo.com/html/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        // A desktop UA avoids being served an empty/blocked page.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DuckDuckGo search failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(doc.querySelectorAll("a.result__a")).slice(0, 5);

  const contentParts: string[] = [];
  const citations: string[] = [];
  for (const link of links) {
    const title = link.textContent?.trim() || "Untitled";
    const url = decodeDuckDuckGoUrl(link.getAttribute("href") || "");
    const container = link.closest(".result") ?? link.parentElement;
    const snippet = container?.querySelector(".result__snippet")?.textContent?.trim() || "";
    contentParts.push(`### ${title}\n${snippet}\nSource: ${url}`);
    if (url) {
      citations.push(url);
    }
  }

  const elapsed = Date.now() - startTime;
  logInfo(`[selfHostWebSearch] DuckDuckGo: ${links.length} results in ${elapsed}ms`);

  return { content: contentParts.join("\n\n"), citations };
}

/**
 * Web search via a self-hosted SearXNG instance (self-host mode). Uses SearXNG's
 * JSON API (`/search?format=json`), so no API key is required — only the base URL
 * of an instance the user controls. The instance must allow the JSON format.
 */
async function searxngSearch(query: string, baseUrl: string): Promise<SelfHostWebSearchResult> {
  const startTime = Date.now();
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("SearXNG URL is not configured. Set it in Copilot settings.");
  }

  const params = new URLSearchParams({ q: query, format: "json" });
  const response = await safeFetchNoThrow(`${trimmed}/search?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SearXNG search failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    results?: Array<{ title?: string; content?: string; url?: string }>;
  };
  const results = Array.isArray(json?.results) ? json.results.slice(0, 5) : [];

  const contentParts: string[] = [];
  const citations: string[] = [];
  for (const item of results) {
    const title = item.title || "Untitled";
    const description = item.content || "";
    const url = item.url || "";
    contentParts.push(`### ${title}\n${description}\nSource: ${url}`);
    if (url) {
      citations.push(url);
    }
  }

  const elapsed = Date.now() - startTime;
  logInfo(`[selfHostWebSearch] SearXNG: ${results.length} results in ${elapsed}ms`);

  return { content: contentParts.join("\n\n"), citations };
}

/**
 * Web search via Firecrawl direct API (self-host mode).
 * Handles both v2 `data.web` format and older flat `data` array.
 */
async function firecrawlSearch(query: string, apiKey: string): Promise<SelfHostWebSearchResult> {
  const startTime = Date.now();

  const response = await safeFetchNoThrow(FIRECRAWL_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: 5 }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firecrawl search failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    data?: FirecrawlSearchResult[] | { web?: FirecrawlSearchResult[] };
  };

  // v2 returns { data: { web: [...] } }, older responses return { data: [...] }
  const rawData = json?.data;
  const results: FirecrawlSearchResult[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.web)
      ? rawData.web
      : [];

  const contentParts: string[] = [];
  const citations: string[] = [];

  for (const item of results) {
    const title = item.title || "Untitled";
    const description = item.description || "";
    const url = item.url || "";
    contentParts.push(`### ${title}\n${description}\nSource: ${url}`);
    if (url) {
      citations.push(url);
    }
  }

  const elapsed = Date.now() - startTime;
  logInfo(`[selfHostWebSearch] Firecrawl: ${results.length} results in ${elapsed}ms`);

  return { content: contentParts.join("\n\n"), citations };
}

/**
 * Web search via Perplexity Sonar API (self-host mode).
 */
async function perplexitySonarSearch(
  query: string,
  apiKey: string
): Promise<SelfHostWebSearchResult> {
  const response = await safeFetchNoThrow(PERPLEXITY_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: query }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Perplexity Sonar search failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: unknown;
  };
  const content = json?.choices?.[0]?.message?.content ?? "";
  const citations: string[] = Array.isArray(json?.citations) ? (json.citations as string[]) : [];

  return { content, citations };
}

/**
 * Dispatch self-host web search to the provider selected in settings.
 * Returns content + citations directly without the legacy Perplexity wrapper.
 */
export async function selfHostWebSearch(query: string): Promise<SelfHostWebSearchResult> {
  const settings = getSettings();
  switch (settings.selfHostSearchProvider) {
    case "duckduckgo":
      return duckDuckGoSearch(query);
    case "searxng":
      return searxngSearch(query, settings.searxngUrl);
    case "perplexity":
      return perplexitySonarSearch(query, await getDecryptedKey(settings.perplexityApiKey));
    case "firecrawl":
    default:
      return firecrawlSearch(query, await getDecryptedKey(settings.firecrawlApiKey));
  }
}

/**
 * YouTube transcript via Supadata direct API (self-host mode).
 * Returns the same Youtube4llmResponse shape as the original API.
 */
export async function selfHostYoutube4llm(url: string): Promise<Youtube4llmResponse> {
  const startTime = Date.now();
  const apiKey = await getDecryptedKey(getSettings().supadataApiKey);

  const transcriptUrl = `${SUPADATA_TRANSCRIPT_URL}?url=${encodeURIComponent(url)}&mode=auto&text=true`;

  const response = await safeFetchNoThrow(transcriptUrl, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (response.status === 200) {
    const json = (await response.json()) as { content?: string };
    const elapsed = Date.now() - startTime;
    logInfo(`[selfHostYoutube4llm] transcript received in ${elapsed}ms`);
    return {
      response: { transcript: json.content || "" },
      elapsed_time_ms: elapsed,
    };
  }

  if (response.status === 201 || response.status === 202) {
    const json = (await response.json()) as { job_id?: string };
    const jobId = json.job_id;
    if (!jobId) {
      throw new Error("Supadata returned async status but no job_id");
    }
    return await pollSupadataJob(jobId, apiKey, startTime);
  }

  const text = await response.text();
  throw new Error(`Supadata transcript request failed (${response.status}): ${text}`);
}

/**
 * Poll a Supadata async transcript job until it completes or times out.
 */
async function pollSupadataJob(
  jobId: string,
  apiKey: string,
  startTime: number
): Promise<Youtube4llmResponse> {
  const deadline = Date.now() + SUPADATA_POLL_TIMEOUT;
  const pollUrl = `${SUPADATA_TRANSCRIPT_URL}/${jobId}`;

  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, SUPADATA_POLL_INTERVAL));

    const pollResponse = await safeFetchNoThrow(pollUrl, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (pollResponse.status === 200) {
      const json = (await pollResponse.json()) as { content?: string };
      const elapsed = Date.now() - startTime;
      logInfo(`[selfHostYoutube4llm] async transcript completed in ${elapsed}ms`);
      return {
        response: { transcript: json.content || "" },
        elapsed_time_ms: elapsed,
      };
    }

    if (pollResponse.status === 202) {
      continue;
    }

    const text = await pollResponse.text();
    logError(`[selfHostYoutube4llm] poll failed (${pollResponse.status}): ${text}`);
    throw new Error(`Supadata poll failed (${pollResponse.status}): ${text}`);
  }

  throw new Error(`Supadata transcript timed out after ${SUPADATA_POLL_TIMEOUT}ms`);
}
