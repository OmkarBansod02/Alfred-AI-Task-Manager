CREATE TABLE IF NOT EXISTS "todos" (
    "id" serial PRIMARY KEY,
    "todo" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create the drizzle metadata table
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
