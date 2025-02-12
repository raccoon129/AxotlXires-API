// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

/**
 * Validación de formato de correo electrónico
 * @param {string} correo - Correo electrónico a validar
 * @returns {boolean} - true si el formato es válido
 */
const validarCorreo = (correo) => {
    const regexCorreo = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return regexCorreo.test(correo);
};

/**
 * Validación de contraseña
 * Debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número
 * @param {string} contrasena - Contraseña a validar
 * @returns {boolean} - true si cumple con los requisitos
 */
const validarContrasena = (contrasena) => {
    const regexContrasena = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
    return regexContrasena.test(contrasena);
};

/**
 * Ruta para iniciar sesión
 * Espera recibir:
 * - correo: string
 * - contrasena: string
 */
router.post('/login', async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        // Validar campos requeridos
        if (!correo || !contrasena) {
            return res.status(400).json({ 
                mensaje: 'Correo y contraseña son requeridos' 
            });
        }

        // Buscar usuario por correo
        const [usuarios] = await pool.query(
            'SELECT * FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({ 
                mensaje: 'Credenciales inválidas' 
            });
        }

        const usuario = usuarios[0];

        // Verificar contraseña
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

        if (!contrasenaValida) {
            return res.status(401).json({ 
                mensaje: 'Credenciales inválidas' 
            });
        }

        // Generar token JWT
        const token = jwt.sign(
            { 
                id: usuario.id_usuario, 
                rol: usuario.rol 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Actualizar último acceso
        await pool.query(
            'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?',
            [usuario.id_usuario]
        );

        // Enviar respuesta exitosa
        res.json({
            token,
            usuario: {
                id: usuario.id_usuario,
                correo: usuario.correo,
                nombre: usuario.nombre,
                rol: usuario.rol,
                foto_perfil: usuario.foto_perfil
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            mensaje: 'Error al iniciar sesión',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.post('/registro', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      const { nombre, correo, contrasena } = req.body;
  
      // Verificar si el correo ya existe
      const [existingUser] = await connection.query(
        'SELECT id_usuario FROM usuarios WHERE correo = ?',
        [correo]
      );
  
      if (existingUser.length > 0) {
        return res.status(400).json({
          status: 'error',
          mensaje: 'El correo electrónico ya está registrado'
        });
      }
  
      const hashedPassword = await bcrypt.hash(contrasena, 10);
      
      await connection.query(
        'INSERT INTO usuarios (nombre, correo, contrasena_hash, rol) VALUES (?, ?, ?, ?)',
        [nombre, correo, hashedPassword, 'usuario']
      );
  
      res.status(201).json({
        status: 'success',
        mensaje: 'Usuario registrado exitosamente'
      });
  
    } catch (error) {
      console.error('Error en registro:', error);
      res.status(500).json({
        status: 'error',
        mensaje: 'Error al registrar usuario'
      });
    } finally {
      connection.release();
    }
  });

module.exports = router;