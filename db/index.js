import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;
import * as schema from './schema.js';

const pool = new Pool({
    host: 'localhost',
    port: 54321,
    user: 'admin',
    password: 'admin',
    database: 'postgres'
});

let dbInstance = null;

export async function connectToDatabase() {
    if (dbInstance) return dbInstance;
    
    try {
        const client = await pool.connect();
        console.log('Successfully connected to database');
        client.release();
        dbInstance = drizzle(pool, { schema });
        return dbInstance;
    } catch (error) {
        console.error('Error connecting to database:', error.message);
        return null;
    }
}

export function getDb() {
    return dbInstance;
}