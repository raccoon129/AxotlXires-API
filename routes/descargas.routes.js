
//Invocar como
// /api/descargas/idPublicacion?visualizar=true para visualizar en el navegador
// /api/descargas/idPublicacion para descargar directamente

const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { pool } = require('../config/database');
const path = require('path');
const fs = require('fs');
const { htmlToText } = require('html-to-text');

// Configuración de tamaño carta en puntos
const PAGE_WIDTH = 612; // 8.5 inches * 72 points/inch
const PAGE_HEIGHT = 792; // 11 inches * 72 points/inch
const MARGIN = 72; // 1 inch margins

// Rutas absolutas a las fuentes
const FONTS_DIR = path.join(__dirname, '..', 'fonts', 'Crimson_Text');
const CRIMSON_REGULAR = path.join(FONTS_DIR, 'CrimsonText-Regular.ttf');
const CRIMSON_BOLD = path.join(FONTS_DIR, 'CrimsonText-Bold.ttf');
const CRIMSON_ITALIC = path.join(FONTS_DIR, 'CrimsonText-Italic.ttf');

// Verificar existencia de fuentes al iniciar
(() => {
    const fonts = [CRIMSON_REGULAR, CRIMSON_BOLD, CRIMSON_ITALIC];
    fonts.forEach(font => {
        if (!fs.existsSync(font)) {
            console.error(`Fuente no encontrada: ${font}`);
            throw new Error(`Fuente requerida no encontrada: ${path.basename(font)}`);
        }
    });
})();

// Función para procesar el contenido HTML de TipTap
function procesarContenidoTipTap(contenido) {
    return htmlToText(contenido, {
        wordwrap: 80,
        selectors: [
            // Encabezados
            { selector: 'h1', format: 'headerOne' },
            { selector: 'h2', format: 'headerTwo' },
            { selector: 'h3', format: 'headerThree' },
            { selector: 'h4', format: 'headerFour' },
            { selector: 'h5', format: 'headerFive' },
            { selector: 'h6', format: 'headerSix' },
            
            // Párrafos y texto básico
            { selector: 'p', format: 'paragraph' },
            { selector: 'strong', format: 'bold' },
            { selector: 'em', format: 'italic' },
            { selector: 'u', format: 'underline' },
            { selector: 'strike', format: 'strikethrough' },
            { selector: 'code', format: 'inlineCode' },
            
            // Listas
            { selector: 'ul', format: 'unorderedList' },
            { selector: 'ol', format: 'orderedList' },
            { selector: 'li', format: 'listItem' },
            { selector: 'task-list', format: 'taskList' },
            
            // Bloques especiales
            { selector: 'blockquote', format: 'blockquote' },
            { selector: 'pre', format: 'codeBlock' },
            { selector: 'hr', format: 'horizontalLine' },
            
            // Enlaces y referencias
            { selector: 'a', format: 'link' },
            
            // Tablas
            { selector: 'table', format: 'table' },
            { selector: 'tr', format: 'tableRow' },
            { selector: 'th', format: 'tableHeader' },
            { selector: 'td', format: 'tableCell' },
            
            // Elementos de texto avanzados
            { selector: 'sub', format: 'subscript' },
            { selector: 'sup', format: 'superscript' },
            { selector: 'mark', format: 'highlight' },
            
            // Elementos personalizados de TipTap
            { selector: '.indent', format: 'indent' },
            { selector: '.text-align-left', format: 'alignLeft' },
            { selector: '.text-align-center', format: 'alignCenter' },
            { selector: '.text-align-right', format: 'alignRight' },
            { selector: '.text-align-justify', format: 'alignJustify' }
        ],
        formatters: {
            // Formateadores personalizados para elementos especiales
            'bold': function(elem, walk, builder, formatOptions) {
                builder.openBlock('**');
                walk(elem.children, builder);
                builder.closeBlock('**');
            },
            'italic': function(elem, walk, builder, formatOptions) {
                builder.openBlock('_');
                walk(elem.children, builder);
                builder.closeBlock('_');
            },
            'underline': function(elem, walk, builder, formatOptions) {
                builder.openBlock('__');
                walk(elem.children, builder);
                builder.closeBlock('__');
            },
            'strikethrough': function(elem, walk, builder, formatOptions) {
                builder.openBlock('~~');
                walk(elem.children, builder);
                builder.closeBlock('~~');
            },
            'inlineCode': function(elem, walk, builder, formatOptions) {
                builder.openBlock('`');
                walk(elem.children, builder);
                builder.closeBlock('`');
            },
            'horizontalLine': function(elem, walk, builder, formatOptions) {
                builder.addInline('\n---\n');
            },
            'highlight': function(elem, walk, builder, formatOptions) {
                builder.openBlock('==');
                walk(elem.children, builder);
                builder.closeBlock('==');
            }
        },
        whitespaceCharacters: ' \t\r\n\f\u200b\u200c\u200d',
        preserveNewlines: true,
        singleNewLineParagraphs: true,
        baseElements: {
            selectors: ['p', 'div', 'li', 'td', 'th', 'blockquote']
        }
    });
}

