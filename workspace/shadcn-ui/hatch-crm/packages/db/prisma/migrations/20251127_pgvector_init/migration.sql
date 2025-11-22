-- CreateExtension
-- Commented out pgvector extension - requires pgvector compiled extension
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Commented out VectorChunk table and related triggers as they require vector extension
/*
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'VectorChunk'
  ) THEN
    CREATE TABLE "VectorChunk" (
      id           text PRIMARY KEY,
      tenant_id    text NOT NULL,
      entity_type  text NOT NULL,
      entity_id    text NOT NULL,
      chunk_index  int  NOT NULL,
      content      text NOT NULL,
      embedding_f8 double precision[] NOT NULL,
      embedding_v  vector(1536),
      meta         jsonb,
      created_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, entity_type, entity_id, chunk_index)
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION embedding_sync() RETURNS trigger AS $$
DECLARE
  dim int := 1536;
  arr double precision[];
  norm double precision := 0;
  i int;
  vector_sql text;
BEGIN
  arr := NEW.embedding_f8;
  IF arr IS NULL THEN
    NEW.embedding_v := NULL;
    RETURN NEW;
  END IF;
  IF array_length(arr, 1) <> dim THEN
    RAISE EXCEPTION 'embedding_f8 length % <> dim %', array_length(arr, 1), dim;
  END IF;
  FOR i IN 1..dim LOOP
    norm := norm + arr[i] * arr[i];
  END LOOP;
  IF norm > 0 THEN
    norm := sqrt(norm);
    FOR i IN 1..dim LOOP
      arr[i] := arr[i] / norm;
    END LOOP;
  END IF;

  NEW.embedding_f8 := arr;
  vector_sql := '(' || array_to_string(arr, ',') || ')::vector(' || dim || ')';
  EXECUTE 'SELECT ' || vector_sql INTO NEW.embedding_v;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vectorchunk_embedding_sync ON "VectorChunk";
CREATE TRIGGER vectorchunk_embedding_sync
BEFORE INSERT OR UPDATE OF embedding_f8 ON "VectorChunk"
FOR EACH ROW EXECUTE FUNCTION embedding_sync();

DROP INDEX IF EXISTS vectorchunk_tenant_entity_idx;
CREATE INDEX vectorchunk_tenant_entity_idx ON "VectorChunk"(tenant_id, entity_type, entity_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'vectorchunk_ivfflat_idx'
  ) THEN
    EXECUTE format(
      'CREATE INDEX vectorchunk_ivfflat_idx ON "VectorChunk" USING ivfflat (embedding_v vector_cosine_ops) WITH (lists = %s);',
      coalesce(current_setting('ai.pgvectors.lists', true), '100')
    );
  END IF;
END $$;
*/
