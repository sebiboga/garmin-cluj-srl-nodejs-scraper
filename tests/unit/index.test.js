import { jest } from '@jest/globals';

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../index.js');
  });

  describe('transformJobsForSOLR', () => {
    it('should filter locations to only Romanian cities', () => {
      const payload = {
        jobs: [
          { url: 'https://apply.workable.com/garmin-cluj/j/1', title: 'Job 1', location: ['România'] },
          { url: 'https://apply.workable.com/garmin-cluj/j/2', title: 'Job 2', location: ['Cluj-Napoca'] },
          { url: 'https://apply.workable.com/garmin-cluj/j/3', title: 'Job 3', location: ['Bulgaria'] },
          { url: 'https://apply.workable.com/garmin-cluj/j/4', title: 'Job 4', location: ['Bucharest'] },
          { url: 'https://apply.workable.com/garmin-cluj/j/5', title: 'Job 5', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].location).toEqual(['România']);
      expect(result.jobs[1].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[2].location).toEqual(['România']);
      expect(result.jobs[3].location).toEqual(['Bucharest']);
      expect(result.jobs[4].location).toEqual(['România']);
    });

    it('should keep company uppercase', () => {
      const payload = {
        source: 'workable.com',
        company: 'garmin cluj srl',
        cif: '18850101',
        jobs: [
          { url: 'https://apply.workable.com/garmin-cluj/j/1', title: 'Job 1', company: 'garmin cluj', cif: '18850101' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.company).toBe('GARMIN CLUJ SRL');
    });

    it('should normalize workmode values', () => {
      const payload = {
        jobs: [
          { url: 'https://apply.workable.com/garmin-cluj/j/1', title: 'Job 1', workmode: 'on-site' },
          { url: 'https://apply.workable.com/garmin-cluj/j/2', title: 'Job 2', workmode: 'ON-SITE' },
          { url: 'https://apply.workable.com/garmin-cluj/j/3', title: 'Job 3', workmode: 'Hybrid' },
          { url: 'https://apply.workable.com/garmin-cluj/j/4', title: 'Job 4', workmode: 'Remote' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].workmode).toBe('on-site');
      expect(result.jobs[1].workmode).toBe('on-site');
      expect(result.jobs[2].workmode).toBe('hybrid');
      expect(result.jobs[3].workmode).toBe('remote');
    });

    it('should handle empty jobs array', () => {
      const result = index.transformJobsForSOLR({ jobs: [] });
      expect(result.jobs).toEqual([]);
    });
  });

  describe('mapToJobModel', () => {
    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://apply.workable.com/garmin-cluj/j/3FBA1085E2',
        title: 'C++ Software Engineer',
        location: ['Cluj-Napoca'],
        workmode: 'on-site'
      };

      const COMPANY_NAME = 'GARMIN CLUJ SRL';
      const COMPANY_CIF = '18850101';

      const result = index.mapToJobModel(rawJob, COMPANY_CIF, COMPANY_NAME);

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(COMPANY_CIF);
      expect(result.location).toEqual(rawJob.location);
      expect(result.workmode).toBe('on-site');
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://apply.workable.com/garmin-cluj/j/1',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, '18850101');

      expect(result.location).toBeUndefined();
      expect(result.workmode).toBe('on-site');
    });

    it('should handle missing title', () => {
      const rawJob = { url: 'https://apply.workable.com/garmin-cluj/j/1' };

      const result = index.mapToJobModel(rawJob, '18850101');

      expect(result.title).toBeUndefined();
      expect(result.url).toBe('https://apply.workable.com/garmin-cluj/j/1');
    });
  });

  describe('parseApiJobs', () => {
    it('should parse Workable API response format', () => {
      const apiData = {
        total: 100,
        results: [
          {
            title: 'C++ Software Engineer | Marine | Cluj-Napoca',
            shortcode: '3FBA1085E2',
            location: {
              city: 'Cluj-Napoca',
              country: 'Romania'
            }
          }
        ]
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].title).toBe('C++ Software Engineer | Marine | Cluj-Napoca');
      expect(result.jobs[0].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[0].url).toBe('https://apply.workable.com/garmin-cluj/j/3FBA1085E2');
    });

    it('should handle empty job list', () => {
      const apiData = { total: 0, results: [] };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs).toEqual([]);
    });

    it('should handle missing results field', () => {
      const result = index.parseApiJobs({});

      expect(result.jobs).toEqual([]);
    });

    it('should extract nextPage token', () => {
      const apiData = {
        total: 30,
        results: [{ title: 'Job 1', shortcode: 'ABC', location: { city: 'Cluj-Napoca', country: 'Romania' } }],
        nextPage: 'WzE3NzkyMzUyMDAwMDAsNTgxNDM2OF0='
      };

      const result = index.parseApiJobs(apiData);

      expect(result.nextPage).toBe('WzE3NzkyMzUyMDAwMDAsNTgxNDM2OF0=');
    });

    it('should handle missing location', () => {
      const apiData = {
        total: 1,
        results: [
          {
            title: 'Job 1',
            shortcode: 'ABC123',
            location: null
          }
        ]
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs[0].location).toEqual([]);
      expect(result.jobs[0].country).toBe('');
      expect(result.jobs[0].city).toBe('');
    });
  });

  describe('URL Generation', () => {
    it('should generate Workable URL from shortcode', () => {
      const apiData = {
        total: 1,
        results: [
          {
            title: 'Test Job',
            shortcode: '3FBA1085E2',
            location: { city: 'Cluj-Napoca', country: 'Romania' }
          }
        ]
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs[0].url).toBe('https://apply.workable.com/garmin-cluj/j/3FBA1085E2');
    });
  });
});