// Función para configurar el documento PDF
function configurarDocumento(doc) {
    // Registrar fuentes con rutas absolutas
    doc.registerFont('Crimson', CRIMSON_REGULAR);
    doc.registerFont('Crimson-Bold', CRIMSON_BOLD);
    doc.registerFont('Crimson-Italic', CRIMSON_ITALIC);

    // Configurar márgenes y tamaño
    doc.page.margins = {
        top: MARGIN,
        bottom: MARGIN,
        left: MARGIN,
        right: MARGIN
    };
}

// Función para crear la portada
async function crearPortada(doc, publicacion) {
    try {
        // Agregar imagen de portada
        if (publicacion.imagen_portada) {
            const rutaImagen = path.join(__dirname, '..', 'uploads', 'portadas', publicacion.imagen_portada);
            if (fs.existsSync(rutaImagen)) {
                // Ajustar la imagen para que abarque toda la página
                doc.image(rutaImagen, 0, 0, {
                    width: PAGE_WIDTH,
                    height: PAGE_HEIGHT,
                    align: 'center',
                    valign: 'center'
                });
            }
        }

        // Agregar logo en la esquina inferior derecha
        const rutaLogo = path.join(__dirname, '..', 'assets', 'img', 'LogoHorizontalMargenes.png');
        if (fs.existsSync(rutaLogo)) {
            // Dimensiones para el logo
            const logoWidth = 250; // Ancho deseado del logo
            const logoHeight = 100; // Alto deseado del logo
            
            // Posición del logo (esquina inferior derecha con margen)
            const logoX = PAGE_WIDTH  - logoWidth - 30; // Posición X
            const logoY = PAGE_HEIGHT - logoHeight; // Posición Y

            // Agregar el logo con fondo blanco semitransparente para mejor visibilidad
            doc.save()
               .rect(logoX - 5, logoY - 5, logoWidth + 10, logoHeight + 10)
               .fill('white', 0.7) // Color blanco con 70% de opacidad
               .image(rutaLogo, logoX, logoY, {
                   fit: [logoWidth, logoHeight],
                   align: 'right',
                   valign: 'bottom'
               })
               .restore();
        } else {
            console.warn('Logo no encontrado:', rutaLogo);
        }
        
        doc.addPage();
    } catch (error) {
        console.error('Error al crear portada:', error);
        throw error;
    }
}

