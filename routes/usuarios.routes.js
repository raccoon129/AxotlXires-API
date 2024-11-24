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
       WHERE id_usuario = ? AND eliminado = 0 AND estado = 'publicado' AND es_privada = 0`,
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

// 1. Actualizar información básica
router.put('/actualizacion/:id/info-basica', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const userId = req.params.id;
    const { nombre, nombramiento, correo } = req.body;

    if (req.usuario.id !== parseInt(userId)) {
      return res.status(403).json({
        status: 'error',
        mensaje: 'No tienes permiso para modificar este perfil'
      });
    }

    if (!nombre && !nombramiento && !correo) {
      return res.status(400).json({
        status: 'error',
        mensaje: 'Debe proporcionar al menos un campo para actualizar'
      });
    }

    await connection.beginTransaction();

    if (correo) {
      const [existingEmail] = await connection.query(
        'SELECT id_usuario FROM usuarios WHERE correo = ? AND id_usuario != ?',
        [correo, userId]
      );
      
      if (existingEmail.length > 0) {
        throw new Error('El correo electrónico ya está en uso');
      }
    }

    const updateFields = {};
    if (nombre) updateFields.nombre = nombre;
    if (nombramiento) updateFields.nombramiento = nombramiento;
    if (correo) updateFields.correo = correo;

    const updateQuery = 'UPDATE usuarios SET ? WHERE id_usuario = ?';
    await connection.query(updateQuery, [updateFields, userId]);
    await connection.commit();

    res.json({
      status: 'success',
      mensaje: 'Información básica actualizada exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({
      status: 'error',
      mensaje: error.message || 'Error al actualizar información básica'
    });
  } finally {
    connection.release();
  }
});

// 2. Actualizar foto de perfil
router.put('/actualizacion/:id/foto', authenticateToken, upload.single('foto_perfil'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const userId = req.params.id;

    if (req.usuario.id !== parseInt(userId)) {
      return res.status(403).json({
        status: 'error',
        mensaje: 'No tienes permiso para modificar este perfil'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        mensaje: 'No se proporcionó ninguna imagen'
      });
    }

    await connection.beginTransaction();

    const [usuario] = await connection.query(
      'SELECT foto_perfil FROM usuarios WHERE id_usuario = ?',
      [userId]
    );

    const filename = await processProfileImage(req.file);

    if (usuario[0].foto_perfil) {
      const oldImagePath = path.join('uploads/perfil', usuario[0].foto_perfil);
      try {
        await fs.unlink(oldImagePath);
      } catch (error) {
        console.error('Error al eliminar imagen anterior:', error);
      }
    }

    await connection.query(
      'UPDATE usuarios SET foto_perfil = ? WHERE id_usuario = ?',
      [filename, userId]
    );

    await connection.commit();

    res.json({
      status: 'success',
      mensaje: 'Foto de perfil actualizada exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({
      status: 'error',
      mensaje: error.message || 'Error al actualizar foto de perfil'
    });
  } finally {
    connection.release();
  }
});

// 3. Actualizar contraseña
router.put('/actualizacion/:id/password', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const userId = req.params.id;
    const { contrasenaActual, nuevaContrasena, confirmarContrasena } = req.body;

    if (req.usuario.id !== parseInt(userId)) {
      return res.status(403).json({
        status: 'error',
        mensaje: 'No tienes permiso para modificar este perfil'
      });
    }

    if (!contrasenaActual || !nuevaContrasena || !confirmarContrasena) {
      return res.status(400).json({
        status: 'error',
        mensaje: 'Todos los campos de contraseña son requeridos'
      });
    }

    if (nuevaContrasena !== confirmarContrasena) {
      return res.status(400).json({
        status: 'error',
        mensaje: 'Las contraseñas nuevas no coinciden'
      });
    }

    const [usuario] = await connection.query(
      'SELECT contrasena_hash FROM usuarios WHERE id_usuario = ?',
      [userId]
    );

    const isValidPassword = await bcrypt.compare(contrasenaActual, usuario[0].contrasena_hash);
    if (!isValidPassword) {
      return res.status(400).json({
        status: 'error',
        mensaje: 'La contraseña actual es incorrecta'
      });
    }

    await connection.beginTransaction();

    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);
    await connection.query(
      'UPDATE usuarios SET contrasena_hash = ? WHERE id_usuario = ?',
      [hashedPassword, userId]
    );

    await connection.commit();

    res.json({
      status: 'success',
      mensaje: 'Contraseña actualizada exitosamente'
    });

  } catch (error) {
    await connection.rollback();
    res.status(400).json({
      status: 'error',
      mensaje: error.message || 'Error al actualizar contraseña'
    });
  } finally {
    connection.release();
  }
});

module.exports = router;