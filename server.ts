import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProductoFilaDB {
  id: string;
  codigo_barras: string;
  nombre: string;
  categoria: string;
  marca: string | null;
  unidad: string;
  precio_compra: number | string;
  precio_venta: number | string;
  stock_actual: number;
  stock_minimo: number;
  proveedor: string | null;
  fecha_vencimiento: string | null;
  sucursal_id: string;
  imagen_data_url: string | null;
  descripcion: string | null;
  activo: boolean;
  creado_fecha: string;
  actualizado_fecha: string;
}

interface ProductoEntrada {
  codigoBarras: string;
  nombre: string;
  categoria: string;
  marca?: string;
  unidad: string;
  precioCompra: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  proveedor?: string;
  fechaVencimiento?: string | null;
  sucursalId: string;
  imagenDataUrl?: string;
  descripcion?: string;
  activo: boolean;
}

let clienteSupabase: SupabaseClient | null = null;

function obtenerClienteSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

  if (!url || !key) {
    return null;
  }

  if (!clienteSupabase) {
    clienteSupabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return clienteSupabase;
}

function mapearFilaAProducto(fila: ProductoFilaDB) {
  return {
    id: fila.id,
    codigoBarras: fila.codigo_barras,
    nombre: fila.nombre,
    categoria: fila.categoria,
    marca: fila.marca ?? '',
    unidad: fila.unidad,
    precioCompra: Number(fila.precio_compra),
    precioVenta: Number(fila.precio_venta),
    stockActual: Number(fila.stock_actual),
    stockMinimo: Number(fila.stock_minimo),
    proveedor: fila.proveedor ?? '',
    fechaVencimiento: fila.fecha_vencimiento ?? '',
    sucursalId: fila.sucursal_id,
    imagenDataUrl: fila.imagen_data_url ?? '',
    descripcion: fila.descripcion ?? '',
    activo: Boolean(fila.activo),
    creadoFecha: fila.creado_fecha,
    actualizadoFecha: fila.actualizado_fecha,
  };
}

function validarPayloadProducto(cuerpo: unknown): { datos?: ProductoEntrada; error?: string } {
  if (!cuerpo || typeof cuerpo !== 'object') {
    return { error: 'Datos de producto inválidos.' };
  }

  const p = cuerpo as Record<string, unknown>;
  const codigoBarras = String(p.codigoBarras ?? '').trim();
  const nombre = String(p.nombre ?? '').trim();
  const categoria = String(p.categoria ?? '').trim();
  const unidad = String(p.unidad ?? 'Unidad').trim();
  const sucursalId = String(p.sucursalId ?? 'sucursal-principal').trim();
  const precioCompra = Number(p.precioCompra);
  const precioVenta = Number(p.precioVenta);
  const stockActual = Number(p.stockActual);
  const stockMinimo = Number(p.stockMinimo);

  if (!codigoBarras) return { error: 'El código de barras / SKU es obligatorio.' };
  if (!nombre) return { error: 'El nombre del producto es obligatorio.' };
  if (!categoria) return { error: 'La categoría es obligatoria.' };
  if (!Number.isFinite(precioCompra) || precioCompra < 0) {
    return { error: 'El precio de compra debe ser un número mayor o igual a 0.' };
  }
  if (!Number.isFinite(precioVenta) || precioVenta < 0) {
    return { error: 'El precio de venta debe ser un número mayor o igual a 0.' };
  }
  if (!Number.isInteger(stockActual) || stockActual < 0) {
    return { error: 'El stock actual debe ser un número entero mayor o igual a 0.' };
  }
  if (!Number.isInteger(stockMinimo) || stockMinimo < 0) {
    return { error: 'El stock mínimo debe ser un número entero mayor o igual a 0.' };
  }

  const fechaRaw = String(p.fechaVencimiento ?? '').trim();
  const fechaVencimiento = fechaRaw ? fechaRaw : null;

  return {
    datos: {
      codigoBarras,
      nombre,
      categoria,
      marca: String(p.marca ?? '').trim(),
      unidad,
      precioCompra: Number(precioCompra.toFixed(2)),
      precioVenta: Number(precioVenta.toFixed(2)),
      stockActual,
      stockMinimo,
      proveedor: String(p.proveedor ?? '').trim(),
      fechaVencimiento,
      sucursalId,
      imagenDataUrl: String(p.imagenDataUrl ?? ''),
      descripcion: String(p.descripcion ?? '').trim(),
      activo: p.activo === undefined ? true : Boolean(p.activo),
    },
  };
}

