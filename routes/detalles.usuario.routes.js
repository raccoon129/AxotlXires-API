const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const path = require('path');
const fs = require('fs').promises;

// Obtener detalles públicos del usuario por ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    const [usuarios] = await pool.query(
      `SELECT id_usuario, nombre, nombramiento, fecha_creacion, 
              ultimo_acceso, foto_perfil 
       FROM usuarios WHERE id_usuario = ?`,
      [userId]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        mensaje: 'Usuario no encontrado' 
      });
    }

    const [publicaciones] = await pool.query(
      `SELECT COUNT(*) as total_publicaciones 
       FROM publicaciones 
       WHERE id_usuario = ? AND eliminado = 0 
       AND estado = 'publicado' AND es_privada = 0`,
      [userId]
    );

    const perfilPublico = {
      ...usuarios[0],
      total_publicaciones: publicaciones[0].total_publicaciones
    };

    res.json({
      status: 'success',
      mensaje: 'Detalles recuperados exitosamente',
      datos: perfilPublico
    });

  } catch (error) {
    console.error('Error al obtener detalles:', error);
    res.status(500).json({
      status: 'error',
      mensaje: 'Error al obtener los detalles del usuario'
    });
  }
});

// Obtener foto de perfil por ID de usuario
router.get('/:id/foto', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Obtener el filename de la base de datos
    const [usuario] = await pool.query(
      'SELECT foto_perfil FROM usuarios WHERE id_usuario = ?',
      [userId]
    );

    if (usuario.length === 0) {
      return res.status(404).json({
        status: 'error',
        mensaje: 'Usuario no encontrado'
      });
    }

    const filename = usuario[0].foto_perfil;

    // Si no tiene foto de perfil asignada
    if (!filename) {
      return res.sendFile(path.join(__dirname, '..', 'assets', 'default', 'who.jpg'));
    }

    const imagePath = path.join(__dirname, '..', 'uploads', 'perfil', filename);

    try {
      await fs.access(imagePath);
      res.sendFile(imagePath);
    } catch (error) {
      // Si no existe la imagen, enviar imagen por defecto
      res.sendFile(path.join(__dirname, '..', 'assets', 'default', 'who.jpg'));
    }
  } catch (error) {
    console.error('Error al obtener foto de perfil:', error);
    res.status(500).json({
      status: 'error',
      mensaje: 'Error al obtener la imagen'
    });
  }
});

module.exports = router;