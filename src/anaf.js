import fetch from "node-fetch";

const ANAF_API_URL = "https://demoanaf.ro/api/company/";

const ANAF_SEARCH_URL = "https://demoanaf.ro/api/search";

const MAX_RETRIES = 3;

const RETRY_DELAY_MS = 2000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getCompanyFromANAF(cif) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${ANAF_API_URL}${cif}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "job_seeker_ro_spider" }
      });

      if (!res.ok) {
        lastError = new Error(`ANAF API error: ${res.status}`);
        console.log(`ANAF attempt ${attempt}/${MAX_RETRIES} failed: ${res.status}, retrying...`);
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
        continue;
      }

      const json = await res.json();

      if (json.success === false) {
        lastError = new Error(json.error?.message || "ANAF returned error");
        console.log(`ANAF attempt ${attempt}/${MAX_RETRIES} failed: ${json.error?.message}, retrying...`);
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
        continue;
      }

      return json.data || null;
    } catch (err) {
      lastError = err;
      console.log(`ANAF attempt ${attempt}/${MAX_RETRIES} error: ${err.message}, retrying...`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }

  throw lastError || new Error("ANAF API failed after retries");
}

export async function getCompanyFromANAFWithFallback(cif, cachedData = null) {
  try {
    return await getCompanyFromANAF(cif);
  } catch (err) {
    console.log(`\nANAF API unavailable: ${err.message}`);

    if (cachedData) {
      console.log("Using cached company data as fallback");
      return cachedData;
    }

    throw err;
  }
}

export async function searchCompany(brandName) {
  const url = `${ANAF_SEARCH_URL}?q=${encodeURIComponent(brandName)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "job_seeker_ro_spider" }
  });

  if (!res.ok) {
    throw new Error(`ANAF search error: ${res.status}`);
  }

  const json = await res.json();
  return json.data || [];
}
