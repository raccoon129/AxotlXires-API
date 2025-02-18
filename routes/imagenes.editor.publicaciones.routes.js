const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { pool } = require('../config/database');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// Función auxiliar para procesar imagen
async function procesarImagenPublicacion(file) {
    try {
        if (!file || !file.buffer) {
            throw new Error('No se proporcionó un archivo válido');
        }

        const filename = `publicacion-${uuidv4()}${path.extname(file.originalname)}`;
        const uploadDir = path.join(__dirname, '..', 'uploads', 'publicaciones');
        
        // Asegurar que el directorio existe
        await fs.mkdir(uploadDir, { recursive: true });
        
        const outputPath = path.join(uploadDir, filename);
        
        // Procesar y optimizar la imagen
        await sharp(file.buffer)
            .resize(1200, 1200, { // Tamaño máximo manteniendo proporción
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toFile(outputPath);

        return filename;
    } catch (error) {
        console.error('Error al procesar imagen de publicación:', error);
        throw error;
    }
}

// Subir una nueva imagen para una publicación
router.post('/upload/:id_publicacion', verificarToken, upload.single('imagen'), async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { id_publicacion } = req.params;
        const { descripcion = '' } = req.body;
        const { id: userId } = req.usuario;

        // Verificar que la publicación existe y pertenece al usuario
        const [publicacion] = await connection.query(
            'SELECT id_usuario FROM publicaciones WHERE id_publicacion = ? AND eliminado = 0',
            [id_publicacion]
        );

        if (publicacion.length === 0) {
            return res.status(404).json({
                status: 'error',
                mensaje: 'Publicación no encontrada'
            });
        }

        if (publicacion[0].id_usuario !== userId) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para modificar esta publicación'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                mensaje: 'No se proporcionó ninguna imagen'
            });
        }

        await connection.beginTransaction();

        // Procesar y guardar la imagen
        const filename = await procesarImagenPublicacion(req.file);

        // Obtener el siguiente orden disponible
        const [ultimoOrden] = await connection.query(
            'SELECT MAX(orden) as ultimo_orden FROM multimedia_publicacion WHERE id_publicacion = ?',
            [id_publicacion]
        );
        const orden = (ultimoOrden[0].ultimo_orden || 0) + 1;

        // Insertar registro en la base de datos
        const [resultado] = await connection.query(
            'INSERT INTO multimedia_publicacion (id_publicacion, url, descripcion, orden) VALUES (?, ?, ?, ?)',
            [id_publicacion, filename, descripcion, orden]
        );

        await connection.commit();

        res.json({
            status: 'success',
            mensaje: 'Imagen subida exitosamente',
            datos: {
                id_imagen: resultado.insertId,
                url: filename,
                descripcion,
                orden
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al subir imagen:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al subir la imagen'
        });
    } finally {
        connection.release();
    }
});

// Obtener imagen de publicación
router.get('/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const imagePath = path.join(__dirname, '..', 'uploads', 'publicaciones', filename);

        try {
            await fs.access(imagePath);
            res.sendFile(imagePath);
        } catch (error) {
            res.status(404).json({
                status: 'error',
                mensaje: 'Imagen no encontrada'
            });
        }
    } catch (error) {
        console.error('Error al obtener imagen:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener la imagen'
        });
    }
});

// Eliminar imagen de publicación
router.delete('/:id_publicacion/:id_imagen', verificarToken, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { id_publicacion, id_imagen } = req.params;
        const { id: userId } = req.usuario;

        // Verificar permisos
        const [publicacion] = await connection.query(
            'SELECT p.id_usuario, m.url FROM publicaciones p ' +
            'JOIN multimedia_publicacion m ON p.id_publicacion = m.id_publicacion ' +
            'WHERE p.id_publicacion = ? AND m.id_imagen = ? AND p.eliminado = 0',
            [id_publicacion, id_imagen]
        );

        if (publicacion.length === 0) {
            return res.status(404).json({
                status: 'error',
                mensaje: 'Imagen no encontrada'
            });
        }

        if (publicacion[0].id_usuario !== userId) {
            return res.status(403).json({
                status: 'error',
                mensaje: 'No tienes permiso para eliminar esta imagen'
            });
        }

        await connection.beginTransaction();

        // Eliminar el archivo físico
        const imagePath = path.join(__dirname, '..', 'uploads', 'publicaciones', publicacion[0].url);
        try {
            await fs.unlink(imagePath);
        } catch (error) {
            console.error('Error al eliminar archivo físico:', error);
        }

        // Eliminar registro de la base de datos
        await connection.query(
            'DELETE FROM multimedia_publicacion WHERE id_imagen = ?',
            [id_imagen]
        );

        await connection.commit();

        res.json({
            status: 'success',
            mensaje: 'Imagen eliminada exitosamente'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al eliminar imagen:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al eliminar la imagen'
        });
    } finally {
        connection.release();
    }
});

// Obtener todas las imágenes de una publicación
router.get('/publicacion/:id_publicacion', async (req, res) => {
    try {
        const { id_publicacion } = req.params;
        
        const [imagenes] = await pool.query(
            `SELECT 
                id_imagen,
                url,
                descripcion,
                orden
            FROM multimedia_publicacion
            WHERE id_publicacion = ?
            ORDER BY orden ASC`,
            [id_publicacion]
        );

        if (imagenes.length === 0) {
            return res.json({
                status: 'success',
                mensaje: 'La publicación no tiene imágenes',
                datos: []
            });
        }

        res.json({
            status: 'success',
            mensaje: 'Imágenes recuperadas exitosamente',
            datos: imagenes
        });

    } catch (error) {
        console.error('Error al obtener imágenes:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener las imágenes de la publicación'
        });
    }
});

module.exports = router;