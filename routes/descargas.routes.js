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

// Colores y estilos
const PURPLE_COLOR = '#612c7d';
const GRAY_COLOR = '#666666';
const FOOTER_HEIGHT = 40;
const LOGO_SIZE = { width: 120, height: 48 };

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

// Función para agregar elementos comunes en cada página
function agregarElementosComunesPagina(doc) {
    // Agregar logo en esquina superior derecha
    const rutaLogo = path.join(__dirname, '..', 'assets', 'img', 'LogoHorizontalMargenes.png');
    if (fs.existsSync(rutaLogo)) {
        doc.image(rutaLogo, 
            PAGE_WIDTH - MARGIN - LOGO_SIZE.width, 
            MARGIN/2, 
            { 
                width: LOGO_SIZE.width,
                height: LOGO_SIZE.height,
                fit: [LOGO_SIZE.width, LOGO_SIZE.height],
                align: 'right',
                valign: 'top'
            }
        );
    }

    // Agregar franja inferior
    doc.save()
       .rect(0, PAGE_HEIGHT - FOOTER_HEIGHT, PAGE_WIDTH, FOOTER_HEIGHT)
       .fill(PURPLE_COLOR)
       .restore();
}

// Función para agregar la primera página con el nuevo diseño
function agregarPrimeraPagina(doc, publicacion) {
    agregarElementosComunesPagina(doc);

    // Posición inicial del contenido
    let yPos = MARGIN + LOGO_SIZE.height + 40;

    // Título principal
    doc.font('Crimson-Bold')
       .fontSize(32)
       .fillColor(PURPLE_COLOR)
       .text(publicacion.titulo, MARGIN, yPos, {
           align: 'left',
           width: PAGE_WIDTH - (MARGIN * 2)
       });

    yPos += doc.heightOfString(publicacion.titulo) + 20;

    // Autor y nombramiento
    doc.font('Crimson')
       .fontSize(18)
       .fillColor(GRAY_COLOR)
       .text(publicacion.autor, MARGIN, yPos, {
           align: 'left'
       });

    yPos += 25;

    doc.fontSize(14)
       .text(publicacion.nombramiento || 'Investigador', MARGIN, yPos, {
           align: 'left'
       });

    yPos += 40;

    // Línea divisora
    doc.strokeColor(PURPLE_COLOR)
       .lineWidth(2)
       .moveTo(MARGIN, yPos)
       .lineTo(PAGE_WIDTH - MARGIN, yPos)
       .stroke();

    yPos += 30;

    // Resumen
    doc.font('Crimson-Bold')
       .fontSize(16)
       .fillColor('#000000')
       .text('Resumen', MARGIN, yPos);

    yPos += 20;

    doc.font('Crimson')
       .fontSize(12)
       .text(publicacion.resumen, MARGIN, yPos, {
           align: 'justify',
           width: PAGE_WIDTH - (MARGIN * 2)
       });

    yPos = doc.y + 30;

    // Contenido principal
    const textoFormateado = procesarContenidoTipTap(publicacion.contenido);
    
    doc.font('Crimson')
       .fontSize(12)
       .text(textoFormateado, MARGIN, yPos, {
           align: 'justify',
           width: PAGE_WIDTH - (MARGIN * 2),
           continued: true
       });
}

// Función para agregar referencias en nueva página
function agregarReferencias(doc, referencias) {
    doc.addPage();
    agregarElementosComunesPagina(doc);

    doc.font('Crimson-Bold')
       .fontSize(16)
       .fillColor('#000000')
       .text('Referencias', MARGIN, MARGIN + LOGO_SIZE.height + 20, {
           align: 'left'
       })
       .moveDown();

    doc.font('Crimson')
       .fontSize(12)
       .text(referencias, {
           align: 'left',
           width: PAGE_WIDTH - (MARGIN * 2)
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
            bufferPages: true,
            autoFirstPage: true,
            margin: MARGIN
        });

        // Configurar evento para elementos comunes en nuevas páginas
        doc.on('pageAdded', () => {
            agregarElementosComunesPagina(doc);
        });

        // Configurar headers para la respuesta
        res.setHeader('Content-Type', 'application/pdf');
        if (!visualizar) {
            res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}.pdf`);
        }

        doc.pipe(res);

        // Configurar documento
        configurarDocumento(doc);

        // Agregar contenido con nuevo diseño
        agregarPrimeraPagina(doc, publicacion);

        // Agregar referencias en nueva página
        if (publicacion.referencias) {
            agregarReferencias(doc, publicacion.referencias);
        }

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
