// Explicitly authorized read-only audit. Never exports passwords, downloads
// Storage objects, changes data, deploys or disables services.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';

if (!process.argv.includes('--authorized-read')) throw new Error('Explicit read authorization flag required');
const sourceProject = 'sportspace-af6b4', targetProject = 'dzpbnvpqkwsjlvdxwwub';
const collections = ['Users', 'Facilities', 'Courts', 'Availability', 'Matches', 'PricingRules'];
const env = { ...dotenv.parse(fs.readFileSync('.env', 'utf8')), ...process.env };
const credentials = JSON.parse(fs.readFileSync('sportspace-af6b4-firebase-adminsdk-fbsvc-fafbfe972d.json', 'utf8'));
if (credentials.project_id !== sourceProject || !env.VITE_SUPABASE_URL?.includes(`${targetProject}.supabase.co`)) {
  throw new Error('Project mismatch');
}
const app = initializeApp({ credential: cert(credentials), projectId: sourceProject });
const db = getFirestore(app);
db.settings({ preferRest: true });
const sql = postgres(env.MY_SUPABASE_DB_URL, { max: 1, connect_timeout: 12, idle_timeout: 5,
  connection: { statement_timeout: 30000, default_transaction_read_only: 'on' } });
const report = { sourceProject, targetProject, startedAt: new Date().toISOString(), collections: {}, errors: [] };
const safeError = error => ({ code: String(error.code || error.status || 'unavailable'),
  status: error.response?.status || undefined });
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
};
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const google = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await google.getClient();
const guarded = async (label, task) => {
  console.log(JSON.stringify({ progress: label }));
  try { return await task(); } catch (error) {
    report.errors.push({ resource: label, ...safeError(error) }); return undefined;
  }
};
try {
  // Only list collection names; additional collection contents are not read.
  await guarded('Firebase collection inventory', async () => {
    report.sourceCollectionNames = (await db.listCollections()).map(collection => collection.id);
    report.unapprovedCollections = report.sourceCollectionNames.filter(name => !collections.includes(name));
  });
  for (const name of collections) {
    await guarded(`Collection ${name}`, async () => {
      const snapshot = await db.collection(name).get();
      const source = snapshot.docs.map(doc => ({ id: doc.id, ...JSON.parse(JSON.stringify(doc.data())) }));
      const target = await sql`select * from public.${sql(name)}`;
      const targetById = new Map(target.map(row => [row.id, row]));
      const sourceIds = new Set(source.map(row => row.id));
      const missing = [], changed = {}, extra = target.filter(row => !sourceIds.has(row.id)).length;
      let exact = 0;
      for (const row of source) {
        const imported = targetById.get(row.id);
        if (!imported) { missing.push(row.id); continue; }
        const raw = imported.raw_data || {};
        let matches = true;
        for (const [field, value] of Object.entries(row)) {
          if (field === 'id') continue;
          if (!equal(value, raw[field])) { matches = false; changed[field] = (changed[field] || 0) + 1; }
        }
        if (matches) exact++;
      }
      report.collections[name] = { sourceCount: source.length, targetCount: target.length,
        missingCount: missing.length, extraTargetCount: extra, exactSourceFieldsInRawData: exact,
        changedFieldCounts: changed, idsComplete: missing.length === 0 };
    });
  }
  await guarded('Auth metadata', async () => {
    const source = [];
    let pageToken;
    do {
      // API field mask excludes passwordHash/passwordSalt from the response.
      const response = await client.request({
        url: `https://identitytoolkit.googleapis.com/v1/projects/${sourceProject}/accounts:batchGet`,
        method: 'GET', timeout: 15000,
        params: { maxResults: 1000, ...(pageToken ? { nextPageToken: pageToken } : {}),
          fields: 'users(localId,email,disabled,providerUserInfo(providerId)),nextPageToken' },
      });
      source.push(...(response.data.users || []).map(user => ({ uid: user.localId,
        email: user.email?.toLowerCase(), disabled: user.disabled,
        providers: (user.providerUserInfo || []).map(provider => provider.providerId) })));
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    const target = await sql`select id, lower(email) as email from auth.users`;
    const ids = new Set(target.map(user => user.id)), emails = new Set(target.map(user => user.email).filter(Boolean));
    report.auth = { sourceCount: source.length, targetCount: target.length,
      sameUidCount: source.filter(user => ids.has(user.uid)).length,
      sameEmailCount: source.filter(user => user.email && emails.has(user.email)).length,
      missingEmailCount: source.filter(user => !user.email || !emails.has(user.email)).length,
      passwordsChecked: false, identityMappingVerified: false };
  });
  await guarded('Storage metadata', async () => {
    const storage = new Storage({ projectId: sourceProject, credentials });
    const [buckets] = await storage.getBuckets();
    const sourceBuckets = [];
    for (const bucket of buckets) {
      let query = { autoPaginate: false, maxResults: 1000, fields: 'items(name,size,contentType,updated),nextPageToken' };
      let count = 0, bytes = 0;
      do {
        const [files, next] = await bucket.getFiles(query);
        count += files.length;
        bytes += files.reduce((total, file) => total + Number(file.metadata.size || 0), 0);
        query = next;
      } while (query);
      sourceBuckets.push({ bucket: bucket.name, objectCount: count, bytes });
    }
    const target = await sql`select b.id, count(o.id)::int as object_count from storage.buckets b
      left join storage.objects o on o.bucket_id = b.id group by b.id order by b.id`;
    report.storage = { sourceBuckets, targetBuckets: target, objectContentVerified: false };
  });
  const list = async (url, key) => {
    const entries = [];
    let pageToken;
    do {
      const response = await client.request({ url, method: 'GET', params: pageToken ? { pageToken } : {}, timeout: 15000 });
      entries.push(...(response.data[key] || [])); pageToken = response.data.nextPageToken;
    } while (pageToken);
    return entries;
  };
  report.functions = [];
  for (const version of ['v1', 'v2']) {
    await guarded(`Functions ${version} configuration`, async () => {
      const functions = await list(`https://cloudfunctions.googleapis.com/${version}/projects/${sourceProject}/locations/-/functions`, 'functions');
      report.functions.push(...functions.map(fn => ({ name: fn.name, state: fn.state || fn.status,
        runtime: fn.runtime || fn.buildConfig?.runtime })));
    });
  }
  const regions = new Set(['asia-southeast1', ...report.functions.map(fn => fn.name.split('/')[3])]);
  report.scheduler = [];
  for (const region of regions) {
    await guarded(`Scheduler ${region} configuration`, async () => {
      const jobs = await list(`https://cloudscheduler.googleapis.com/v1/projects/${sourceProject}/locations/${region}/jobs`, 'jobs');
      report.scheduler.push(...jobs.map(job => ({ name: job.name, state: job.state,
        schedule: job.schedule, timeZone: job.timeZone })));
    });
  }
} finally {
  await sql.end({ timeout: 3 });
  await deleteApp(app);
  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify({ report }, null, 2));
}
