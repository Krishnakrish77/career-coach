import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveryQueries, buildDiscoveryQueryPlan, normalizeAdzunaJob, normalizeUsaJobsJob } from '../src/find-jobs-utils.js';

test('buildDiscoveryQueries caps title searches and covers US plus India', () => {
  const queries = buildDiscoveryQueries({ target_titles: ['Product Manager'], title_aliases: ['PM'], target_locations: ['New York', 'Bengaluru'], remote_preference: 'remote', salary_min: 100000 });
  assert.deepEqual(queries.map((query) => query.country), ['us', 'us', 'in', 'in']);
  assert.equal(queries[0].location, 'New York');
  assert.equal(queries[2].location, 'Bengaluru');
  assert.equal(queries[0].query, 'Product Manager remote');
});

test('explicit unsupported locations do not silently search supported markets', () => {
  const plan = buildDiscoveryQueryPlan({ target_titles: ['Product Manager'], target_locations: ['London', 'Berlin'] });
  assert.deepEqual(plan.queries, []);
  assert.deepEqual(plan.unsupportedLocations, ['London', 'Berlin']);
});

test('mixed locations search only their supported market and retain a visible notice', () => {
  const plan = buildDiscoveryQueryPlan({ target_titles: ['Product Manager'], target_locations: ['New York', 'London'] });
  assert.deepEqual(plan.queries.map((query) => query.country), ['us']);
  assert.deepEqual(plan.unsupportedLocations, ['London']);
});

test('a remote target searches both supported markets without an unsupported-location error', () => {
  const plan = buildDiscoveryQueryPlan({ target_titles: ['Product Manager'], target_locations: ['Remote'] });
  assert.deepEqual(plan.queries.map((query) => query.country), ['us', 'in']);
  assert.deepEqual(plan.queries.map((query) => query.location), ['Remote', 'Remote']);
  assert.deepEqual(plan.unsupportedLocations, []);
});

test('normalizes Adzuna descriptions as snippet-only source evidence', () => {
  const job = normalizeAdzunaJob({ id: 'a-1', title: 'Product Manager', redirect_url: 'https://jobs.example/a', description: 'Short description', company: { display_name: 'Acme' }, location: { display_name: 'Remote' } }, { query: 'Product Manager' });
  assert.equal(job.source, 'adzuna');
  assert.equal(job.source_external_id, 'a-1');
  assert.equal(job.description_is_snippet, true);
  assert.equal(job.source_payload.description_is_snippet, true);
});

test('normalizes USAJOBS salary and location fields', () => {
  const job = normalizeUsaJobsJob({ MatchedObjectId: 'u-1', MatchedObjectDescriptor: { PositionTitle: 'Program Manager', OrganizationName: 'Federal Agency', PositionURI: 'https://usajobs.gov/u-1', PositionLocation: [{ LocationName: 'Washington, DC' }], PositionRemuneration: [{ MinimumRange: '100000', MaximumRange: '150000', RateIntervalCode: 'PA' }], UserArea: { Details: { JobSummary: 'Lead programs.' } } } }, { query: 'Program Manager' });
  assert.equal(job.source, 'usajobs');
  assert.equal(job.location, 'Washington, DC');
  assert.equal(job.source_payload.salary_min, '100000');
  assert.equal(job.source_payload.salary_max, '150000');
});
