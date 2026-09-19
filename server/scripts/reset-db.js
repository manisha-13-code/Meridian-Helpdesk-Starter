/**
 * Drops, recreates and seeds the helpdesk database.
 *   npm run db:reset
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../../db/schema.sql');

// Deterministic pseudo-random so every candidate gets identical data.
let seed = 20260909;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = ['Aisha','Ben','Carla','Dev','Elena','Farid','Grace','Hugo','Ines','Jonas',
               'Kiran','Lena','Marco','Nadia','Omar','Priya','Quinn','Rosa','Sami','Tara'];
const LAST  = ['Adler','Brooks','Costa','Duarte','Engel','Fischer','Gomez','Haddad','Iqbal','Jensen',
               'Kowalski','Lindqvist','Moreau','Novak','Oyelaran','Petrov','Rahman','Silva','Tanaka','Vogel'];

const SUBJECTS = [
  'Cannot log in after password reset','Invoice PDF is blank','Export times out on large date ranges',
  'Two-factor code never arrives','Dashboard totals do not match the report','Webhook retries are duplicating rows',
  'API returns 500 on empty payload','Search ignores accented characters','Timezone wrong on scheduled reports',
  'Bulk import drops the last row','User cannot be removed from a team','Attachments over 10MB fail silently',
  'Filters reset when navigating back','Sorting by name is case sensitive','Session expires after five minutes',
  'Email notifications arrive twice','CSV download has a BOM','Permissions not applied to sub-accounts',
  'Rate limit hit during normal use','Mobile layout overlaps the header',
];

const BODIES = [
  'Started this morning. Reproduces every time on Chrome 141, Windows 11.',
  'Only affects one of our three environments. Staging is fine, production is not.',
  'We noticed after the Tuesday release. Rolling back is not an option for us.',
  'Roughly one in ten attempts. No pattern we can see yet.',
  'Blocking our month-end close. Please treat as urgent.',
  'Low priority but it has been happening for a while and is getting annoying.',
];

const REPLIES = [
  'Thanks for the report — reproduced on our side, taking a look now.',
  'Could you send the request id from the response headers?',
  'We shipped a fix to staging. Could you confirm before we promote it?',
  'This looks like the same root cause as the export issue from last month.',
  'Escalating to the platform team. Will update within the day.',
  'Confirmed fixed on our end. Closing unless you see it again.',
  'Any update on this? Still blocking us.',
  'Adding the log excerpt as requested.',
];

async function main() {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password,
    database: config.db.database, multipleStatements: true,
  });

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query(fs.readFileSync(schemaPath, 'utf8'));
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  const orgs = ['Northwind Trading', 'Cobalt Logistics'];
  const orgIds = [];
  for (const name of orgs) {
    const [r] = await conn.query('INSERT INTO organizations (name) VALUES (?)', [name]);
    orgIds.push(r.insertId);
  }

  const hash = await bcrypt.hash('Password123!', 10);
  const users = [];
  const fixed = [
    ['admin@northwind.test', 'Nadia Novak', 'admin', 0],
    ['agent1@northwind.test', 'Marco Moreau', 'agent', 0],
    ['agent2@northwind.test', 'Priya Rahman', 'agent', 0],
    ['user1@northwind.test', 'Ben Brooks', 'requester', 0],
    ['user2@northwind.test', 'Elena Engel', 'requester', 0],
    ['admin@cobalt.test', 'Omar Haddad', 'admin', 1],
    ['agent1@cobalt.test', 'Grace Gomez', 'agent', 1],
    ['user1@cobalt.test', 'Dev Duarte', 'requester', 1],
  ];
  for (const [email, name, role, orgIdx] of fixed) {
    const [r] = await conn.query(
      'INSERT INTO users (org_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      [orgIds[orgIdx], email, hash, name, role]
    );
    users.push({ id: r.insertId, org: orgIds[orgIdx], role });
  }
  for (let i = 0; i < 22; i++) {
    const orgIdx = i % 2;
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const email = `${name.toLowerCase().replace(/[^a-z]/g, '.')}.${i}@${orgIdx ? 'cobalt' : 'northwind'}.test`;
    const role = rand() < 0.25 ? 'agent' : 'requester';
    const [r] = await conn.query(
      'INSERT INTO users (org_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      [orgIds[orgIdx], email, hash, name, role]
    );
    users.push({ id: r.insertId, org: orgIds[orgIdx], role });
  }

  const now = Date.now();
  let ticketCount = 0, commentCount = 0;

  for (let i = 0; i < 240; i++) {
    const org = orgIds[i % 2];
    const orgUsers = users.filter((u) => u.org === org);
    const agents = orgUsers.filter((u) => u.role === 'agent' || u.role === 'admin');
    const requesters = orgUsers.filter((u) => u.role === 'requester');

    const requester = pick(requesters.length ? requesters : orgUsers);
    const priority = pick(['P1', 'P2', 'P2', 'P3', 'P3', 'P3']);
    const status = pick(['open', 'open', 'pending', 'resolved', 'closed']);
    const assigned = status !== 'open' || rand() < 0.2;
    const assignee = assigned ? pick(agents) : null;

    const createdMs = now - int(1, 75) * 86400000 - int(0, 23) * 3600000 - int(0, 59) * 60000;
    const createdAt = new Date(createdMs).toISOString().slice(0, 19).replace('T', ' ');

    const [t] = await conn.query(
      `INSERT INTO tickets (org_id, subject, body, status, priority, requester_id, assignee_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [org, pick(SUBJECTS), pick(BODIES), status, priority, requester.id, assignee ? assignee.id : null, createdAt, createdAt]
    );
    ticketCount++;

    const nComments = status === 'open' ? int(0, 2) : int(1, 6);
    let cursorMs = createdMs;
    for (let c = 0; c < nComments; c++) {
      cursorMs += int(20, 4000) * 60000;
      if (cursorMs > now) break;
      const author = rand() < 0.55 && agents.length ? pick(agents) : requester;
      const createdC = new Date(cursorMs).toISOString().slice(0, 19).replace('T', ' ');
      await conn.query(
        `INSERT INTO comments (ticket_id, author_id, body, is_internal, created_at) VALUES (?, ?, ?, ?, ?)`,
        [t.insertId, author.id, pick(REPLIES), rand() < 0.15 ? 1 : 0, createdC]
      );
      commentCount++;
    }
  }

  console.log(`Seeded ${orgs.length} organisations, ${users.length} users, ${ticketCount} tickets, ${commentCount} comments.`);
  console.log('All accounts use the password: Password123!');
  await conn.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
