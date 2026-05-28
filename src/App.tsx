import { useState, useEffect } from 'react';
import { Scan, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { DataView, ExtractedData } from './components/DataView';
import { HistorySidebar } from './components/HistorySidebar';
import { Toaster, toast } from 'sonner';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExtractedData[]>([]);

  // Load active model name from environment variables
  const getCleanModel = (val: string) => {
    const lower = val.toLowerCase();
    if (
      lower === 'api' || 
      lower === 'api_key' || 
      lower.startsWith('aizasy') || 
      (!lower.includes('gemini') && !lower.includes('imagen') && !lower.includes('veo') && !lower.includes('lyria'))
    ) {
      return 'gemini-3.5-flash';
    }
    return val.startsWith("models/") ? val.substring(7) : val;
  };
  const activeModel = getCleanModel(import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash');

  // Load history from localStorage on mounting
  useEffect(() => {
    try {
      const saved = localStorage.getItem('docudigit_history_v2');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Error al cargar historial:', err);
    }
  }, []);

  // Save history to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('docudigit_history_v2', JSON.stringify(history));
    } catch (err) {
      console.error('Error al guardar historial:', err);
    }
  }, [history]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);

    // Early validation when file is selected so the user gets immediate feedback
    if (selectedFile.type === 'application/pdf') {
      const MAX_PDF_SIZE_MB = 2.0;
      const fSizeMB = selectedFile.size / (1024 * 1024);
      if (fSizeMB > MAX_PDF_SIZE_MB) {
        setError(
          `El archivo PDF es demasiado grande (${fSizeMB.toFixed(1)} MB). ` +
          `Vercel Serverless limita el payload de envío a 4.5 MB (en Base64). ` +
          `Por favor, selecciona un PDF de menor tamaño (máximo 2.0 MB) o sube capturas de imagen.`
        );
        toast.error('Archivo PDF demasiado grande');
      }
    } else if (selectedFile.type.startsWith('image/')) {
      const MAX_IMAGE_SIZE_MB = 10;
      const fSizeMB = selectedFile.size / (1024 * 1024);
      if (fSizeMB > MAX_IMAGE_SIZE_MB) {
        setError(
          `La imagen seleccionada es demasiado grande (${fSizeMB.toFixed(1)} MB). ` +
          `Por favor, sube una imagen de menor tamaño (máximo 10 MB) para poder optimizarla adecuadamente.`
        );
        toast.error('Imagen demasiado grande');
      }
    }
  };

  const optimizeImageAndGetBase64 = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(f);
      reader.onload = () => {
        const dataUrl = reader.result?.toString();
        if (!dataUrl) {
          reject(new Error('Fallo al leer la imagen'));
          return;
        }

        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Using 1500px maximum dimension instead of 2000px keeps OCR accuracy exceptionally high 
            // while drastically reducing the footprint, avoiding potential 413 errors on serverless.
            const MAX_DIM = 1500;
            if (width > MAX_DIM || height > MAX_DIM) {
              if (width > height) {
                height = Math.round((height * MAX_DIM) / width);
                width = MAX_DIM;
              } else {
                width = Math.round((width * MAX_DIM) / height);
                height = MAX_DIM;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              // Compressed JPEG at 0.75 quality to dramatically optimization weight (to typically 100KB-300KB)
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
              const base64Str = compressedDataUrl.split(',')[1];
              resolve(base64Str);
            } else {
              const base64Str = dataUrl.split(',')[1];
              resolve(base64Str);
            }
          } catch (err) {
            console.warn('Canvas compression failed, falling back to original:', err);
            const base64Str = dataUrl.split(',')[1];
            resolve(base64Str);
          }
        };
        img.onerror = () => {
          const base64Str = dataUrl.split(',')[1];
          resolve(base64Str);
        };
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const fileToBase64 = async (f: File): Promise<string> => {
    // Check for PDF size restriction on Vercel (approx 2.5MB max to secure under 4.5MB base64 payload size)
    if (f.type === 'application/pdf') {
      const MAX_PDF_SIZE_MB = 2.0;
      const fSizeMB = f.size / (1024 * 1024);
      if (fSizeMB > MAX_PDF_SIZE_MB) {
        throw new Error(
          `El archivo PDF es demasiado grande (${fSizeMB.toFixed(1)} MB). ` +
          `Vercel Serverless limita el envío total a 4.5 MB. ` +
          `Por favor, sube un PDF de menor tamaño (máximo 2.0 MB) o sube capturas de imagen.`
        );
      }
    }

    if (f.type.startsWith('image/')) {
      toast.info('Optimizando imagen para procesamiento rápido...');
      try {
        return await optimizeImageAndGetBase64(f);
      } catch (err) {
        console.warn('No se pudo optimizar la imagen:', err);
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(f);
      reader.onload = () => {
        const base64Str = reader.result?.toString().split(',')[1];
        if (base64Str) resolve(base64Str);
        else reject(new Error('Fallo al codificar archivo a base64'));
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleExtract = async () => {
    if (!file) {
      toast.warning('Por favor, selecciona un archivo primero');
      return;
    }

    if (error) {
      toast.error('Por favor, resuelve los errores del archivo seleccionado');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const base64 = await fileToBase64(file);
      
      // Calculate actual request payload size in characters (1 character = 1 byte in standard base64/JSON payload)
      const payloadString = JSON.stringify({
        fileBase64: base64,
        mimeType: file.type,
      });
      const payloadSizeInMB = payloadString.length / (1024 * 1024);

      if (payloadSizeInMB > 4.2) {
        throw new Error(
          `El archivo procesado (${payloadSizeInMB.toFixed(1)} MB después de codificar en Base64) supera el límite de transferencia. ` +
          `Vercel Serverless bloquea de forma absoluta cualquier petición de más de 4.5 MB. ` +
          `Por favor, reduce la resolución del archivo o selecciona un documento PDF más pequeño (máximo 2.0 MB para PDFs).`
        );
      }
      
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payloadString,
      });

      if (!response.ok) {
        // Intercept Vercel 413 Payload Too Large error
        if (response.status === 413) {
          throw new Error(
            'El archivo procesado es demasiado grande para ser enviado. ' +
            'Vercel Serverless tiene un límite absoluto de 4.5 MB para las peticiones. ' +
            'Por favor, utiliza una imagen o PDF de menor tamaño (máximo 2.0 MB).'
          );
        }
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error con el servicio de digitalización');
      }

      const rawJson = await response.json();
      
      const newRecord: ExtractedData = {
        ...rawJson,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };

      setResult(newRecord);
      setHistory((prev) => [newRecord, ...prev]);
      toast.success('¡Documento procesado y guardado!');
    } catch (err: any) {
      console.error('Error durante la extracción:', err);
      setError(err.message || 'No se pudo digitalizar el documento. Inténtalo de nuevo.');
      toast.error(err.message || 'Hubo un error al procesar el archivo');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (result?.id === id) {
      setResult(null);
    }
    toast.success('Documento eliminado del historial');
  };

  const clearHistory = () => {
    if (window.confirm('¿Seguro que deseas borrar todo el historial de digitalizaciones?')) {
      setHistory([]);
      setResult(null);
      toast.success('Historial borrado por completo');
    }
  };

  const selectHistoryItem = (item: ExtractedData) => {
    setResult(item);
    setFile(null); // Clear active drop or upload state
    setError(null);
    toast.info(`Viendo: ${item.title}`);
  };

  const startNewExtract = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 antialiased font-sans">
      <Toaster position="bottom-right" richColors />
      
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-900 rounded-xl flex items-center justify-center">
              <Scan className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">DocuDigit</h1>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">Digitalización Inteligente</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-full border border-slate-200 transition-colors">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500/20" />
            <span className="font-semibold text-slate-600">Modelo Activo:</span>
            <span className="font-bold text-indigo-600 select-all">{activeModel}</span>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="max-w-[1600px] mx-auto w-full px-6 py-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* History Sidebar - Left Column on Large Screens (3 cols) */}
          <div className="lg:col-span-3 h-[calc(100vh-10rem)] sticky top-24 hidden lg:block">
            <HistorySidebar
              history={history}
              onSelectItem={selectHistoryItem}
              onDeleteItem={deleteHistoryItem}
              onClearHistory={clearHistory}
              activeId={result?.id}
            />
          </div>

          {/* Core Applet Workspace - Right Columns (9 cols) */}
          <div className="lg:col-span-9 space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              
              {/* Digitization Upload Area (5 cols) */}
              <div className="xl:col-span-5 space-y-6">
                <div className="space-y-3">
                  <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
                    Digitaliza tus fotos y PDFs de inmediato
                  </h2>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Extrae datos estructurados limpios y texto formateado en español con inteligencia artificial de última generación.
                  </p>
                </div>

                <div className="space-y-4">
                  <FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} />
                  
                  {file && !result && (
                    <button
                      onClick={handleExtract}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Procesando archivo...
                        </>
                      ) : (
                        <>
                          <Scan className="w-5 h-5" />
                          Comenzar Digitalización
                        </>
                      )}
                    </button>
                  )}

                  {result && (
                    <button
                      onClick={startNewExtract}
                      className="w-full flex items-center justify-center gap-2 h-12 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl border border-slate-200 transition-colors shadow-sm cursor-pointer"
                    >
                      Subir o tomar otra captura
                    </button>
                  )}
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-800 space-y-1">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-rose-500" />
                      <span className="font-bold text-sm">Error en proceso</span>
                    </div>
                    <p className="text-xs text-rose-600 leading-relaxed">{error}</p>
                  </div>
                )}

                {/* Mobile History Section (Visible only on smaller breakpoints) */}
                <div className="block lg:hidden mt-8 pt-8 border-t border-slate-200">
                  <HistorySidebar
                    history={history}
                    onSelectItem={selectHistoryItem}
                    onDeleteItem={deleteHistoryItem}
                    onClearHistory={clearHistory}
                    activeId={result?.id}
                  />
                </div>
              </div>

              {/* Data Extraction View Area (7 cols) */}
              <div className="xl:col-span-7">
                {result ? (
                  <div className="animate-fade-in">
                    <DataView data={result} />
                  </div>
                ) : (
                  <div className="h-full min-h-[350px] border border-slate-200 bg-white/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center text-center p-8">
                    <div className="w-16 h-16 bg-white rounded-2xl border border-slate-100 flex items-center justify-center shadow-sm mb-4">
                      <Scan className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                    </div>
                    <h3 className="font-bold text-base text-slate-800">Visualizador de digitalización</h3>
                    <p className="text-xs text-slate-400 max-w-xs mt-2 leading-relaxed">
                      Sube una imagen o PDF. La IA se encargará de estructurar todas las tablas, fechas e importes de manera uniforme.
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* Footer bar */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 mt-12 text-xs text-slate-400">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 DocuDigit - Procesamiento seguro local e Inteligencia Artificial.</p>
          <div className="flex items-center space-x-4">
            <span className="font-semibold text-slate-500">Modelo Activo: {activeModel}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
