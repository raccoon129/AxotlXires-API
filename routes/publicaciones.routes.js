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

// Crear nueva publicación
router.post('/', verificarToken, upload.single('imagen_portada'), async (req, res) => {
  try {
    const { titulo, resumen, contenido, id_tipo } = req.body;
    const imagen_portada = req.file ? req.file.path : null;
    
    const [resultado] = await pool.query(
      'INSERT INTO publicaciones (id_usuario, titulo, resumen, contenido, id_tipo, imagen_portada, estado) VALUES (?, ?, ?, ?, ?, ?, "borrador")',
      [req.usuario.id, titulo, resumen, contenido, id_tipo, imagen_portada]
    );

    res.status(201).json({ 
      mensaje: 'Publicación creada',
      id: resultado.insertId 
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear publicación' });
  }
});

// Actualizar publicación
router.put('/:id', verificarToken, upload.single('imagen_portada'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, resumen, contenido, id_tipo } = req.body;
    const imagen_portada = req.file ? req.file.path : null;

    const [publicacion] = await pool.query(
      'SELECT * FROM publicaciones WHERE id_publicacion = ? AND id_usuario = ?',
      [id, req.usuario.id]
    );

    if (publicacion.length === 0) {
      return res.status(404).json({ mensaje: 'Publicación no encontrada' });
    }

    let queryImagen = imagen_portada ? ', imagen_portada = ?' : '';
    let valores = [titulo, resumen, contenido, id_tipo, id];
    if (imagen_portada) valores.splice(4, 0, imagen_portada);

    await pool.query(
      `UPDATE publicaciones SET titulo = ?, resumen = ?, contenido = ?, id_tipo = ?${queryImagen} WHERE id_publicacion = ?`,
      valores
    );

    res.json({ mensaje: 'Publicación actualizada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar publicación' });
  }
});

// Eliminar publicación (borrado lógico)
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'UPDATE publicaciones SET eliminado = 1, fecha_eliminacion = NOW() WHERE id_publicacion = ? AND id_usuario = ?',
      [id, req.usuario.id]
    );

    res.json({ mensaje: 'Publicación eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar publicación' });
  }
});

module.exports = router;