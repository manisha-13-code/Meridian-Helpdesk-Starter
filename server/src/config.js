import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'helpdesk',
    password: process.env.DB_PASSWORD || 'helpdesk',
    database: process.env.DB_NAME || 'helpdesk',
    connectionLimit: 10,
  },

  // Falls back to a default so local dev works without a .env file.
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: '12h',

  // SLA targets in hours, by priority. Used by the reporting module.
  slaTargets: { P1: 4, P2: 24, P3: 72 },
};
