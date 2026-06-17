import { useState, useEffect } from 'react';
import { Scan, AlertCircle, Loader2, Sparkles, LogIn, LogOut, Cloud } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { DataView, ExtractedData } from './components/DataView';
import { HistorySidebar } from './components/HistorySidebar';
import { Toaster, toast } from 'sonner';

// Firebase imports
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, getDocFromServer } from 'firebase/firestore';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExtractedData[]>([]);

  // Firebase auth & syncing states
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Load active model name from environment variables
  const getCleanModel = (val: string) => {
    const lower = val.toLowerCase();
    if (
      lower === 'api' || 
      lower === 'api_key' || 
      lower.startsWith('aizasy') || 
      (!lower.includes('gemini') && !lower.includes('imagen') && !lower.includes('veo') && !lower.includes('lyria'))
    ) {
      return 'gemini-2.5-flash';
    }
    return val.startsWith("models/") ? val.substring(7) : val;
  };
  const activeModel = getCleanModel(import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash');

  // Validate Connection to Firestore on boot to obey skill guidelines with transient retry logic
  useEffect(() => {
    let active = true;
    async function testConnection(retries = 3, delay = 1500) {
      for (let i = 0; i < retries; i++) {
        if (!active) return;
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
          return; // Succeeded!
        } catch (err) {
          if (i === retries - 1) {
            if (err instanceof Error && (err.message.includes('the client is offline') || err.message.includes('offline'))) {
              console.warn("Firestore connection check has completed. Offline mode or proxy latency is operational.");
            }
          } else {
            // Wait before next retry to allow network/auth to settle
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }
    testConnection();
    return () => {
      active = false;
    };
  }, []);

  // Track Firebase auth session changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync historical logs from Firestore or LocalStorage depending on login state
  useEffect(() => {
    if (!user) {
      // Offline/Guest mode
      try {
        const saved = localStorage.getItem('docudigit_history_v2');
        if (saved) {
          setHistory(JSON.parse(saved));
        } else {
          setHistory([]);
        }
      } catch (err) {
        console.error('Error al cargar historial local:', err);
      }
      return;
    }

    // Authenticated Mode: Subscribe to real-time Firestore synchronization
    const q = query(collection(db, 'documents'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbDocs: ExtractedData[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        dbDocs.push({
          id: data.id,
          title: data.title,
          summary: data.summary,
          details: data.details || [],
          rawMarkdown: data.rawMarkdown,
          promptSent: data.promptSent,
          tokenStats: data.tokenStats,
          timestamp: data.timestamp,
        });
      });
      // Sort in memory to bypass global complex index constraints in Firestore
      dbDocs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setHistory(dbDocs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'documents');
    });

    return () => unsubscribe();
  }, [user]);

  // Save history to localStorage on change ONLY when guest
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem('docudigit_history_v2', JSON.stringify(history));
      } catch (err) {
        console.error('Error al guardar historial local:', err);
      }
    }
  }, [history, user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('¡Sesión iniciada con éxito en la nube!');
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        toast.error('No se pudo iniciar sesión con Google');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setResult(null);
      toast.success('Sesión cerrada correctamente');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
      toast.error('No se pudo cerrar la sesión');
    }
  };


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
        
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (_) {}

        let errObj: any = {};
        try {
          errObj = JSON.parse(errorText);
        } catch (_) {}

        const backendError = errObj.error || errorText || `Error del servidor (código ${response.status})`;
        throw new Error(backendError);
      }

      const rawJson = await response.json();
      
      const newRecord: ExtractedData = {
        ...rawJson,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };

      if (user) {
        const recordToSave = {
          ...newRecord,
          ownerId: user.uid,
        };
        try {
          await setDoc(doc(db, 'documents', newRecord.id), recordToSave);
          toast.success('¡Documento digitalizado y respaldado en la nube!');
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.CREATE, `documents/${newRecord.id}`);
        }
      } else {
        setHistory((prev) => [newRecord, ...prev]);
        toast.success('¡Documento procesado y guardado!');
      }

      setResult(newRecord);
    } catch (err: any) {
      console.error('Error durante la extracción:', err);
      setError(err.message || 'No se pudo digitalizar el documento. Inténtalo de nuevo.');
      toast.error(err.message || 'Hubo un error al procesar el archivo');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, 'documents', id));
        toast.success('Documento eliminado de la nube');
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.DELETE, `documents/${id}`);
      }
    } else {
      setHistory((prev) => prev.filter((item) => item.id !== id));
      toast.success('Documento eliminado del historial');
    }
    if (result?.id === id) {
      setResult(null);
    }
  };

  const clearHistory = async () => {
    if (window.confirm('¿Seguro que deseas borrar todo el historial de digitalizaciones?')) {
      if (user) {
        toast.info('Borrando historial de la nube...');
        try {
          for (const item of history) {
            if (item.id) {
              await deleteDoc(doc(db, 'documents', item.id));
            }
          }
          toast.success('Historial de la nube borrado por completo');
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.DELETE, 'documents');
        }
      } else {
        setHistory([]);
        toast.success('Historial borrado por completo');
      }
      setResult(null);
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

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 text-xs bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500/20" />
              <span className="font-semibold text-slate-600">Modelo:</span>
              <span className="font-bold text-indigo-600 select-all">{activeModel}</span>
            </div>

            {authLoading ? (
              <div className="flex items-center justify-center p-2">
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              </div>
            ) : user ? (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1.5 rounded-full text-xs font-semibold">
                  <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate max-w-[100px] sm:max-w-[140px]">{user.displayName || user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-full border border-slate-200 transition-all cursor-pointer"
                  title="Cerrar sesión de la nube"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Cerrar Sesión</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-sm px-3.5 py-1.5 rounded-full border border-slate-900 transition-all active:scale-[0.98] cursor-pointer"
                title="Iniciar sesión con Google para respaldar digitalizaciones"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Iniciar Sesión</span>
              </button>
            )}
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
              isCloud={!!user}
              onLogin={handleLogin}
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

                {!user && (
                  <div className="p-4 bg-gradient-to-r from-indigo-50 to-indigo-100/50 border border-indigo-100 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                        <Cloud className="w-4 h-4 text-indigo-500 animate-pulse shrink-0" />
                        ¿Respaldar en la nube?
                      </p>
                      <p className="text-[11px] text-indigo-700 leading-relaxed">
                        Inicia sesión con Google para guardar y sincronizar tu historial de forma segura.
                      </p>
                    </div>
                    <button
                      onClick={handleLogin}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm px-3 py-1.5 rounded-xl border border-indigo-600 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Conectar</span>
                    </button>
                  </div>
                )}

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
                    isCloud={!!user}
                    onLogin={handleLogin}
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
