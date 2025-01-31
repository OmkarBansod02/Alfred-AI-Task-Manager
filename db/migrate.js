import pg from 'pg';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
    host: 'localhost',
    port: 54321,
    user: 'admin',
    password: 'admin',
    database: 'postgres'
});

async function runMigration() {
    try {
        const client = await pool.connect();
        console.log('Connected to database');

        // Read and execute the migration file
        const migrationPath = join(__dirname, 'migrations', '0001_create_todos.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
        
        console.log('Running migration...');
        await client.query(migrationSQL);
        console.log('Migration completed successfully');

        client.release();
        await pool.end();
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration().catch(console.error);
