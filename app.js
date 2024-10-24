const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { verificarConexion } = require('./config/database');
const authRoutes = require('./routes/auth.routes');
const publicacionesRoutes = require('./routes/publicaciones.routes');
const usuariosRoutes = require('./routes/usuarios.routes'); // Nueva línea
const pingRoutes = require('./routes/ping.routes');

const app = express();
// Configuración actualizada de CORS y Helmet
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
  
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
}));

// Middlewares
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Carpeta para archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/publicaciones', publicacionesRoutes);
app.use('/api/usuarios', usuariosRoutes); // Nueva línea
app.use('/api/ping', pingRoutes);


// Iniciar servidor solo si la base de datos está conectada
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