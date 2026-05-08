const { Client } = require('pg');
require('dotenv').config({ path: './backend/.env' });

console.log('Testing connection...');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect()
  .then(() => {
    console.log('Connected successfully!');
    return client.query('SELECT NOW()');
  })
  .then(result => {
    console.log('Query result:', result.rows[0]);
    return client.end();
  })
  .catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
  });