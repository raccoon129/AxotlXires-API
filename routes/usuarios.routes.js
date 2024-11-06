const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const authenticateToken = require('../middleware/autenticateToken');
const upload = require('../middleware/multer');

// Función auxiliar para procesar la imagen
async function processProfileImage(file) {
  const filename = `profile-${uuidv4()}${path.extname(file.originalname)}`;
  const outputPath = path.join('uploads/perfil', filename);
  
  await sharp(file.path)
    .resize(500, 500, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
    
  // Eliminar archivo temporal
  await fs.unlink(file.path);
  
  return filename;
}

// Obtener perfil de usuario por ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    const [usuarios] = await pool.query(
      `SELECT id_usuario, nombre, nombramiento, fecha_creacion, ultimo_acceso, foto_perfil, rol, correo 
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
       WHERE id_usuario = ? AND eliminado = 0 AND estado = 'publicado'`,
      [userId]
    );

    const perfilUsuario = {
      ...usuarios[0],
      total_publicaciones: publicaciones[0].total_publicaciones
    };

    delete perfilUsuario.contrasena_hash;

    res.json({
      status: 'success',
      mensaje: 'Perfil recuperado exitosamente',
      datos: perfilUsuario
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({
      status: 'error',
      mensaje: 'Error al obtener el perfil del usuario',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Actualizar perfil de usuario
router.put('/:id', authenticateToken, upload.single('foto_perfil'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const userId = req.params.id;
    const { nombre, nombramiento, correo, contrasenaActual, nuevaContrasena } = req.body;

    // Verificar que el usuario autenticado sea el mismo que se intenta modificar
    if (req.usuario.id !== parseInt(userId)) {
      return res.status(403).json({
        status: 'error',
        mensaje: 'No tienes permiso para modificar este perfil'
      });
    }

    // Verificar que el usuario existe
    const [usuario] = await connection.query(
      'SELECT contrasena_hash, foto_perfil FROM usuarios WHERE id_usuario = ?',
      [userId]
    );

    if (usuario.length === 0) {
      return res.status(404).json({
        status: 'error',
        mensaje: 'Usuario no encontrado'
      });
    }

    // Iniciar transacción
    await connection.beginTransaction();

    let updateFields = {};
    let updateValues = [];
    let updateQuery = 'UPDATE usuarios SET ';

    // Procesar campos básicos
    if (nombre) {
      updateFields.nombre = nombre;
    }
    if (nombramiento) {
      updateFields.nombramiento = nombramiento;
    }
    if (correo) {
      // Verificar si el correo ya existe
      const [existingEmail] = await connection.query(
        'SELECT id_usuario FROM usuarios WHERE correo = ? AND id_usuario != ?',
        [correo, userId]
      );
      
      if (existingEmail.length > 0) {
        throw new Error('El correo electrónico ya está en uso');
      }
      updateFields.correo = correo;
    }

    // Procesar cambio de contraseña
    if (contrasenaActual && nuevaContrasena) {
      const isValidPassword = await bcrypt.compare(contrasenaActual, usuario[0].contrasena_hash);
      if (!isValidPassword) {
        throw new Error('La contraseña actual es incorrecta');
      }
      
      const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);
      updateFields.contrasena_hash = hashedPassword;
    }

    // Procesar imagen si se proporciona
    if (req.file) {
      const filename = await processProfileImage(req.file);
      updateFields.foto_perfil = filename;

      // Eliminar imagen anterior si existe
      if (usuario[0].foto_perfil) {
        const oldImagePath = path.join('uploads/perfil', usuario[0].foto_perfil);
        try {
          await fs.unlink(oldImagePath);
        } catch (error) {
          console.error('Error al eliminar imagen anterior:', error);
        }
      }
    }

    // Construir query de actualización
    const entries = Object.entries(updateFields);
    if (entries.length === 0) {
      return res.status(400).json({
        status: 'error',
        mensaje: 'No se proporcionaron campos para actualizar'
      });
    }

    updateQuery += entries
      .map(([key], index) => `${key} = ?`)
      .join(', ');
    updateQuery += ' WHERE id_usuario = ?';
    
    updateValues = [...entries.map(([, value]) => value), userId];

    // Ejecutar actualización
    await connection.query(updateQuery, updateValues);
    await connection.commit();

    res.json({
      status: 'success',
      mensaje: 'Perfil actualizado exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error al actualizar perfil:', error);
    
    res.status(400).json({
      status: 'error',
      mensaje: error.message || 'Error al actualizar el perfil',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
});

module.exports = router;