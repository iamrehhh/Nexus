alter table books add column if not exists status text default 'ready';
alter table books add column if not exists last_processed_page int default 0;
alter table books add column if not exists processing_error text;
