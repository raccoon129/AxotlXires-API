const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { pool } = require('../config/database');
const path = require('path');
const fs = require('fs').promises;

// Obtener datos de una publicación por su ID
router.get('/:id', verificarToken, async (req, res) => {
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

// Función auxiliar para procesar la imagen de portada
async function procesarImagenPortada(file) {
    try {
        // Generar nombre único para el archivo
        const nombreArchivo = 'portada_' + Date.now() + path.extname(file.originalname);
        
        // Construir ruta completa para guardar el archivo
        const rutaCompleta = path.join('uploads', 'portadas', nombreArchivo);

        // Mover el archivo
        await fs.rename(file.path, rutaCompleta);

        // Devolver solo el nombre del archivo para guardar en la base de datos
        return nombreArchivo;
    } catch (error) {
        console.error('Error al procesar imagen de portada:', error);
        throw error;
    }
}

// Función auxiliar para eliminar imagen de portada anterior
async function eliminarImagenPortadaAnterior(nombreArchivo) {
    if (!nombreArchivo) return;
    
    try {
        const rutaCompleta = path.join('uploads', 'portadas', nombreArchivo);
        await fs.unlink(rutaCompleta);
    } catch (error) {
        console.error('Error al eliminar imagen anterior:', error);
        // No lanzamos el error para que no afecte el flujo principal
    }
}

// Ruta modificada para enviar a revisión
router.post('/nuevapublicacionrevision', verificarToken, upload.single('imagen_portada'), async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { id: userId } = req.usuario;
        const { 
            id_publicacion,
            titulo, 
            resumen, 
            contenido, 
            referencias, 
            id_tipo 
        } = req.body;

        // Verificar existencia del borrador
        const [borrador] = await connection.query(
            'SELECT * FROM publicaciones WHERE id_publicacion = ? AND id_usuario = ? AND estado = "borrador"',
            [id_publicacion, userId]
        );

        if (borrador.length === 0) {
            return res.status(404).json({
                status: 'error',
                mensaje: 'No se encontró el borrador o no tienes permiso para modificarlo'
            });
        }

        // Validar campos obligatorios
        if (!titulo || !resumen || !contenido || !referencias || !id_tipo) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'Todos los campos son obligatorios'
            });
        }

        await connection.beginTransaction();

        let rutaImagenPortada = borrador[0].imagen_portada;
        if (req.file) {
            // Si hay nueva imagen, procesar y actualizar
            if (rutaImagenPortada) {
                await eliminarImagenPortadaAnterior(rutaImagenPortada);
            }
            rutaImagenPortada = await procesarImagenPortada(req.file);
        }

        if (!rutaImagenPortada) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'La imagen de portada es obligatoria'
            });
        }

        // Actualizar publicación a estado en_revision
        await connection.query(
            `UPDATE publicaciones SET 
                titulo = ?, resumen = ?, contenido = ?, referencias = ?,
                estado = 'en_revision', es_privada = 1, imagen_portada = ?,
                id_tipo = ?, fecha_creacion = NOW()
            WHERE id_publicacion = ?`,
            [titulo, resumen, contenido, referencias, rutaImagenPortada, id_tipo, id_publicacion]
        );

        await connection.commit();

        res.json({
            status: 'success',
            mensaje: 'Publicación enviada a revisión exitosamente',
            datos: {
                id_publicacion,
                imagen_portada: rutaImagenPortada
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al enviar a revisión:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al enviar la publicación a revisión'
        });
    } finally {
        connection.release();
    }
});

