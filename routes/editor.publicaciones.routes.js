const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { pool } = require('../config/database');

// Obtener datos de una publicación por su ID
router.get('/:id', async (req, res) => {
    try {
        const publicacionId = req.params.id;

        const [publicaciones] = await pool.query(
            `SELECT 
                p.id_publicacion, 
                p.id_usuario, 
                u.nombre AS autor, 
                p.titulo, 
                p.resumen, 
                p.contenido, 
                p.referencias,
                p.estado, 
                p.imagen_portada, 
                p.es_privada, 
                p.fecha_creacion, 
                p.fecha_publicacion,
                p.id_tipo
             FROM publicaciones p
             JOIN usuarios u ON p.id_usuario = u.id_usuario
             WHERE p.id_publicacion = ? AND p.eliminado = 0`,
            [publicacionId]
        );

        if (publicaciones.length === 0) {
            return res.status(404).json({ mensaje: 'Publicación no encontrada' });
        }

        res.json({
            mensaje: 'Publicación obtenida exitosamente',
            datos: publicaciones[0]
        });
    } catch (error) {
        console.error('Error al obtener la publicación:', error);
        res.status(500).json({ mensaje: 'Error al obtener la publicación' });
    }
});

// Crear una nueva publicación que se enviará primero a revisión
router.post('/', verificarToken, upload.single('imagen_portada'), async (req, res) => {
    try {
        const { id: userId } = req.usuario;
        const { titulo, resumen, contenido, referencias = '', estado = 'en_revision', es_privada = 1, id_tipo } = req.body;
        const imagenPortada = req.file ? req.file.path : null;

        if (!id_tipo) {
            return res.status(400).json({ mensaje: 'El campo id_tipo es obligatorio.' });
        }

        const [resultado] = await pool.query(
            `INSERT INTO publicaciones (id_usuario, titulo, resumen, contenido, referencias, estado, es_privada, imagen_portada, fecha_creacion, id_tipo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [userId, titulo, resumen, contenido, referencias, estado, es_privada, imagenPortada, id_tipo]
        );

        res.status(201).json({
            mensaje: 'Publicación creada exitosamente',
            datos: {
                id_publicacion: resultado.insertId,
                titulo,
                resumen,
                contenido,
                referencias,
                estado,
                es_privada,
                imagen_portada: imagenPortada,
                id_tipo
            }
        });
    } catch (error) {
        console.error('Error al crear la publicación:', error);
        res.status(500).json({ mensaje: 'Error al crear la publicación', error });
    }
});



// Guardar o actualizar un borrador existente
router.post('/borrador', verificarToken, upload.single('imagen_portada'), async (req, res) => {
    try {
        // Imprimir en la terminal el cuerpo de la solicitud y el archivo recibido
        console.log('Datos recibidos:', {
            body: req.body,
            file: req.file
        });

        const { id: userId } = req.usuario;
        const { id_publicacion, titulo, resumen, contenido, id_tipo, referencias = '' } = req.body;
        const imagenPortada = req.file ? req.file.path : null;

        // Verificar que el id_publicacion y el id_tipo estén presentes
        if (!id_publicacion) {
            return res.status(400).json({ mensaje: 'El ID de la publicación es obligatorio para guardar o actualizar un borrador.' });
        }
        if (!id_tipo) {
            return res.status(400).json({ mensaje: 'El campo id_tipo es obligatorio.' });
        }

        // Obtener el ID de publicación más alto en la base de datos
        const [ultimoIdPublicacion] = await pool.query(
            `SELECT id_publicacion FROM publicaciones ORDER BY id_publicacion DESC LIMIT 1`
        );

        // Comprobar si el id_publicacion proporcionado es mayor al último ID de la base de datos
        if (id_publicacion > ultimoIdPublicacion[0]?.id_publicacion) {
            // Insertar un nuevo borrador
            const [resultado] = await pool.query(
                `INSERT INTO publicaciones (id_publicacion, id_usuario, titulo, resumen, contenido, referencias, estado, imagen_portada, id_tipo, es_privada) 
                 VALUES (?, ?, ?, ?, ?, ?, 'borrador', ?, ?, 1)`,
                [id_publicacion, userId, titulo, resumen, contenido, referencias, imagenPortada, id_tipo]
            );

            return res.json({
                mensaje: 'Borrador creado exitosamente',
                datos: {
                    id_publicacion: resultado.insertId,
                    titulo,
                    resumen,
                    contenido,
                    referencias,
                    estado: 'borrador',
                    es_privada: 1,
                    imagen_portada: imagenPortada,
                    id_tipo
                }
            });
        } else {
            // Verificar si existe un borrador con el id_publicacion proporcionado y pertenece al usuario
            const [borradorExistente] = await pool.query(
                `SELECT id_publicacion FROM publicaciones 
                 WHERE id_publicacion = ? AND id_usuario = ? AND estado = 'borrador' AND eliminado = 0`,
                [id_publicacion, userId]
            );

            if (borradorExistente.length > 0) {
                // Si existe el borrador, lo actualizamos
                await pool.query(
                    `UPDATE publicaciones 
                     SET titulo = ?, resumen = ?, contenido = ?, referencias = ?, imagen_portada = ?, id_tipo = ?
                     WHERE id_publicacion = ?`,
                    [titulo, resumen, contenido, referencias, imagenPortada, id_tipo, id_publicacion]
                );

                return res.json({
                    mensaje: 'Borrador actualizado exitosamente',
                    datos: {
                        id_publicacion,
                        titulo,
                        resumen,
                        contenido,
                        referencias,
                        estado: 'borrador',
                        es_privada: 1,
                        imagen_portada: imagenPortada,
                        id_tipo
                    }
                });
            } else {
                return res.status(404).json({ mensaje: 'Borrador no encontrado o no pertenece al usuario' });
            }
        }
    } catch (error) {
        console.error('Error al guardar o actualizar el borrador:', error);
        res.status(500).json({ mensaje: 'Error al guardar o actualizar el borrador', error });
    }
});







// Actualizar una publicación existente
router.put('/:id', verificarToken, upload.single('imagen_portada'), async (req, res) => {
    try {
        const publicacionId = req.params.id;
        const { id: userId } = req.usuario;
        const { titulo, resumen, contenido, referencias = '', estado, es_privada, id_tipo } = req.body;
        const imagenPortada = req.file ? req.file.path : null;

        if (!id_tipo) {
            return res.status(400).json({ mensaje: 'El campo id_tipo es obligatorio.' });
        }

        // Verificar que la publicación exista y pertenezca al usuario
        const [autorPublicacion] = await pool.query(
            'SELECT id_usuario FROM publicaciones WHERE id_publicacion = ?',
            [publicacionId]
        );

        if (autorPublicacion.length === 0) {
            return res.status(404).json({ mensaje: 'Publicación no encontrada' });
        }

        if (autorPublicacion[0].id_usuario !== userId) {
            return res.status(403).json({ mensaje: 'No tienes permiso para modificar esta publicación' });
        }

        // Actualizar la publicación
        await pool.query(
            `UPDATE publicaciones 
             SET titulo = ?, resumen = ?, contenido = ?, referencias = ?, estado = ?, es_privada = ?, imagen_portada = ?, id_tipo = ?
             WHERE id_publicacion = ?`,
            [titulo, resumen, contenido, referencias, estado, es_privada, imagenPortada, id_tipo, publicacionId]
        );

        res.json({ mensaje: 'Publicación actualizada exitosamente' });
    } catch (error) {
        console.error('Error al actualizar la publicación:', error);
        res.status(500).json({ mensaje: 'Error al actualizar la publicación' });
    }
});

module.exports = router;
