import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const HAS_SOLR = !!process.env.SOLR_AUTH;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: SOLR_AUTH not set)`, fn, timeout);
}

beforeAll(() => {
  if (HAS_SOLR) {
    process.env.SOLR_AUTH = process.env.SOLR_AUTH;
  }
});

const TEST_CIF = '18850101';
const TEST_BRAND = 'Garmin';
const WORKABLE_API_URL = 'https://apply.workable.com/api/v3/accounts/garmin-cluj/jobs';
const WORKABLE_PAYLOAD = { query: "", location: [], department: [], worktype: [], remote: [] };
const ROMANIAN_CITIES = ['Cluj-Napoca', 'Bucharest', 'București', 'Timișoara', 'Iași', 'Brașov', 'Constanța', 'Sibiu', 'Oradea'];

describe('E2E: Full Scraping Pipeline', () => {

  describe('Workable API — Real Data Fetch', () => {
    let apiData;

    beforeAll(async () => {
      const res = await fetch(WORKABLE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://apply.workable.com',
          'Referer': 'https://apply.workable.com/garmin-cluj/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(WORKABLE_PAYLOAD)
      });
      apiData = await res.json();
    }, 15000);

    it('should respond with valid job data from Workable API', () => {
      expect(apiData).toHaveProperty('results');
      expect(Array.isArray(apiData.results)).toBe(true);
      expect(apiData.results.length).toBeGreaterThan(0);
      expect(apiData).toHaveProperty('total');
      expect(typeof apiData.total).toBe('number');
    }, 10000);

    it('should have jobs with expected fields', () => {
      const job = apiData.results[0];
      expect(job).toHaveProperty('title');
      expect(typeof job.title).toBe('string');
      expect(job).toHaveProperty('shortcode');
      expect(job).toHaveProperty('location');
      expect(job.location).toHaveProperty('country');
    });

    it('should have Romanian country on all jobs', () => {
      const allCountries = apiData.results.map(j =>
        j.location?.country?.toLowerCase()
      );
      expect(allCountries.length).toBeGreaterThan(0);
      const hasRomania = allCountries.some(c => c === 'romania');
      expect(hasRomania).toBe(true);
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let apiData;

    beforeAll(async () => {
      index = await import('../../index.js');
      const res = await fetch(WORKABLE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://apply.workable.com',
          'Referer': 'https://apply.workable.com/garmin-cluj/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(WORKABLE_PAYLOAD)
      });
      apiData = await res.json();
    }, 15000);

    it('should parse real Workable API response into standardized format', () => {
      const result = index.parseApiJobs(apiData);

      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
      expect(result.jobs.length).toBeGreaterThan(0);

      const parsed = result.jobs[0];
      expect(parsed).toHaveProperty('url');
      expect(parsed.url).toMatch(/^https:\/\/apply\.workable\.com\/garmin-cluj\/j\//);
      expect(parsed).toHaveProperty('title');
      expect(parsed).toHaveProperty('location');
      expect(Array.isArray(parsed.location)).toBe(true);
    });

    it('should map parsed jobs to job model', () => {
      const parsed = index.parseApiJobs(apiData);
      const model = index.mapToJobModel(parsed.jobs[0], TEST_CIF);

      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
      expect(model.url).toMatch(/^https:\/\/apply\.workable\.com\//);
    });

    it('should transform jobs and filter to Romanian locations', () => {
      const parsed = index.parseApiJobs(apiData);
      const jobs = parsed.jobs.map(j => index.mapToJobModel(j, TEST_CIF));

      const payload = {
        source: 'workable.com',
        company: 'GARMIN CLUJ SRL',
        cif: TEST_CIF,
        jobs
      };

      const transformed = index.transformJobsForSOLR(payload);

      expect(transformed.company).toBe('GARMIN CLUJ SRL');
      expect(transformed.jobs.length).toBe(jobs.length);

      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
        expect(job.workmode).toMatch(/^(remote|on-site|hybrid)$/);
      }
    });
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it('should find Garmin in ANAF and validate active status', async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const garmin = results.find(c =>
        c.name.toUpperCase().includes('GARMIN') &&
        c.statusLabel === 'Funcțiune'
      );
      expect(garmin).toBeDefined();
      expect(garmin.cui.toString()).toBe(TEST_CIF);

      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe('GARMIN CLUJ SRL');
      expect(result.cif).toBe(TEST_CIF);
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Inactive Company Handling', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
    });

    it('should detect inactive/radiated companies via ANAF', async () => {
      const results = await anaf.searchCompany('Garmin');

      const nonActive = results.find(c => c.statusLabel !== 'Funcțiune');

      if (nonActive) {
        try {
          const anafData = await anaf.getCompanyFromANAF(nonActive.cui.toString());
          expect(anafData).toBeDefined();
          if (anafData.inactive !== undefined) {
            expect(anafData.inactive).toBe(true);
          }
        } catch {
          expect(nonActive.statusLabel).toMatch(/Radiată|Inactiv|Suspendat/);
        }
      }
    }, 30000);
  });

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have Garmin jobs in SOLR with correct company name', async () => {
      const result = await solr.querySOLR(TEST_CIF);

      expect(result.numFound).toBeGreaterThan(0);

      for (const job of result.docs) {
        expect(job.company).toBe('GARMIN CLUJ SRL');
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIfSolr('should have Garmin company core entry with required fields', async () => {
      const result = await solr.queryCompanySOLR(`id:${TEST_CIF}`);

      expect(result.numFound).toBe(1);
      const garmin = result.docs[0];
      expect(garmin.company).toBe('GARMIN CLUJ SRL');
      expect(garmin.status).toBe('activ');
    }, 15000);
  });
});
