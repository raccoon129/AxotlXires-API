const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { pool } = require('../config/database');

// Obtener todas las publicaciones
router.get('/', async (req, res) => {
  try {
    const [publicaciones] = await pool.query(
      'SELECT * FROM publicaciones WHERE eliminado = 0 ORDER BY fecha_publicacion DESC'
    );
    res.json(publicaciones);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener publicaciones' });
  }
});

// Obtener todas las publicaciones recientes
router.get('/recientes', async (req, res) => {
  try {
    const limit = req.query.limit || 10; // Puedes ajustar el límite según tus necesidades
    const [publicaciones] = await pool.query(
      'SELECT p.id_publicacion, p.titulo, p.resumen, u.nombre as autor, p.fecha_publicacion, p.imagen_portada ' +
      'FROM publicaciones p ' +
      'JOIN usuarios u ON p.id_usuario = u.id_usuario ' +
      'WHERE p.estado = ? AND p.eliminado = ? ' +
      'ORDER BY p.fecha_publicacion DESC ' +
      'LIMIT ?',
      ['publicado', 0, limit]
    );

    if (publicaciones.length === 0) {
      // Si no hay publicaciones, devolver un placeholder
      res.json([{
        id_publicacion: 0,
        titulo: 'Lorem Ipsum',
        resumen: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        autor: 'Autor Desconocido',
        fecha_publicacion: new Date(),
        imagen_portada: 'https://picsum.photos/2159/2794'
      }]);
    } else {
      res.json(publicaciones);
    }
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener publicaciones recientes' });
  }
});

// Obtener todos los tipos de publicaciones
router.get('/tipospublicacion', async (req, res) => {
  try {
      const [tipos] = await pool.query('SELECT id_tipo, nombre, descripcion FROM tipos_publicacion');

      if (tipos.length === 0) {
          return res.status(404).json({ mensaje: 'No se encontraron tipos de publicaciones' });
      }

      res.json({
          mensaje: 'Tipos de publicaciones obtenidos exitosamente',
          datos: tipos
      });
  } catch (error) {
      console.error('Error al obtener los tipos de publicaciones:', error);
      res.status(500).json({ mensaje: 'Error al obtener los tipos de publicaciones' });
  }
});

router.get('/proximoid', async (req, res) => {
  try {
      const [id] = await pool.query('SELECT id_publicacion, id_publicacion + 1 AS proximo_id FROM publicaciones ORDER BY id_publicacion DESC LIMIT 1');


      if (id.length === 0) {
        return res.json({ proximo_id: 1 });
      }

      res.json({
          id: id
      });
  } catch (error) {
      console.error('Error al obtener el último ID de publicación disponible:', error);
      res.status(500).json({ mensaje: 'Error al obtener el tope de los ID Disponibles para publicaciones.' });
  }
});
// Nueva ruta: Obtener todas las publicaciones de un usuario específico
router.get('/usuario/:id_usuario', async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const [publicaciones] = await pool.query(
      'SELECT * FROM publicaciones WHERE id_usuario = ? AND eliminado = 0 ORDER BY fecha_publicacion DESC',
      [id_usuario]
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontraron publicaciones para este usuario' });
    }

    res.json(publicaciones);
  } catch (error) {
    console.error('Error al obtener publicaciones del usuario:', error);
    res.status(500).json({ mensaje: 'Error al obtener publicaciones del usuario' });
  }
});

module.exports = router;

// Nueva ruta: Obtener todas las publicaciones de un usuario específico con estado "publicado"
router.get('/usuario/:id_usuario/publicadas', async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const [publicaciones] = await pool.query(
      'SELECT * FROM publicaciones WHERE id_usuario = ? AND estado = "publicado" AND eliminado = 0 ORDER BY fecha_publicacion DESC',
      [id_usuario]
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontraron publicaciones publicadas para este usuario' });
    }

    res.json(publicaciones);
  } catch (error) {
    console.error('Error al obtener publicaciones publicadas del usuario:', error);
    res.status(500).json({ mensaje: 'Error al obtener publicaciones publicadas del usuario' });
  }
});

// Obtener una publicación específica por ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Consulta para obtener la publicación con datos del autor
        const [publicaciones] = await pool.query(
            `SELECT 
                p.id_publicacion,
                p.titulo,
                p.resumen,
                p.contenido,
                p.referencias,
                p.fecha_publicacion,
                p.imagen_portada,
                p.id_tipo,
                p.estado,
                p.es_privada,
                u.id_usuario,
                u.nombre as autor,
                u.foto_perfil as autor_foto,
                tp.nombre as tipo_publicacion
            FROM publicaciones p
            JOIN usuarios u ON p.id_usuario = u.id_usuario
            JOIN tipos_publicacion tp ON p.id_tipo = tp.id_tipo
            WHERE p.id_publicacion = ? 
            AND p.eliminado = 0 
            AND p.estado = 'publicado'`,
            [id]
        );

        if (publicaciones.length === 0) {
            return res.status(404).json({ 
                status: 'error',
                mensaje: 'Publicación no encontrada o no está disponible' 
            });
        }

        // Obtener el total de favoritos de la publicación
        const [favoritos] = await pool.query(
            'SELECT COUNT(*) as total_favoritos FROM favoritos WHERE id_publicacion = ?',
            [id]
        );

        // Obtener el total de comentarios de la publicación
        const [comentarios] = await pool.query(
            'SELECT COUNT(*) as total_comentarios FROM comentarios WHERE id_publicacion = ?',
            [id]
        );

        // Combinar toda la información
        const publicacionCompleta = {
            ...publicaciones[0],
            total_favoritos: favoritos[0].total_favoritos,
            total_comentarios: comentarios[0].total_comentarios
        };

        res.json({
            status: 'success',
            mensaje: 'Publicación recuperada exitosamente',
            datos: publicacionCompleta
        });

    } catch (error) {
        console.error('Error al obtener la publicación:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener la publicación',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});