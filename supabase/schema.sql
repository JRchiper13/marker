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

create index if not exists idx_productos_sucursal on public.productos (sucursal_id);
create index if not exists idx_productos_categoria on public.productos (categoria);
create index if not exists idx_productos_codigo on public.productos (codigo_barras);

-- 3. Tabla de ventas (Punto de venta)
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  sucursal_id text not null references public.sucursales(id) on update cascade,
  items jsonb not null,
  total numeric(12, 2) not null check (total >= 0),
  metodo_pago text not null
);

create index if not exists idx_ventas_sucursal_fecha on public.ventas (sucursal_id, fecha desc);

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

-- 4. Tabla de movimientos de inventario (Kardex: entradas, salidas y ajustes)
create table if not exists public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  sucursal_id text not null references public.sucursales(id) on update cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  producto_nombre text not null,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad integer not null check (cantidad >= 0),
  stock_anterior integer not null check (stock_anterior >= 0),
  stock_nuevo integer not null check (stock_nuevo >= 0),
  motivo text default ''
);

create index if not exists idx_mov_inv_sucursal_fecha on public.movimientos_inventario (sucursal_id, fecha desc);
create index if not exists idx_mov_inv_producto on public.movimientos_inventario (producto_id);

-- Políticas RLS básicas (ajustar si agregas autenticación de usuarios en el futuro)
alter table public.sucursales enable row level security;
alter table public.productos enable row level security;
alter table public.ventas enable row level security;
alter table public.movimientos_inventario enable row level security;

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

drop policy if exists "Acceso completo ventas" on public.ventas;
create policy "Acceso completo ventas"
  on public.ventas for all
  using (true)
  with check (true);

drop policy if exists "Acceso completo movimientos inventario" on public.movimientos_inventario;
create policy "Acceso completo movimientos inventario"
  on public.movimientos_inventario for all
  using (true)
  with check (true);
