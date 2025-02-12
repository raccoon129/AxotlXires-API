const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const { verificarToken } = require('../../middleware/auth');

// Middleware para verificar roles administrativos
const verificarRolAdmin = (roles = []) => {
    return async (req, res, next) => {
        try {
            const [usuario] = await pool.query(
                'SELECT rol FROM usuarios WHERE id_usuario = ?',
                [req.usuario.id]
            );

            if (!usuario.length || !roles.includes(usuario[0].rol)) {
                return res.status(403).json({
                    status: 'error',
                    mensaje: 'No tienes los permisos necesarios'
                });
            }
            next();
        } catch (error) {
            res.status(500).json({
                status: 'error',
                mensaje: 'Error al verificar permisos'
            });
        }
    };
};

// Obtener estadísticas generales
router.get('/dashboard', verificarToken, verificarRolAdmin(['moderador', 'administrador']), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        // Estadísticas de usuarios
        const [usuariosStats] = await connection.query(`
            SELECT 
                COUNT(*) as total_usuarios,
                COUNT(CASE WHEN rol = 'usuario' THEN 1 END) as usuarios_regulares,
                COUNT(CASE WHEN rol = 'moderador' THEN 1 END) as moderadores,
                COUNT(CASE WHEN rol = 'administrador' THEN 1 END) as administradores,
                COUNT(CASE WHEN DATE(fecha_creacion) = CURDATE() THEN 1 END) as nuevos_hoy
            FROM usuarios
        `);

        // Estadísticas de publicaciones
        const [publicacionesStats] = await connection.query(`
            SELECT 
                COUNT(*) as total_publicaciones,
                COUNT(CASE WHEN estado = 'publicado' THEN 1 END) as publicadas,
                COUNT(CASE WHEN estado = 'en_revision' THEN 1 END) as en_revision,
                COUNT(CASE WHEN estado = 'rechazado' THEN 1 END) as rechazadas,
                COUNT(CASE WHEN DATE(fecha_creacion) = CURDATE() THEN 1 END) as creadas_hoy
            FROM publicaciones
            WHERE eliminado = 0
        `);

        // Estadísticas de interacción
        const [interaccionStats] = await connection.query(`
            SELECT 
                (SELECT COUNT(*) FROM comentarios) as total_comentarios,
                (SELECT COUNT(*) FROM favoritos) as total_favoritos,
                (SELECT COUNT(*) FROM bitacora_estudio) as total_notas_estudio
            FROM dual
        `);

        // Estadísticas de revisiones
        const [revisionesStats] = await connection.query(`
            SELECT 
                COUNT(*) as total_revisiones,
                COUNT(CASE WHEN aprobado = 1 THEN 1 END) as aprobadas,
                COUNT(CASE WHEN aprobado = 0 THEN 1 END) as rechazadas
            FROM revisiones
        `);

        res.json({
            status: 'success',
            datos: {
                usuarios: usuariosStats[0],
                publicaciones: publicacionesStats[0],
                interacciones: interaccionStats[0],
                revisiones: revisionesStats[0]
            }
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener estadísticas'
        });
    } finally {
        connection.release();
    }
});

// Obtener tendencias y análisis detallado
router.get('/tendencias', verificarToken, verificarRolAdmin(['moderador', 'administrador']), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        // Publicaciones más populares
        const [publicacionesPopulares] = await connection.query(`
            SELECT 
                p.id_publicacion,
                p.titulo,
                u.nombre as autor,
                COUNT(DISTINCT f.id_favorito) as total_favoritos,
                COUNT(DISTINCT c.id_comentario) as total_comentarios,
                p.fecha_publicacion
            FROM publicaciones p
            LEFT JOIN favoritos f ON p.id_publicacion = f.id_publicacion
            LEFT JOIN comentarios c ON p.id_publicacion = c.id_publicacion
            JOIN usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.estado = 'publicado' AND p.eliminado = 0
            GROUP BY p.id_publicacion
            ORDER BY total_favoritos DESC, total_comentarios DESC
            LIMIT 10
        `);

        // Usuarios más activos
        const [usuariosActivos] = await connection.query(`
            SELECT 
                u.id_usuario,
                u.nombre,
                COUNT(DISTINCT p.id_publicacion) as total_publicaciones,
                COUNT(DISTINCT c.id_comentario) as total_comentarios,
                COUNT(DISTINCT f.id_favorito) as total_favoritos
            FROM usuarios u
            LEFT JOIN publicaciones p ON u.id_usuario = p.id_usuario
            LEFT JOIN comentarios c ON u.id_usuario = c.id_usuario
            LEFT JOIN favoritos f ON u.id_usuario = f.id_usuario
            GROUP BY u.id_usuario
            ORDER BY total_publicaciones DESC, total_comentarios DESC
            LIMIT 10
        `);

        // Tipos de publicación más populares
        const [tiposPopulares] = await connection.query(`
            SELECT 
                tp.nombre,
                COUNT(p.id_publicacion) as total_publicaciones,
                COUNT(DISTINCT f.id_favorito) as total_favoritos
            FROM tipos_publicacion tp
            LEFT JOIN publicaciones p ON tp.id_tipo = p.id_tipo
            LEFT JOIN favoritos f ON p.id_publicacion = f.id_publicacion
            GROUP BY tp.id_tipo
            ORDER BY total_publicaciones DESC
        `);

        res.json({
            status: 'success',
            datos: {
                publicaciones_populares: publicacionesPopulares,
                usuarios_activos: usuariosActivos,
                tipos_populares: tiposPopulares
            }
        });

    } catch (error) {
        console.error('Error al obtener tendencias:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener tendencias'
        });
    } finally {
        connection.release();
    }
});

// Obtener reportes de actividad
router.get('/actividad/:periodo', verificarToken, verificarRolAdmin(['administrador']), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { periodo } = req.params; // 'diario', 'semanal', 'mensual'
        let intervalo;
        
        switch(periodo) {
            case 'diario':
                intervalo = 'DAY';
                break;
            case 'semanal':
                intervalo = 'WEEK';
                break;
            case 'mensual':
                intervalo = 'MONTH';
                break;
            default:
                throw new Error('Periodo no válido');
        }

        // Actividad de publicaciones
        const [actividadPublicaciones] = await connection.query(`
            SELECT 
                DATE(fecha_creacion) as fecha,
                COUNT(*) as total_publicaciones,
                COUNT(CASE WHEN estado = 'publicado' THEN 1 END) as publicadas,
                COUNT(CASE WHEN estado = 'en_revision' THEN 1 END) as en_revision
            FROM publicaciones
            WHERE fecha_creacion >= DATE_SUB(NOW(), INTERVAL 1 ${intervalo})
            GROUP BY DATE(fecha_creacion)
            ORDER BY fecha
        `);

        // Actividad de usuarios
        const [actividadUsuarios] = await connection.query(`
            SELECT 
                DATE(fecha_creacion) as fecha,
                COUNT(*) as nuevos_usuarios,
                COUNT(DISTINCT ultimo_acceso) as usuarios_activos
            FROM usuarios
            WHERE fecha_creacion >= DATE_SUB(NOW(), INTERVAL 1 ${intervalo})
            GROUP BY DATE(fecha_creacion)
            ORDER BY fecha
        `);

        res.json({
            status: 'success',
            datos: {
                actividad_publicaciones: actividadPublicaciones,
                actividad_usuarios: actividadUsuarios
            }
        });

    } catch (error) {
        console.error('Error al obtener reporte de actividad:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al obtener reporte de actividad'
        });
    } finally {
        connection.release();
    }
});

module.exports = router; 