// Guardar o actualizar un borrador existente
router.post('/borrador', verificarToken, upload.single('imagen_portada'), async (req, res) => {
    try {
        const { id: userId } = req.usuario;
        const { id_publicacion, titulo, resumen, contenido, id_tipo, referencias = '' } = req.body;
        let nombreImagenPortada = null;

        // Verificar campos obligatorios
        if (!id_publicacion) {
            return res.status(400).json({ mensaje: 'El ID de la publicación es obligatorio para guardar o actualizar un borrador.' });
        }
        if (!id_tipo) {
            return res.status(400).json({ mensaje: 'El campo id_tipo es obligatorio.' });
        }

        // Procesar imagen si se proporcionó una
        if (req.file) {
            nombreImagenPortada = await procesarImagenPortada(req.file);
        }

        // Obtener el ID de publicación más alto
        const [ultimoIdPublicacion] = await pool.query(
            `SELECT id_publicacion FROM publicaciones ORDER BY id_publicacion DESC LIMIT 1`
        );

        // Comprobar si es un nuevo borrador
        if (id_publicacion > ultimoIdPublicacion[0]?.id_publicacion) {
            // Insertar nuevo borrador
            const [resultado] = await pool.query(
                `INSERT INTO publicaciones (id_publicacion, id_usuario, titulo, resumen, contenido, referencias, estado, imagen_portada, id_tipo, es_privada) 
                 VALUES (?, ?, ?, ?, ?, ?, 'borrador', ?, ?, 1)`,
                [id_publicacion, userId, titulo, resumen, contenido, referencias, nombreImagenPortada, id_tipo]
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
                    imagen_portada: nombreImagenPortada,
                    id_tipo
                }
            });
        } else {
            // Verificar borrador existente
            const [borradorExistente] = await pool.query(
                `SELECT id_publicacion, imagen_portada FROM publicaciones 
                 WHERE id_publicacion = ? AND id_usuario = ? AND estado = 'borrador' AND eliminado = 0`,
                [id_publicacion, userId]
            );

            if (borradorExistente.length > 0) {
                // Si hay nueva imagen, eliminar la anterior
                if (req.file && borradorExistente[0].imagen_portada) {
                    await eliminarImagenPortadaAnterior(borradorExistente[0].imagen_portada);
                }

                // Actualizar borrador existente
                await pool.query(
                    `UPDATE publicaciones 
                     SET titulo = ?, resumen = ?, contenido = ?, referencias = ?, 
                         imagen_portada = ?, id_tipo = ?
                     WHERE id_publicacion = ?`,
                    [titulo, resumen, contenido, referencias, 
                     nombreImagenPortada || borradorExistente[0].imagen_portada, 
                     id_tipo, id_publicacion]
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
                        imagen_portada: nombreImagenPortada || borradorExistente[0].imagen_portada,
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

        if (!id_tipo) {
            return res.status(400).json({ mensaje: 'El campo id_tipo es obligatorio.' });
        }

        // Verificar que la publicación exista y pertenezca al usuario
        const [publicacionExistente] = await pool.query(
            'SELECT id_usuario, imagen_portada FROM publicaciones WHERE id_publicacion = ?',
            [publicacionId]
        );

        if (publicacionExistente.length === 0) {
            return res.status(404).json({ mensaje: 'Publicación no encontrada' });
        }

        if (publicacionExistente[0].id_usuario !== userId) {
            return res.status(403).json({ mensaje: 'No tienes permiso para modificar esta publicación' });
        }

        let rutaImagenPortada = publicacionExistente[0].imagen_portada;
        if (req.file) {
            // Eliminar imagen anterior si existe
            await eliminarImagenPortadaAnterior(rutaImagenPortada);
            // Procesar y guardar nueva imagen
            rutaImagenPortada = await procesarImagenPortada(req.file);
        }

        // Actualizar la publicación
        await pool.query(
            `UPDATE publicaciones 
             SET titulo = ?, resumen = ?, contenido = ?, referencias = ?, 
                 estado = ?, es_privada = ?, imagen_portada = ?, id_tipo = ?
             WHERE id_publicacion = ?`,
            [titulo, resumen, contenido, referencias, estado, es_privada, 
             rutaImagenPortada, id_tipo, publicacionId]
        );

        res.json({ 
            mensaje: 'Publicación actualizada exitosamente',
            imagen_portada: rutaImagenPortada
        });
    } catch (error) {
        console.error('Error al actualizar la publicación:', error);
        res.status(500).json({ mensaje: 'Error al actualizar la publicación' });
    }
});

module.exports = router;
