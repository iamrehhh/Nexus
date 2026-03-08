-- Create health_tables
CREATE TABLE IF NOT EXISTS public.health_tables (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create health_table_rows
CREATE TABLE IF NOT EXISTS public.health_table_rows (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    table_id UUID REFERENCES public.health_tables(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.health_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_table_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own health tables" ON public.health_tables
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own health table rows" ON public.health_table_rows
    FOR ALL USING (auth.uid() = user_id);
