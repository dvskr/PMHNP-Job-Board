// Preload script: sets DATABASE_URL from PROD_DATABASE_URL
require('dotenv').config({ path: '.env.local' });
process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
