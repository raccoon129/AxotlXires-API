const { pool } = require('../config/database');

/**
 * Servicio para la gestión de notificaciones en el sistema AxotlXires
 * Este servicio centraliza la lógica de creación y gestión de notificaciones
 * para evitar duplicación de código y facilitar su mantenimiento.
 */
class NotificacionesService {
    /**
     * Crea una nueva notificación en el sistema
     * 
     * @param {Object} datosNotificacion - Datos de la notificación a crear
     * @param {number} datosNotificacion.idUsuarioReceptor - ID del usuario que recibirá la notificación
     * @param {number} datosNotificacion.idOrigen - ID del usuario que generó la acción (opcional)
     * @param {string} datosNotificacion.tipo - Tipo de notificación (comentario, favorito, revision, comentario_revision)
     * @param {number} datosNotificacion.idReferencia - ID del elemento relacionado (publicación, comentario, etc.)
     * @param {string} datosNotificacion.tipoReferencia - Tipo de la referencia (publicacion, comentario, revision)
     * @param {string} datosNotificacion.contenido - Mensaje descriptivo de la notificación
     * @param {boolean} datosNotificacion.notificarCorreo - Indica si debe notificarse por correo (default: true)
     * @returns {Promise<Object>} - Resultado de la operación
     */
    static async crearNotificacion({
        idUsuarioReceptor,
        idOrigen = null,
        tipo,
        idReferencia,
        tipoReferencia,
        contenido,
        notificarCorreo = true
    }) {
        try {
            // No crear notificaciones si el usuario origen es el mismo que el receptor
            if (idOrigen === idUsuarioReceptor) {
                console.log('No se crea notificación: el usuario origen es el mismo que el receptor');
                return { success: true, created: false };
            }

            // Verificar que el usuario receptor existe
            const [usuarioReceptor] = await pool.query(
                'SELECT id_usuario FROM usuarios WHERE id_usuario = ?',
                [idUsuarioReceptor]
            );

            if (usuarioReceptor.length === 0) {
                return { 
                    success: false, 
                    error: 'El usuario receptor no existe'
                };
            }

            const [resultado] = await pool.query(
                `INSERT INTO notificaciones 
                    (id_usuario, id_origen, tipo, id_referencia, tipo_referencia, contenido, notificar_correo) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [idUsuarioReceptor, idOrigen, tipo, idReferencia, tipoReferencia, contenido, notificarCorreo]
            );

            console.log(`Notificación creada: ${tipo} para usuario ${idUsuarioReceptor}`);

            // Aquí se podría integrar el envío de correos electrónicos
            if (notificarCorreo) {
                // TODO: Implementar envío de correo (fuera del alcance actual)
                console.log(`Se debería enviar correo al usuario ${idUsuarioReceptor}`);
            }

            return {
                success: true,
                created: true,
                id: resultado.insertId
            };
        } catch (error) {
            console.error('Error al crear notificación:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Crea una notificación de nuevo comentario
     * 
     * @param {number} idPublicacion - ID de la publicación comentada
     * @param {number} idComentario - ID del comentario creado
     * @param {number} idAutorComentario - ID del usuario que comentó
     */
    static async notificarNuevoComentario(idPublicacion, idComentario, idAutorComentario) {
        try {
            // 1. Obtener información de la publicación y su autor
            const [publicacion] = await pool.query(
                `SELECT p.id_usuario, p.titulo, u.nombre AS nombreAutor
                 FROM publicaciones p
                 JOIN usuarios u ON p.id_usuario = u.id_usuario
                 WHERE p.id_publicacion = ?`,
                [idPublicacion]
            );

            if (publicacion.length === 0) {
                return { success: false, error: 'Publicación no encontrada' };
            }

            // 2. Obtener nombre del autor del comentario
            const [autorComentario] = await pool.query(
                'SELECT nombre FROM usuarios WHERE id_usuario = ?',
                [idAutorComentario]
            );

            // 3. Crear la notificación para el autor de la publicación
            const contenido = `${autorComentario[0].nombre} ha comentado en tu publicación "${publicacion[0].titulo}"`;
            
            return await this.crearNotificacion({
                idUsuarioReceptor: publicacion[0].id_usuario,
                idOrigen: idAutorComentario,
                tipo: 'comentario',
                idReferencia: idPublicacion,
                tipoReferencia: 'publicacion',
                contenido
            });
        } catch (error) {
            console.error('Error al notificar nuevo comentario:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Crea una notificación de publicación marcada como favorita
     * 
     * @param {number} idPublicacion - ID de la publicación marcada como favorita
     * @param {number} idUsuarioFavorito - ID del usuario que marcó la publicación como favorita
     */
    static async notificarNuevoFavorito(idPublicacion, idUsuarioFavorito) {
        try {
            // 1. Obtener información de la publicación y su autor
            const [publicacion] = await pool.query(
                `SELECT p.id_usuario, p.titulo, u.nombre AS nombreAutor
                 FROM publicaciones p
                 JOIN usuarios u ON p.id_usuario = u.id_usuario
                 WHERE p.id_publicacion = ?`,
                [idPublicacion]
            );

            if (publicacion.length === 0) {
                return { success: false, error: 'Publicación no encontrada' };
            }

            // 2. Obtener nombre del usuario que marcó como favorito
            const [usuarioFavorito] = await pool.query(
                'SELECT nombre FROM usuarios WHERE id_usuario = ?',
                [idUsuarioFavorito]
            );

            // 3. Crear la notificación para el autor de la publicación
            const contenido = `${usuarioFavorito[0].nombre} ha marcado como favorito tu publicación "${publicacion[0].titulo}"`;
            
            return await this.crearNotificacion({
                idUsuarioReceptor: publicacion[0].id_usuario,
                idOrigen: idUsuarioFavorito,
                tipo: 'favorito',
                idReferencia: idPublicacion,
                tipoReferencia: 'publicacion',
                contenido
            });
        } catch (error) {
            console.error('Error al notificar nuevo favorito:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Crea una notificación de nueva revisión de publicación
     * 
     * @param {number} idPublicacion - ID de la publicación revisada
     * @param {number} idRevision - ID de la revisión creada
     * @param {number} idRevisor - ID del usuario revisor
     * @param {boolean} aprobada - Indica si la revisión fue aprobada o rechazada
     */
    static async notificarNuevaRevision(idPublicacion, idRevision, idRevisor, aprobada) {
        try {
            // 1. Obtener información de la publicación y su autor
            const [publicacion] = await pool.query(
                `SELECT p.id_usuario, p.titulo, u.nombre AS nombreAutor
                 FROM publicaciones p
                 JOIN usuarios u ON p.id_usuario = u.id_usuario
                 WHERE p.id_publicacion = ?`,
                [idPublicacion]
            );

            if (publicacion.length === 0) {
                return { success: false, error: 'Publicación no encontrada' };
            }

            // 2. Obtener nombre del revisor
            const [revisor] = await pool.query(
                'SELECT nombre FROM usuarios WHERE id_usuario = ?',
                [idRevisor]
            );

            // 3. Crear la notificación para el autor de la publicación
            const contenido = aprobada 
                ? `Tu publicación "${publicacion[0].titulo}" ha sido aprobada por ${revisor[0].nombre}`
                : `Tu publicación "${publicacion[0].titulo}" ha sido rechazada por ${revisor[0].nombre}`;
            
            return await this.crearNotificacion({
                idUsuarioReceptor: publicacion[0].id_usuario,
                idOrigen: idRevisor,
                tipo: 'revision',
                idReferencia: idPublicacion,
                tipoReferencia: 'publicacion',
                contenido
            });
        } catch (error) {
            console.error('Error al notificar nueva revisión:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Marca una notificación como leída
     * 
     * @param {number} idNotificacion - ID de la notificación a marcar
     * @param {number} idUsuario - ID del usuario propietario de la notificación
     * @returns {Promise<Object>} Resultado de la operación
     */
    static async marcarComoLeida(idNotificacion, idUsuario) {
        try {
            const [resultado] = await pool.query(
                'UPDATE notificaciones SET leida = 1 WHERE id_notificacion = ? AND id_usuario = ?',
                [idNotificacion, idUsuario]
            );

            if (resultado.affectedRows === 0) {
                return {
                    success: false,
                    error: 'Notificación no encontrada o sin permisos'
                };
            }

            return {
                success: true,
                mensaje: 'Notificación marcada como leída'
            };
        } catch (error) {
            console.error('Error al marcar notificación como leída:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Marca todas las notificaciones de un usuario como leídas
     * 
     * @param {number} idUsuario - ID del usuario
     * @returns {Promise<Object>} Resultado de la operación
     */
    static async marcarTodasComoLeidas(idUsuario) {
        try {
            const [resultado] = await pool.query(
                'UPDATE notificaciones SET leida = 1 WHERE id_usuario = ? AND leida = 0',
                [idUsuario]
            );

            return {
                success: true,
                cantidad: resultado.affectedRows,
                mensaje: `${resultado.affectedRows} notificaciones marcadas como leídas`
            };
        } catch (error) {
            console.error('Error al marcar todas las notificaciones como leídas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = NotificacionesService;