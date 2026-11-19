import express from 'express';
import type { Express, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

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

interface ItemVentaEntrada {
  productoId: string;
  nombre?: string;
  cantidad: number;
  precioUnitario: number;
}

interface VentaFilaDB {
  id: string;
  fecha: string;
  sucursal_id: string;
  items: ItemVentaEntrada[];
  total: number | string;
  metodo_pago: string;
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

function traducirErrorSupabase(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code === '42P01' || error.code === 'PGRST205') {
    return 'Faltan las tablas en Supabase. Ejecuta el script SQL (supabase/schema.sql) en el SQL Editor de Supabase.';
  }
  if (error.code === '42501') {
    return 'Permisos insuficientes (RLS) en Supabase. Revisa las políticas o usa SUPABASE_SERVICE_ROLE_KEY.';
  }
  return fallback;
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

function mapearFilaAVenta(fila: VentaFilaDB) {
  return {
    id: fila.id,
    fecha: fila.fecha,
    sucursalId: fila.sucursal_id,
    items: Array.isArray(fila.items) ? fila.items : [],
    total: Number(fila.total),
    metodoPago: fila.metodo_pago,
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

export function crearAppApi(): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // =========================================================================
  // SUCURSALES
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
        return res.status(500).json({
          error: traducirErrorSupabase(error, 'No se pudieron obtener las sucursales desde Supabase.'),
        });
      }

      return res.json(data ?? []);
    } catch (err) {
      console.error('Excepción en GET /api/sucursales:', err);
      return res.status(500).json({ error: 'Error interno al consultar sucursales.' });
    }
  });

  app.post('/api/sucursales', async (req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    const nombre = String(req.body?.nombre ?? '').trim();
    const direccion = String(req.body?.direccion ?? '').trim();
    const encargado = String(req.body?.encargado ?? '').trim();

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre de la sucursal es obligatorio.' });
    }

    const slug = nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = `${slug || 'sucursal'}-${Date.now().toString().slice(-4)}`;

    try {
      const { data, error } = await supabase
        .from('sucursales')
        .insert({ id, nombre, direccion, encargado, activa: true })
        .select('id, nombre, direccion, encargado, activa')
        .single();

      if (error) {
        console.error('Error al crear sucursal en Supabase:', error);
        return res.status(500).json({
          error: traducirErrorSupabase(error, 'No se pudo guardar la sucursal en Supabase.'),
        });
      }

      return res.status(201).json(data);
    } catch (err) {
      console.error('Excepción en POST /api/sucursales:', err);
      return res.status(500).json({ error: 'Error interno al crear sucursal.' });
    }
  });

  // =========================================================================
  // PRODUCTOS
  // =========================================================================

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
        return res.status(500).json({
          error: traducirErrorSupabase(error, 'No se pudieron cargar los productos desde Supabase.'),
        });
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
        return res.status(500).json({
          error: traducirErrorSupabase(error, 'No se pudo guardar el producto en Supabase.'),
        });
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
        return res.status(500).json({
          error: traducirErrorSupabase(error, 'No se pudo actualizar el producto en Supabase.'),
        });
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
        return res.status(500).json({
          error: traducirErrorSupabase(error, 'No se pudo eliminar el producto en Supabase.'),
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('Excepción en DELETE /api/productos/:id:', err);
      return res.status(500).json({ error: 'Error interno al eliminar el producto.' });
    }
  });

  // =========================================================================
  // VENTAS (COBRAR Y DESCONTAR STOCK)
  // =========================================================================

  app.get('/api/ventas', async (req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    try {
      const sucursalId = String(req.query.sucursalId ?? 'todas');
      let query = supabase
        .from('ventas')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(100);

      if (sucursalId && sucursalId !== 'todas') {
        query = query.eq('sucursal_id', sucursalId);
      }

      const { data, error } = await query;
      if (error) {
        // Si la tabla ventas aún no fue creada por el usuario, devolver [] sin romper la carga
        if (error.code === '42P01' || error.code === 'PGRST205') {
          return res.json([]);
        }
        console.error('Error al leer ventas en Supabase:', error);
        return res.status(500).json({ error: 'No se pudieron obtener las ventas.' });
      }

      return res.json(((data ?? []) as VentaFilaDB[]).map(mapearFilaAVenta));
    } catch (err) {
      console.error('Excepción en GET /api/ventas:', err);
      return res.status(500).json({ error: 'Error interno al consultar ventas.' });
    }
  });

  app.post('/api/ventas', async (req: Request, res: Response) => {
    const supabase = obtenerClienteSupabase();
    if (!supabase) {
      return res.status(503).json({
        code: 'SUPABASE_NOT_CONFIGURED',
        error: 'Supabase no configurado en variables de entorno.',
      });
    }

    const sucursalId = String(req.body?.sucursalId ?? 'sucursal-principal').trim();
    const metodoPago = String(req.body?.metodoPago ?? 'Efectivo').trim();
    const items = Array.isArray(req.body?.items) ? (req.body.items as ItemVentaEntrada[]) : [];

    if (items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío.' });
    }

    try {
      const ids = items.map((i) => i.productoId);
      const { data: productosDB, error: errFetch } = await supabase
        .from('productos')
        .select('id, nombre, stock_actual, precio_venta')
        .in('id', ids);

      if (errFetch) {
        console.error('Error verificando stock para venta:', errFetch);
        return res.status(500).json({
          error: traducirErrorSupabase(errFetch, 'No se pudo verificar el stock de los productos.'),
        });
      }

      const mapaProductos = new Map(
        ((productosDB ?? []) as Array<{ id: string; nombre: string; stock_actual: number; precio_venta: number | string }>).map(
          (p) => [p.id, p]
        )
      );

      let totalCalculado = 0;
      const itemsValidados: ItemVentaEntrada[] = [];

      for (const item of items) {
        const prod = mapaProductos.get(item.productoId);
        const cantidad = Number(item.cantidad);
        if (!prod) {
          return res.status(404).json({ error: 'Uno de los productos del carrito ya no existe.' });
        }
        if (!Number.isInteger(cantidad) || cantidad <= 0) {
          return res.status(400).json({ error: `Cantidad inválida para "${prod.nombre}".` });
        }
        if (prod.stock_actual < cantidad) {
          return res.status(409).json({
            error: `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock_actual}.`,
          });
        }

        const precioUnitario = Number(prod.precio_venta);
        totalCalculado += precioUnitario * cantidad;
        itemsValidados.push({
          productoId: prod.id,
          nombre: prod.nombre,
          cantidad,
          precioUnitario,
        });
      }

      totalCalculado = Number(totalCalculado.toFixed(2));

      // Descontar stock de cada producto en Supabase
      const productosActualizados: Array<ReturnType<typeof mapearFilaAProducto>> = [];
      for (const item of itemsValidados) {
        const prod = mapaProductos.get(item.productoId)!;
        const nuevoStock = prod.stock_actual - item.cantidad;
        const { data: updated, error: errUpd } = await supabase
          .from('productos')
          .update({
            stock_actual: nuevoStock,
            actualizado_fecha: new Date().toISOString(),
          })
          .eq('id', item.productoId)
          .select()
          .single();

        if (errUpd || !updated) {
          console.error('Error actualizando stock tras venta:', errUpd);
          return res.status(500).json({ error: 'Error al descontar el stock del producto.' });
        }
        productosActualizados.push(mapearFilaAProducto(updated as ProductoFilaDB));
      }

      // Guardar el registro de venta en tabla ventas (si existe)
      const { data: ventaInsertada, error: errVenta } = await supabase
        .from('ventas')
        .insert({
          sucursal_id: sucursalId,
          items: itemsValidados,
          total: totalCalculado,
          metodo_pago: metodoPago,
        })
        .select()
        .single();

      const ventaRespuesta =
        !errVenta && ventaInsertada
          ? mapearFilaAVenta(ventaInsertada as VentaFilaDB)
          : {
              id: `vta_${Date.now()}`,
              fecha: new Date().toISOString(),
              sucursalId,
              items: itemsValidados,
              total: totalCalculado,
              metodoPago,
            };

      return res.status(201).json({
        venta: ventaRespuesta,
        productosActualizados,
      });
    } catch (err) {
      console.error('Excepción en POST /api/ventas:', err);
      return res.status(500).json({ error: 'Error interno al procesar la venta.' });
    }
  });

  app.all('/api/*', (_req: Request, res: Response) => {
    return res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  return app;
}
