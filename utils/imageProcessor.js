const path = require('path');
const fs = require('fs').promises;

class ImageProcessor {
    static async procesarImagenPortada(file, idUsuario, idPublicacion) {
        try {
            // Crear estructura de directorios
            const directorioBase = path.join(__dirname, '..', 'uploads');
            const directorioPortadas = path.join(directorioBase, 'portada');
            const directorioUsuario = path.join(directorioPortadas, idUsuario.toString());

            // Crear directorios si no existen
            await fs.mkdir(directorioBase, { recursive: true });
            await fs.mkdir(directorioPortadas, { recursive: true });
            await fs.mkdir(directorioUsuario, { recursive: true });

            // Construir nombre y ruta del archivo
            const nombreArchivo = `portada_${idPublicacion}${path.extname(file.originalname)}`;
            const rutaDestino = path.join(directorioUsuario, nombreArchivo);

            // Mover archivo de temp a destino final
            await fs.rename(file.path, rutaDestino);

            // Devolver ruta relativa para la base de datos
            return path.join('portada', idUsuario.toString(), nombreArchivo);
        } catch (error) {
            console.error('Error al procesar imagen:', error);
            // Limpiar archivo temporal en caso de error
            try {
                await fs.unlink(file.path);
            } catch (unlinkError) {
                console.error('Error al eliminar archivo temporal:', unlinkError);
            }
            throw new Error('Error al procesar la imagen de portada');
        }
    }

    static async eliminarImagenPortada(rutaImagen) {
        if (!rutaImagen) return;

        try {
            const rutaCompleta = path.join(__dirname, '..', 'uploads', rutaImagen);
            await fs.unlink(rutaCompleta);
        } catch (error) {
            console.error('Error al eliminar imagen:', error);
            // No lanzamos el error para que no afecte el flujo principal
        }
    }

    static async limpiarDirectorioTemp() {
        try {
            const dirTemp = path.join(__dirname, '..', 'uploads', 'temp');
            const archivos = await fs.readdir(dirTemp);
            
            for (const archivo of archivos) {
                const rutaArchivo = path.join(dirTemp, archivo);
                const stats = await fs.stat(rutaArchivo);
                
                // Eliminar archivos temporales más antiguos de 1 hora
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                    await fs.unlink(rutaArchivo);
                }
            }
        } catch (error) {
            console.error('Error al limpiar directorio temporal:', error);
        }
    }
}

module.exports = ImageProcessor; 