alter table sets add column if not exists location_id uuid references locations(id);
