// middleware/multer.js
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Crear directorio si no existe
const uploadDir = path.join('uploads', 'portadas');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Guardar directamente en uploads/portadas/
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generar nombre único para el archivo
    cb(null, 'portada_' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB límite
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = /jpeg|jpg|png|gif/;
    const extname = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
    const mimetype = tiposPermitidos.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten imágenes'));
  }
});

module.exports = upload;