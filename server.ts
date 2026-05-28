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

// Clean and sanitize the configured model string, bypassing any invalid env placeholders (e.g. "API" or key prefixes)
function getCleanModel(val?: string, fallback: string = "gemini-3.5-flash"): string {
  if (!val) return fallback;
  const lower = val.toLowerCase();
  
  if (
    lower === 'api' || 
    lower === 'api_key' || 
    lower.startsWith('aizasy') || 
    (!lower.includes('gemini') && !lower.includes('imagen') && !lower.includes('veo') && !lower.includes('lyria'))
  ) {
    return fallback;
  }
  
  return val.startsWith("models/") ? val.substring(7) : val;
}

// Primary extraction endpoint (supports both /api/extract and rewritten /extract)
app.post(['/api/extract', '/extract'], async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: 'Falta el archivo o tipo de archivo (mimeType)' });
    }

    // Read configured model from env, fallback to gemini-3.5-flash
    const rawModelConfig = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || "gemini-3.5-flash";
    const finalModel = getCleanModel(rawModelConfig, "gemini-3.5-flash");

    console.log(`Digitalizando documento con el modelo: ${finalModel}`);

    const systemPrompt = `Eres un experto en extracción e interpretación de información de documentos y digitalización inteligente.
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
    3. Devuelve únicamente el objeto JSON válido. Sin explicaciones adicionales alrededor, sin bloques de código markdown de tipo json (no uses \`\`\`json).`;

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
          text: systemPrompt,
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

    // Extract token usage metadata safely
    const usage = response.usageMetadata || (response as any).usage_metadata || {};
    const tokenStats = {
      promptTokens: usage.promptTokenCount || (usage as any).prompt_token_count || 0,
      completionTokens: usage.candidatesTokenCount || (usage as any).candidates_token_count || (usage as any).completion_token_count || 0,
      totalTokens: usage.totalTokenCount || (usage as any).total_token_count || 0
    };

    // Return extended document model
    return res.json({
      ...parsedData,
      promptSent: `[Archivo Adjunto: ${mimeType}]\n\n${systemPrompt}`,
      tokenStats: tokenStats
    });
  } catch (error: any) {
    console.error("Error en digitalización de Gemini:", error);
    return res.status(500).json({ 
      error: `Error al procesar el archivo: ${error.message || 'Error desconocido'}` 
    });
  }
});

// Assistant Chat Endpoint (supports both /api/assistant/chat and rewritten /assistant/chat)
app.post(['/api/assistant/chat', '/assistant/chat'], async (req, res) => {
  try {
    const { document, messages } = req.body;
    if (!document) {
      return res.status(400).json({ error: 'Falta la información del documento.' });
    }
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Falta el historial de mensajes o formato incorrecto.' });
    }

    const rawModelConfig = process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || "gemini-3.5-flash";
    const finalModel = getCleanModel(rawModelConfig, "gemini-3.5-flash");

    const documentContext = `
DOCUMENTO ACTIVO:
Título: ${document.title}
Resumen: ${document.summary}

Datos Estructurados:
${JSON.stringify(document.details, null, 2)}

Contenido Plano / Markdown:
${document.rawMarkdown}
`;

    const systemInstruction = `Eres un asistente de digitalización experto e inteligente de DocuDigit. Tu tarea es responder de manera amigable, exacta e informativa a preguntas del usuario basadas EXCLUSIVAMENTE en la información del documento digitalizado que te proveerá el usuario.
No inventes datos. Si la pregunta del usuario requiere información que no se encuentra o no se puede deducir del documento, indícalo de manera educada diciendo "Esa información no consta en el documento digitalizado disponible."
Mantén tus respuestas profesionales, claras y al grano en idioma ESPAÑOL. Usa markdown libremente en tus respuestas de chat.`;

    const formattedContents = [];
    
    // Provide document context as user message setup
    formattedContents.push({
      role: 'user',
      parts: [{ text: `Aquí tienes la información detallada del documento sobre el cual te haré preguntas de ahora en adelante:\n${documentContext}` }]
    });
    
    formattedContents.push({
      role: 'model',
      parts: [{ text: `Entendido perfectamente. He analizado todos los datos, fechas, tablas y el contenido de "${document.title}". Quedo a tu disposición para ayudarte a consultar, resumir o analizar cualquier aspecto de este documento. ¿Qué deseas saber?` }]
    });

    // Provide past messages
    for (const msg of messages) {
      formattedContents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    const response = await ai.models.generateContent({
      model: finalModel,
      contents: formattedContents,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    const replyText = response.text || '';
    
    // Extract token usage metadata safely
    const usage = response.usageMetadata || (response as any).usage_metadata || {};
    const tokenStats = {
      promptTokens: usage.promptTokenCount || (usage as any).prompt_token_count || 0,
      completionTokens: usage.candidatesTokenCount || (usage as any).candidates_token_count || (usage as any).completion_token_count || 0,
      totalTokens: usage.totalTokenCount || (usage as any).total_token_count || 0
    };

    return res.json({
      reply: replyText,
      tokenStats: tokenStats,
      promptSent: `[Contexto del Documento]\n` + systemInstruction + `\n\nPregunta enviada: ` + (messages[messages.length - 1]?.content || '')
    });
  } catch (error: any) {
    console.error("Error en asistente de Gemini:", error);
    return res.status(500).json({ 
      error: `Error al consultar al asistente: ${error.message || 'Error desconocido'}` 
    });
  }
});

// Static or Vite setup depending on environment (disable static file serving on serverless Vercel)
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else if (!process.env.VERCEL) {
  // ESM import metadata compatibility
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
}

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`[DocuDigit Server] Listening on http://localhost:${port}`);
  });
}

export default app;
