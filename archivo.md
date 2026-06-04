# Guía de APIs y Configuración para Vercel 🚀

Este archivo detalla todas las APIs y configuraciones del servidor de **DocuDigit** listas para subirse y ejecutarse en la plataforma serverless de **Vercel**.

---

## 1. Endpoints de la API (`/api/*`)

El backend de Express expone los siguientes endpoints para el funcionamiento de la aplicación:

### A. Extracción Digital / Digitalización de Documentos
* **Ruta:** `/api/extract`
* **Método:** `POST`
* **Cuerpo de la Solicitud (JSON):**
  ```json
  {
    "fileBase64": "JVBERi0xLjQK... (código Base64 del archivo)",
    "mimeType": "application/pdf" // o "image/jpeg", "image/png", etc.
  }
  ```
* **Respuesta Exitosa (JSON):** Retorna la información estructurada del documento incluyendo título, resumen, detalles específicos extraídos, la versión enriquecida en texto Markdown, y estadísticas de consumo de tokens:
  ```json
  {
    "title": "Factura Iberdrola - Junio 2026",
    "summary": "Documento de cobro eléctrico mensual...",
    "details": [
      { "label": "Importe Total", "value": "74.52 €" },
      { "label": "Fecha Factura", "value": "15/05/2026" }
    ],
    "rawMarkdown": "# Factura de Electricidad...\n...",
    "promptSent": "[Archivo Adjunto: application/pdf]\n...",
    "tokenStats": {
      "promptTokens": 1420,
      "completionTokens": 320,
      "totalTokens": 1740
    }
  }
  ```

---

### B. Chat con el Asistente Inteligente (Document-Context)
* **Ruta:** `/api/assistant/chat`
* **Método:** `POST`
* **Cuerpo de la Solicitud (JSON):**
  ```json
  {
    "document": {
      "title": "Factura Iberdrola...",
      "summary": "...",
      "details": [],
      "rawMarkdown": "..."
    },
    "messages": [
      { "role": "user", "content": "¿Cuál es la fecha límite de pago?" }
    ]
  }
  ```
* **Respuesta Exitosa (JSON):**
  ```json
  {
    "reply": "La fecha límite para el abono de la factura es el **30 de junio de 2026**.",
    "tokenStats": { "promptTokens": 1200, "completionTokens": 45, "totalTokens": 1245 },
    "promptSent": "..."
  }
  ```

---

## 2. Variables de Entorno Requeridas en Vercel 🗝️

Debes configurar las siguientes variables de entorno en el panel de control de tu proyecto en Vercel (**Settings > Environment Variables**):

| Variable | Descripción | Valor Recomendado |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clave API secreta de Google AI Studio para procesar los documentos y alimentar el chat. | *Tu API Key de Google* (`AIzaSy...`) |
| `GEMINI_MODEL` | El modelo de Gemini a utilizar para las operaciones en el backend. | `gemini-3.5-flash` o `gemini-2.5-flash` |
| `VITE_GEMINI_MODEL` | Asegura que el frontend conozca el nombre del modelo activo en pantalla. | `gemini-3.5-flash` |

---

## 3. Configuración para el Despliegue (`vercel.json`) ⚙️

El proyecto ya cuenta con el archivo `vercel.json` en la raíz configurado con un límite de duración extendido para que las consultas de inteligencia artificial no sufran "Timeouts":

```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.ts" }
  ],
  "functions": {
    "api/index.ts": {
      "maxDuration": 60
    }
  }
}
```

* **Nota:** Al asignar `maxDuration: 60`, permites que la función serverless de la API se ejecute por hasta 60 segundos antes de interrumpirse (lo ideal para procesar y digitalizar imágenes de documentos pesados de forma ininterrumpida).

---

## 4. Instrucciones para Subir a Vercel 📦

1. **Instalar el CLI de Vercel** (si aún no lo tienes):
   ```bash
   npm install -g vercel
   ```
2. **Iniciar sesión en el CLI:**
   ```bash
   vercel login
   ```
3. **Desplegar el proyecto:**
   Desde la raíz de la carpeta de este proyecto ejecuta:
   ```bash
   vercel
   ```
4. **Responder a las preguntas:**
   * *Set up and deploy?* → `yes`
   * *Link to existing project?* → `no` (si es un proyecto nuevo)
   * *What is your project's name?* → `digitalizacion-de` (o el nombre que gustes)
   * *In which directory is your code located?* → `./`
5. **Añadir las Variables de Entorno en Vercel:**
   Ve a la consola de Vercel de tu proyecto, añade tu `GEMINI_API_KEY` en la sección **Settings > Environment Variables** y presiona guardar.
6. **Despliegue a Producción:**
   ```bash
   vercel --prod
   ```

¡O listo! Si tienes el proyecto conectado a una cuenta de **GitHub**, cada "push" a la rama principal relanzará y actualizará automáticamente la API en la nube de Vercel con la configuración óptima.
