import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json({ limit: '50mb' }));

// Init Gemini client with aistudio-build telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Primary extraction endpoint
app.post('/api/extract', async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: 'Falta el archivo o tipo de archivo (mimeType)' });
    }

    // Read configured model from env, fallback to gemini-3.1-pro-preview
    const modelId = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || "gemini-3.1-pro-preview";
    const finalModel = modelId.startsWith("models/") ? modelId : `models/${modelId}`;

    console.log(`Digitalizando documento con el modelo: ${finalModel}`);

    const response = await ai.models.generateContent({
      model: finalModel,
      contents: [
        {
          inlineData: {
            data: fileBase64,
            mimeType: mimeType,
          },
        },
        {
          text: `Eres un experto en extracción e interpretación de información de documentos y digitalización inteligente.
          Analiza cuidadosamente la imagen o PDF adjunto y extrae TODO su contenido de manera estructurada en idioma ESPAÑOL.
          
          El resultado DEBE ser devuelto estrictamente como un objeto JSON con el siguiente formato:
          {
            "title": "Un título descriptivo y claro para el documento (ej: Factura de Iberdrola, DNI de Juan Pérez, Ticket StarBucks)",
            "summary": "Un resumen ejecutivo corto (1 o 2 oraciones) de lo que trata el documento.",
            "details": [
              { "label": "Nombre del campo", "value": "Valor extraído" },
              { "label": "Otro campo relevante", "value": "Su respectivo valor informativo" }
            ],
            "rawMarkdown": "Todo el documento formateado elegantemente en Markdown en idioma ESPAÑOL. Organiza la información usando tablas, negritas, listas o secciones según corresponda para que sea fácil de leer y copiar."
          }

          INSTRUCCIONES IMPORTANTES:
          1. Extrae todos los datos que identifiques (fechas, nombres, montos, impuestos, firmas, números de identificación, direcciones, etc.).
          2. No inventes datos. Si algo no es legible o no existe, no lo incluyas en 'details'.
          3. Devuelve únicamente el objeto JSON válido. Sin explicaciones adicionales alrededor, sin bloques de código markdown de tipo json (no uses \`\`\`json).`,
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text;
    if (!resultText) {
      return res.status(500).json({ error: "El modelo no generó una respuesta válida." });
    }

    // Try to parse the model output to verify it is valid JSON
    let parsedData;
    try {
      parsedData = JSON.parse(resultText.trim());
    } catch {
      // In case the model wrapped it with markdown blocks, try to clean it
      const cleaned = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleaned);
    }

    return res.json(parsedData);
  } catch (error: any) {
    console.error("Error en digitalización de Gemini:", error);
    return res.status(500).json({ 
      error: `Error al procesar el archivo: ${error.message || 'Error desconocido'}` 
    });
  }
});

// Static or Vite setup depending on environment
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  // ESM import metadata compatibility
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`[DocuDigit Server] Listening on http://localhost:${port}`);
});