async function iniciarServidor() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // =========================================================================
  // RUTAS API PROXY PARA SUPABASE
  // =========================================================================

  app.get('/api/sucursales', async (_req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    try {
      const { data, error } = await supabase
        .from('sucursales')
        .select('id, nombre, direccion, encargado, activa')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al leer sucursales en Supabase:', error);
        return res.status(500).json({ error: 'No se pudieron obtener las sucursales desde Supabase.' });
      }

      return res.json(data ?? []);
    } catch (err) {
      console.error('Excepción en GET /api/sucursales:', err);
      return res.status(500).json({ error: 'Error interno al consultar sucursales.' });
    }
  });

  app.get('/api/productos', async (req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    try {
      const sucursalId = String(req.query.sucursalId ?? 'todas');
      const categoria = String(req.query.categoria ?? 'todas');

      let query = supabase
        .from('productos')
        .select('*')
        .order('creado_fecha', { ascending: false });

      if (sucursalId && sucursalId !== 'todas') {
        query = query.eq('sucursal_id', sucursalId);
      }
      if (categoria && categoria !== 'todas') {
        query = query.eq('categoria', categoria);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error al leer productos en Supabase:', error);
        return res.status(500).json({ error: 'No se pudieron cargar los productos desde Supabase.' });
      }

      const productos = ((data ?? []) as ProductoFilaDB[]).map(mapearFilaAProducto);
      return res.json(productos);
    } catch (err) {
      console.error('Excepción en GET /api/productos:', err);
      return res.status(500).json({ error: 'Error interno al consultar productos.' });
    }
  });

  app.post('/api/productos', async (req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    const { datos, error: errorValidacion } = validarPayloadProducto(req.body);
    if (!datos) {
      return res.status(400).json({ error: errorValidacion });
    }

    try {
      const { data, error } = await supabase
        .from('productos')
        .insert({
          codigo_barras: datos.codigoBarras,
          nombre: datos.nombre,
          categoria: datos.categoria,
          marca: datos.marca,
          unidad: datos.unidad,
          precio_compra: datos.precioCompra,
          precio_venta: datos.precioVenta,
          stock_actual: datos.stockActual,
          stock_minimo: datos.stockMinimo,
          proveedor: datos.proveedor,
          fecha_vencimiento: datos.fechaVencimiento,
          sucursal_id: datos.sucursalId,
          imagen_data_url: datos.imagenDataUrl,
          descripcion: datos.descripcion,
          activo: datos.activo,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({
            error: 'Ya existe un producto con ese código de barras / SKU en esta sucursal.',
          });
        }
        console.error('Error al insertar producto en Supabase:', error);
        return res.status(500).json({ error: 'No se pudo guardar el producto en Supabase.' });
      }

      return res.status(201).json(mapearFilaAProducto(data as ProductoFilaDB));
    } catch (err) {
      console.error('Excepción en POST /api/productos:', err);
      return res.status(500).json({ error: 'Error interno al guardar el producto.' });
    }
  });

  app.put('/api/productos/:id', async (req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    const { id } = req.params;
    const { datos, error: errorValidacion } = validarPayloadProducto(req.body);
    if (!datos) {
      return res.status(400).json({ error: errorValidacion });
    }

    try {
      const { data, error } = await supabase
        .from('productos')
        .update({
          codigo_barras: datos.codigoBarras,
          nombre: datos.nombre,
          categoria: datos.categoria,
          marca: datos.marca,
          unidad: datos.unidad,
          precio_compra: datos.precioCompra,
          precio_venta: datos.precioVenta,
          stock_actual: datos.stockActual,
          stock_minimo: datos.stockMinimo,
          proveedor: datos.proveedor,
          fecha_vencimiento: datos.fechaVencimiento,
          sucursal_id: datos.sucursalId,
          imagen_data_url: datos.imagenDataUrl,
          descripcion: datos.descripcion,
          activo: datos.activo,
          actualizado_fecha: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({
            error: 'Otro producto ya utiliza ese código de barras / SKU en esta sucursal.',
          });
        }
        console.error('Error al actualizar producto en Supabase:', error);
        return res.status(500).json({ error: 'No se pudo actualizar el producto en Supabase.' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Producto no encontrado.' });
      }

      return res.json(mapearFilaAProducto(data as ProductoFilaDB));
    } catch (err) {
      console.error('Excepción en PUT /api/productos/:id:', err);
      return res.status(500).json({ error: 'Error interno al actualizar el producto.' });
    }
  });

  app.delete('/api/productos/:id', async (req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    const { id } = req.params;
    try {
      const { error } = await supabase.from('productos').delete().eq('id', id);

      if (error) {
        console.error('Error al eliminar producto en Supabase:', error);
        return res.status(500).json({ error: 'No se pudo eliminar el producto en Supabase.' });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('Excepción en DELETE /api/productos/:id:', err);
      return res.status(500).json({ error: 'Error interno al eliminar el producto.' });
    }
  });

  // =========================================================================
  // MONTAJE DE VITE EN DESARROLLO O ARCHIVOS ESTÁTICOS EN PRODUCCIÓN
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const puerto = 3000;
  app.listen(puerto, '0.0.0.0', () => {
    console.log(`Servidor ejecutándose en http://0.0.0.0:${puerto}`);
  });
}

iniciarServidor();
