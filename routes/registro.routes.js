const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Agregar esta importación
const { pool } = require('../config/database');
const upload = require('../middleware/multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../middleware/autenticateToken'); // Agregar esta importación

// Validaciones
const validarCorreo = (correo) => {
    const regexCorreo = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return regexCorreo.test(correo);
};

const validarContrasena = (contrasena) => {
    const regexContrasena = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
    return regexContrasena.test(contrasena);
};

// Función auxiliar para procesar imagen
async function processProfileImage(file) {
    const filename = `profile-${uuidv4()}${path.extname(file.originalname)}`;
    const uploadDir = path.join(__dirname, '..', 'uploads', 'perfil');
    
    await fs.mkdir(uploadDir, { recursive: true });
    const outputPath = path.join(uploadDir, filename);
    
    await sharp(file.buffer)
        .resize(500, 500, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    
    return filename;
}

// Paso 1: Registro inicial con correo y contraseña
router.post('/paso1', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { correo, contrasena } = req.body;

        // Validaciones básicas
        if (!correo || !contrasena) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Correo y contraseña son obligatorios'
            });
        }

        if (!validarCorreo(correo)) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Formato de correo inválido'
            });
        }

        if (!validarContrasena(contrasena)) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número'
            });
        }

        // Verificar correo existente
        const [existingUser] = await connection.query(
            'SELECT id_usuario FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({
                status: 'error',
                mensaje: 'El correo electrónico ya está registrado',
                codigo: 'EMAIL_DUPLICATE'
            });
        }

        const nombreUsuario = correo.split('@')[0];
        const contrasenaHash = await bcrypt.hash(contrasena, 10);

        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO usuarios (correo, contrasena_hash, nombre, nombramiento, fecha_creacion, rol) VALUES (?, ?, ?, ?, NOW(), ?)',
            [correo, contrasenaHash, nombreUsuario, 'Alguien interesante', 'registrado']
        );

        // Generar token JWT
        const token = jwt.sign(
            { 
                id: result.insertId,
                rol: 'registrado'
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Actualizar último acceso
        await connection.query(
            'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?',
            [result.insertId]
        );

        await connection.commit();

        res.status(201).json({
            status: 'success',
            mensaje: 'Paso 1 completado',
            id_usuario: result.insertId,
            token,
            usuario: {
                id: result.insertId,
                correo,
                nombre: nombreUsuario,
                nombramiento: 'Alguien interesante',
                rol: 'registrado'
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error en registro paso 1:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error en el registro inicial',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

// Paso 2: Actualización de datos personales
router.put('/paso2/:id', authenticateToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { nombre, nombramiento } = req.body;
        const userId = req.params.id;

        // Verificar que el usuario autenticado es el mismo que se intenta modificar
        if (req.usuario.id !== parseInt(userId)) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para modificar este perfil'
            });
        }

        // Validaciones
        if (!nombre || !nombramiento) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Nombre y nombramiento son obligatorios'
            });
        }

        if (nombre.length < 2 || nombre.length > 100) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'El nombre debe tener entre 2 y 100 caracteres'
            });
        }

        if (nombramiento.length < 2 || nombramiento.length > 100) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'El nombramiento debe tener entre 2 y 100 caracteres'
            });
        }

        await connection.beginTransaction();

        await connection.query(
            'UPDATE usuarios SET nombre = ?, nombramiento = ? WHERE id_usuario = ?',
            [nombre, nombramiento, userId]
        );

        await connection.commit();

        res.json({
            status: 'success',
            mensaje: 'Información personal actualizada'
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al actualizar datos personales',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

// Paso 3: Subida de foto de perfil (opcional)
router.put('/paso3/:id', authenticateToken, upload.single('foto_perfil'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const userId = req.params.id;

        // Verificar que el usuario autenticado es el mismo que se intenta modificar
        if (req.usuario.id !== parseInt(userId)) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para modificar este perfil'
            });
        }

        let filename = null;
        if (req.file) {
            filename = await processProfileImage(req.file);
        }

        await connection.beginTransaction();

        await connection.query(
            'UPDATE usuarios SET foto_perfil = ? WHERE id_usuario = ?',
            [filename, userId]
        );

        await connection.commit();

        res.json({
            status: 'success',
            mensaje: 'Foto de perfil actualizada'
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al subir foto de perfil',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
});

module.exports = router;