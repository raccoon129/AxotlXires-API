const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { pool } = require('../config/database');

// Obtener todas las publicaciones
router.get('/', async (req, res) => {
  try {
    const [publicaciones] = await pool.query(
      'SELECT * FROM publicaciones WHERE eliminado = 0'
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
      'SELECT * FROM publicaciones WHERE id_usuario = ? AND eliminado = 0',
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

