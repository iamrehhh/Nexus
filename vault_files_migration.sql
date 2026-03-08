-- Create vault folders and files tables
CREATE TABLE IF NOT EXISTS public.vault_folders (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.vault_folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vault_files (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES public.vault_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT,
    is_favorite BOOLEAN DEFAULT false,
    vector_embedding vector(1536), -- for semantic search
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.vault_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vault folders" ON public.vault_folders
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own vault files" ON public.vault_files
    FOR ALL USING (auth.uid() = user_id);

-- Migration of old notes (if any exist in old vault_notes table)
-- Insert root level folders from old 'folder' textual column
INSERT INTO public.vault_folders (user_id, name)
SELECT DISTINCT user_id, COALESCE(folder, 'Uncategorized')
FROM public.vault_notes
ON CONFLICT DO NOTHING;

-- Map old notes to new vault_files
INSERT INTO public.vault_files (user_id, folder_id, name, content, vector_embedding, created_at, updated_at)
SELECT 
    n.user_id, 
    f.id as folder_id, 
    n.title as name, 
    n.content, 
    ve.embedding as vector_embedding,
    n.created_at,
    n.updated_at
FROM public.vault_notes n
LEFT JOIN public.vault_embeddings ve ON ve.note_id = n.id
LEFT JOIN public.vault_folders f ON f.name = COALESCE(n.folder, 'Uncategorized') AND f.user_id = n.user_id;

-- Vector matching functions for Knowledge base RAG
CREATE OR REPLACE FUNCTION match_vault_files (
  query_embedding vector(1536),
  match_user_id UUID,
  match_count int DEFAULT 5
) RETURNS TABLE (
  file_id UUID,
  name TEXT,
  content_preview TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vf.id,
    vf.name,
    SUBSTRING(vf.content FROM 1 FOR 200) as content_preview,
    1 - (vf.vector_embedding <=> query_embedding) as similarity
  FROM vault_files vf
  WHERE vf.user_id = match_user_id AND vf.vector_embedding IS NOT NULL
  ORDER BY vf.vector_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
