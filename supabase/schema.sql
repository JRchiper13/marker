-- =============================================================================
-- ESQUEMA POSTGRESQL PARA SUPABASE — MINIMARKET BOLIVIA
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase.
-- =============================================================================

-- 1. Tabla de sucursales (preparada para múltiples tiendas)
create table if not exists public.sucursales (
  id text primary key,
  nombre text not null,
  direccion text default '',
  encargado text default '',
  activa boolean not null default true,
  creado_fecha timestamptz not null default now()
);

-- Sucursal por defecto
insert into public.sucursales (id, nombre, direccion, encargado, activa)
values ('sucursal-principal', 'Sucursal principal', 'Av. Arce #2140, Zona Central', 'Administrador General', true)
on conflict (id) do nothing;

-- 2. Tabla de productos
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo_barras text not null,
  nombre text not null,
  categoria text not null,
  marca text default '',
  unidad text not null default 'Unidad',
  precio_compra numeric(12, 2) not null check (precio_compra >= 0),
  precio_venta numeric(12, 2) not null check (precio_venta >= 0),
  stock_actual integer not null default 0 check (stock_actual >= 0),
  stock_minimo integer not null default 0 check (stock_minimo >= 0),
  proveedor text default '',
  fecha_vencimiento date null,
  sucursal_id text not null references public.sucursales(id) on update cascade,
  imagen_data_url text default '',
  descripcion text default '',
  activo boolean not null default true,
  creado_fecha timestamptz not null default now(),
  actualizado_fecha timestamptz not null default now(),
  constraint productos_sucursal_codigo_unico unique (sucursal_id, codigo_barras)
);

-- Índices para búsqueda rápida por nombre, código y categoría
create index if not exists idx_productos_sucursal on public.productos (sucursal_id);
create index if not exists idx_productos_categoria on public.productos (categoria);
create index if not exists idx_productos_codigo on public.productos (codigo_barras);

-- Trigger para actualizar automáticamente actualizado_fecha
create or replace function public.actualizar_timestamp_producto()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_fecha = now();
  return new;
end;
$$;

drop trigger if exists trg_productos_actualizado on public.productos;
create trigger trg_productos_actualizado
before update on public.productos
for each row
execute function public.actualizar_timestamp_producto();

-- Políticas RLS básicas (ajustar si agregas autenticación de usuarios en el futuro)
alter table public.sucursales enable row level security;
alter table public.productos enable row level security;

drop policy if exists "Acceso completo sucursales" on public.sucursales;
create policy "Acceso completo sucursales"
  on public.sucursales for all
  using (true)
  with check (true);

drop policy if exists "Acceso completo productos" on public.productos;
create policy "Acceso completo productos"
  on public.productos for all
  using (true)
  with check (true);
