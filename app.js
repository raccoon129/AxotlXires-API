const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { verificarConexion } = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const publicacionesRoutes = require('./routes/publicaciones.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const pingRoutes = require('./routes/ping.routes');
const editorPublicacionesRoutes = require('./routes/editor.publicaciones.routes');
const comentariosRoutes = require('./routes/comentarios.routes');
const favoritosRoutes = require('./routes/favoritos.publicaciones.routes');
const descargasRoutes = require('./routes/descargas.routes');
const busquedaPublicacionesRoutes = require('./routes/busqueda.publicaciones.routes');
const registroRoutes = require('./routes/registro.routes');
const authManagementRoutes = require('./routes/management/auth.management.routes');
const usuariosManagementRoutes = require('./routes/management/usuarios.management.routes');
const publicacionesManagementRoutes = require('./routes/management/publicaciones.management.routes');
const analyticsManagementRoutes = require('./routes/management/analytics.management.routes');
const detallesUsuarioRoutes = require('./routes/detalles.usuario.routes'); // Nueva importación
const imagenesEditorPublicacionesRoutes = require('./routes/imagenes.editor.publicaciones.routes');
const notificacionesRoutes = require('./routes/notificaciones.routes');

const app = express();

// Configuración de carpetas estáticas
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/assets/default', express.static(path.join(__dirname, 'assets', 'default')));
app.use('/uploads/portadas', express.static(path.join(__dirname, 'uploads', 'portadas')));
app.use('/uploads/perfil', express.static(path.join(__dirname, 'uploads', 'perfil'))); // Nueva ruta para fotos de perfil
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use('/assets/img', express.static(path.join(__dirname, 'assets', 'img')));
// Configuración actualizada de CORS y Helmet
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "font-src": ["'self'", "fonts/", "data:"],
        },
    }
}));
  
app.use(cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000', process.env.MANAGEMENT_URL || 'http://localhost:3003', 'http://localhost:3002'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
}));

// Middlewares
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/auth/registro', registroRoutes);
app.use('/api/publicaciones', publicacionesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/usuarios/detalles', detallesUsuarioRoutes); // Nueva ruta
app.use('/api/ping', pingRoutes);
app.use('/api/favoritos', favoritosRoutes);
app.use('/api/editor/publicaciones', editorPublicacionesRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api/descargas', descargasRoutes);
app.use('/api/busqueda', busquedaPublicacionesRoutes);
app.use('/api/management/auth', authManagementRoutes);
app.use('/api/management/usuarios', usuariosManagementRoutes);
app.use('/api/management/publicaciones', publicacionesManagementRoutes);
app.use('/api/management/analytics', analyticsManagementRoutes);
app.use('/api/editor/publicaciones/imagenes', imagenesEditorPublicacionesRoutes);
app.use('/api/notificaciones', notificacionesRoutes); // Nueva ruta

// Agregar nueva ruta estática para las imágenes de publicaciones
app.use('/uploads/publicaciones', express.static(path.join(__dirname, 'uploads', 'publicaciones')));

// Iniciar servidor
const iniciarServidor = async () => {
    if (await verificarConexion()) {
        const PORT = process.env.PORT || 3001;
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en puerto ${PORT}`);
        });
    } else {
        console.error('No se pudo iniciar el servidor debido a errores en la conexión con la base de datos');
        process.exit(1);
    }
};

iniciarServidor();