// Función para agregar la página de información (segunda página)
function agregarPaginaInformacion(doc, publicacion) {
    // Centrar el contenido verticalmente
    const yPos = (PAGE_HEIGHT - MARGIN * 2) / 2;
    
    // Agregar título centrado con fuente en negrita y tamaño grande
    doc.font('Crimson-Bold')
       .fontSize(24)
       .text(publicacion.titulo, {
           align: 'center',
           continued: false
       })
       .moveDown(2);

    // Agregar metadatos de la publicación
    doc.font('Crimson')
       .fontSize(14)
       .text(`Autor: ${publicacion.autor}`, {
           align: 'center'
       })
       .moveDown()
       .text(`Fecha de publicación: ${new Date(publicacion.fecha_publicacion).toLocaleDateString()}`, {
           align: 'center'
       })
       .moveDown()
       .text(`Tipo de publicación: ${publicacion.tipo_publicacion}`, {
           align: 'center'
       });

    doc.addPage();
}

// Nueva función para agregar el resumen (tercera página)
function agregarResumen(doc, resumen) {
    // Título de la sección
    doc.font('Crimson-Bold')
       .fontSize(16)
       .text('Resumen', {
           align: 'center'
       })
       .moveDown(2);

    // Agregar el resumen con sangría y justificado
    doc.font('Crimson')
       .fontSize(12)
       .text(resumen, {
           align: 'justify',
           indent: 20,
           width: PAGE_WIDTH - (MARGIN * 3)
       })
       .moveDown(2);

    doc.addPage();
}

// Función para agregar el contenido
function agregarContenido(doc, contenido) {
    const textoFormateado = procesarContenidoTipTap(contenido);
    
    doc.font('Crimson')
       .fontSize(12)
       .text(textoFormateado, {
           align: 'justify',
           continued: true
       });
}

// Función para agregar referencias
function agregarReferencias(doc, referencias) {
    doc.addPage()
       .font('Crimson-Bold')
       .fontSize(16)
       .text('Referencias', {
           align: 'center',
           continued: false
       })
       .moveDown();

    doc.font('Crimson')
       .fontSize(12)
       .text(referencias, {
           align: 'left'
       });
}

// Ruta para generar y descargar/visualizar PDF
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const visualizar = req.query.visualizar === 'true';

        // Obtener datos de la publicación
        const [publicaciones] = await pool.query(
            `SELECT 
                p.*, 
                u.nombre as autor,
                tp.nombre as tipo_publicacion
            FROM publicaciones p
            JOIN usuarios u ON p.id_usuario = u.id_usuario
            JOIN tipos_publicacion tp ON p.id_tipo = tp.id_tipo
            WHERE p.id_publicacion = ? 
            AND p.eliminado = 0 
            AND p.es_privada = 0 
            AND p.estado = 'publicado'`,
            [id]
        );

        if (publicaciones.length === 0) {
            return res.status(404).json({
                status: 'error',
                mensaje: 'Publicación no encontrada o no disponible'
            });
        }

        const publicacion = publicaciones[0];

        // Generar nombre de archivo seguro
        const nombreArchivo = publicacion.titulo
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 50); // Limitar longitud

        // Crear documento PDF
        const doc = new PDFDocument({
            size: 'letter',
            bufferPages: true
        });

        // Configurar headers para la respuesta
        res.setHeader('Content-Type', 'application/pdf');
        if (!visualizar) {
            // Si es descarga, usar el título como nombre del archivo
            res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}.pdf`);
        }

        // Pipe el PDF directamente a la respuesta
        doc.pipe(res);

        // Configurar documento con fuentes y márgenes
        configurarDocumento(doc);

        // 1. Primera página: Portada con imagen
        await crearPortada(doc, publicacion);

        // 2. Segunda página: Información básica centrada
        agregarPaginaInformacion(doc, publicacion);

        // 3. Tercera página: Resumen
        agregarResumen(doc, publicacion.resumen);

        // 4. Páginas siguientes: Contenido principal
        agregarContenido(doc, publicacion.contenido);

        // 5. Última página: Referencias bibliográficas
        if (publicacion.referencias) {
            agregarReferencias(doc, publicacion.referencias);
        }

        // Finalizar y enviar el documento
        doc.end();

    } catch (error) {
        console.error('Error al generar PDF:', error);
        res.status(500).json({
            status: 'error',
            mensaje: 'Error al generar el PDF'
        });
    }
});

module.exports = router;
