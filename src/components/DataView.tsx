import ReactMarkdown from 'react-markdown';
import { Copy, Download, FileText, Table, Check, Cpu, Terminal, MessageSquare, Send, Sparkles, Trash2, Bot, User, RefreshCw, Volume2, Play, Pause, Square, Headphones, HelpCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

export interface ExtractedData {
  id?: string;
  timestamp?: number;
  title: string;
  summary: string;
  details: { label: string; value: string }[];
  rawMarkdown: string;
  promptSent?: string;
  tokenStats?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface DataViewProps {
  data: ExtractedData;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function DataView({ data }: DataViewProps) {
  const [activeTab, setActiveTab] = useState<'structured' | 'markdown' | 'token-stats' | 'assistant'>('structured');
  const [copied, setCopied] = useState(false);

  // Audio Speech Synthesis / Narrator State
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [isPausedVoice, setIsPausedVoice] = useState(false);
  const [voiceRate, setVoiceRate] = useState<number>(1.0);
  const [narrationMode, setNarrationMode] = useState<'summary' | 'detailed' | 'all'>('summary');
  const voiceUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Initialize SpeechSynthesis on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setIsVoiceSupported(true);
      
      const loadAllVoices = () => {
        const list = window.speechSynthesis.getVoices();
        // Filter Spanish voices
        const esList = list.filter(v => v.lang.toLowerCase().startsWith('es'));
        setAvailableVoices(esList.length > 0 ? esList : list);
        
        // Auto select a smart default voice
        if (esList.length > 0) {
          const naturalOrGoogleEs = esList.find(
            v => v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('natural')
          ) || esList[0];
          setSelectedVoice(naturalOrGoogleEs.name);
        } else if (list.length > 0) {
          setSelectedVoice(list[0].name);
        }
      };

      loadAllVoices();
      
      // Some browsers load voices asynchronously
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadAllVoices;
      }

      return () => {
        window.speechSynthesis.cancel();
      };
    }
  }, []);

  // Cancel any speech immediately if document changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlayingVoice(false);
      setIsPausedVoice(false);
    }
  }, [data]);

  const compileNarrationText = () => {
    let script = `Visualizando documento digitalizado: ${data.title}. `;
    if (narrationMode === 'summary') {
      script += `Resumen ejecutivo: ${data.summary}`;
    } else if (narrationMode === 'detailed') {
      script += `Resumen general: ${data.summary}.  A continuación se detallan los datos estructurados extraídos de la tabla: `;
      if (data.details && data.details.length > 0) {
        data.details.forEach(item => {
          script += `Clave: ${item.label}. Valor extraído: ${item.value}.  `;
        });
      } else {
        script += "No se hallaron campos estructurados adicionales en el documento.";
      }
    } else {
      script += `Resumen general: ${data.summary}. Contenido e información extendida en formato texto: ${data.rawMarkdown}`;
    }
    return script;
  };

  const handleStartSpeaking = () => {
    if (!isVoiceSupported) {
      toast.error('La síntesis de voz no está soportada o disponible en este navegador.');
      return;
    }

    if (isPausedVoice) {
      window.speechSynthesis.resume();
      setIsPausedVoice(false);
      setIsPlayingVoice(true);
      return;
    }

    window.speechSynthesis.cancel();

    const scriptText = compileNarrationText();
    const utt = new SpeechSynthesisUtterance(scriptText);
    
    const allGenVoices = window.speechSynthesis.getVoices();
    const chosenVoice = allGenVoices.find(v => v.name === selectedVoice);
    if (chosenVoice) {
      utt.voice = chosenVoice;
    }
    
    utt.rate = voiceRate;

    utt.onend = () => {
      setIsPlayingVoice(false);
      setIsPausedVoice(false);
    };

    utt.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.error('Speech synthesis utterance error:', e);
        setIsPlayingVoice(false);
        setIsPausedVoice(false);
      }
    };

    voiceUtteranceRef.current = utt;
    setIsPlayingVoice(true);
    setIsPausedVoice(false);
    
    window.speechSynthesis.speak(utt);
    toast.success('Iniciando reproducción de voz...');
  };

  const handlePauseSpeaking = () => {
    if (isPlayingVoice && !isPausedVoice) {
      window.speechSynthesis.pause();
      setIsPausedVoice(true);
      toast.info('Lectura pausada');
    }
  };

  const handleStopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsPlayingVoice(false);
    setIsPausedVoice(false);
    toast.info('Lectura detenida');
  };

  // Chat Assistant state
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>(() => {
    try {
      const saved = localStorage.getItem('docudigit_chats_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [inputVal, setInputVal] = useState('');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'assistant') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistories, activeTab]);

  // Sync chats to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('docudigit_chats_v1', JSON.stringify(chatHistories));
    } catch (e) {
      console.error(e);
    }
  }, [chatHistories]);

  const activeDocId = data.id || 'temp';
  const activeDocMessages = chatHistories[activeDocId] || [];

  const handleSendChatMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isAssistantLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend,
      timestamp: Date.now()
    };

    const updatedMessages = [...activeDocMessages, userMsg];
    setChatHistories(prev => ({
      ...prev,
      [activeDocId]: updatedMessages
    }));
    setInputVal('');
    setIsAssistantLoading(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          document: {
            title: data.title,
            summary: data.summary,
            details: data.details,
            rawMarkdown: data.rawMarkdown
          },
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Error al consultar al asistente');
      }

      const body = await response.json();
      
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: body.reply,
        timestamp: Date.now()
      };

      setChatHistories(prev => ({
        ...prev,
        [activeDocId]: [...updatedMessages, assistantMsg]
      }));

      if (body.tokenStats) {
        toast.info(`Asistente respondió - Consumo: ${body.tokenStats.totalTokens} tokens`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Hubo un error al comunicarse con el asistente.');
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '⚠️ No pude contestar en este momento. Por favor verifica tu conexión o vuelve a intentarlo más tarde.',
        timestamp: Date.now()
      };
      setChatHistories(prev => ({
        ...prev,
        [activeDocId]: [...updatedMessages, errorMsg]
      }));
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const clearChatHistory = () => {
    setChatHistories(prev => ({
      ...prev,
      [activeDocId]: []
    }));
    toast.success('Conversación de este documento borrada');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data.rawMarkdown);
    setCopied(true);
    toast.success('¡Copiado al portapapeles!');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAsTxt = () => {
    const formattedContent = `${data.title}\n${'='.repeat(data.title.length)}\n\n${data.summary}\n\n${'-'.repeat(30)}\n\n${data.rawMarkdown}`;
    const blob = new Blob([formattedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_digitalizacion.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('¡Documento TXT descargado!');
  };

  const downloadAsCsv = () => {
    if (!data.details || data.details.length === 0) {
      toast.error('No hay datos estructurados disponibles para generar un CSV');
      return;
    }

    const escapeCsvField = (field: string) => {
      const escaped = field.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvRows = [
      ['Campo', 'Valor Extraido'].map(escapeCsvField).join(','), // Header
      ...data.details.map(detail => [detail.label, detail.value].map(escapeCsvField).join(','))
    ];

    const csvContent = '\ufeff' + csvRows.join('\n'); // Add UTF-8 BOM so Spanish accents load correctly in Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_datos.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('¡Archivo CSV descargado!');
  };

  const downloadAsDocs = () => {
    const docHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>${data.title}</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333333; margin: 40px; }
          h1 { color: #1e293b; font-size: 24pt; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 20px; }
          h2 { color: #334155; font-size: 16pt; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; }
          p { font-size: 11pt; margin-bottom: 15px; }
          .summary-box { background-color: #f8fafc; border-left: 4px solid #475569; padding: 15px; margin-bottom: 30px; font-style: italic; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 10pt; }
          th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
          .footer { font-size: 9pt; color: #94a3b8; text-align: center; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>${data.title}</h1>
        <div class="summary-box">
          <strong>Resumen Ejecutivo:</strong> ${data.summary}
        </div>
        
        <h2>Datos Estructurados</h2>
        <table>
          <thead>
            <tr>
              <th style="width: 30%;">Campo / Clave</th>
              <th style="width: 70%;">Valor Extraído</th>
            </tr>
          </thead>
          <tbody>
            ${(data.details || []).map(detail => `
              <tr>
                <td><strong>${detail.label}</strong></td>
                <td>${detail.value}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <h2>Texto Completo</h2>
        <div style="white-space: pre-line; font-size: 11pt; font-family: Arial, sans-serif;">
          ${data.rawMarkdown}
        </div>
        
        <div class="footer">
          Documento digitalizado por DocuDigit el ${new Date().toLocaleString('es-ES')}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + docHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_documento.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('¡Documento de Word (.doc/Docs) descargado!');
  };

  const downloadAsJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_estructurado.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('¡Archivo JSON estructurado descargado!');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              {data.title}
            </h2>
            {data.tokenStats && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold tracking-wide uppercase">
                <Cpu className="w-3 h-3 text-indigo-500" />
                <span>{data.tokenStats.totalTokens} tokens</span>
              </div>
            )}
          </div>
          <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
            {data.summary}
          </p>
        </div>
        
        {/* Actions Row */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-slate-200"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copiar Markdown
              </>
            )}
          </button>
          
          <button
            onClick={downloadAsTxt}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-150 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-slate-200"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Descargar (TXT)
          </button>

          <button
            onClick={downloadAsDocs}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-indigo-100"
          >
            <Download className="w-3.5 h-3.5 text-indigo-500" />
            Documento (DOC)
          </button>

          <button
            onClick={downloadAsCsv}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-amber-100"
          >
            <Download className="w-3.5 h-3.5 text-amber-500" />
            Tabla (CSV)
          </button>

          <button
            onClick={downloadAsJson}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-emerald-100"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            Estructurado (JSON)
          </button>
        </div>
      </div>

      {/* Narrador de Voz Inteligente (Text-To-Speech Player) */}
      {isVoiceSupported && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-3">
            {/* Audio Wave / State Indicator */}
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100/60 text-indigo-600 shrink-0">
              {isPlayingVoice && !isPausedVoice ? (
                <div className="flex items-end gap-1 h-5 px-1">
                  <span className="w-0.5 bg-indigo-600 rounded-full animate-bounce [animation-duration:0.6s]" style={{ height: '70%' }}></span>
                  <span className="w-0.5 bg-indigo-600 rounded-full animate-bounce [animation-duration:1.0s]" style={{ height: '100%' }}></span>
                  <span className="w-0.5 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.8s]" style={{ height: '40%' }}></span>
                  <span className="w-0.5 bg-indigo-600 rounded-full animate-bounce [animation-duration:0.7s]" style={{ height: '80%' }}></span>
                </div>
              ) : (
                <Volume2 className="w-5 h-5 text-indigo-500" />
              )}
            </div>
            
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                Narrador por Voz DocuDigit
                {isPlayingVoice && (
                  <span className="px-2 py-0.5 text-[8px] bg-indigo-100 text-indigo-800 font-extrabold rounded-full tracking-wider uppercase animate-pulse">
                    {isPausedVoice ? 'En Pausa' : 'Reproduciendo...'}
                  </span>
                )}
              </h4>
              <p className="text-[10px] text-slate-500">
                Escucha el resumen o la transcripción completa del documento digitalizado.
              </p>
            </div>
          </div>

          {/* Config Controls */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Scope selection */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">¿Qué deseas escuchar?</span>
              <select
                value={narrationMode}
                onChange={(e) => {
                  setNarrationMode(e.target.value as any);
                  if (isPlayingVoice) {
                    toast.info('Se aplicará el nuevo contenido seleccionado para la siguiente lectura');
                  }
                }}
                className="bg-white border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 cursor-pointer transition-all font-semibold"
              >
                <option value="summary">Resumen Ejecutivo</option>
                <option value="detailed">Resumen + Ficha de Datos</option>
                <option value="all">Documento Completo Narrado</option>
              </select>
            </div>

            {/* Vocal Accent / Voice selection */}
            {availableVoices.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Voz y Acento</span>
                <select
                  value={selectedVoice}
                  onChange={(e) => {
                    setSelectedVoice(e.target.value);
                    if (isPlayingVoice) {
                      toast.info('La nueva voz se aplicará para la siguiente lectura');
                    }
                  }}
                  className="bg-white border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 cursor-pointer transition-all font-semibold max-w-[180px] truncate"
                >
                  {availableVoices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name.replace('Microsoft', 'MS').replace('Google', '')} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Reading Speed */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 flex justify-between gap-2">
                <span>Velocidad</span>
                <span className="text-indigo-600 font-extrabold">{voiceRate.toFixed(1)}x</span>
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="range"
                  min="0.6"
                  max="1.8"
                  step="0.1"
                  value={voiceRate}
                  onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                  className="w-20 accent-indigo-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Player Buttons */}
            <div className="flex items-center gap-1.5 lg:ml-2">
              {!isPlayingVoice || isPausedVoice ? (
                <button
                  type="button"
                  onClick={handleStartSpeaking}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer shadow-sm shadow-indigo-100 transition-all text-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Escuchar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePauseSpeaking}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl cursor-pointer shadow-sm shadow-amber-100 transition-all text-xs"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pausar</span>
                </button>
              )}

              {isPlayingVoice && (
                <button
                  type="button"
                  onClick={handleStopSpeaking}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold rounded-xl cursor-pointer transition-all text-xs"
                >
                  <Square className="w-3.5 h-3.5 fill-current text-slate-500" />
                  <span>Detener</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs list switcher */}
      <div className="flex border-b border-slate-100 pb-px gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('structured')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
            activeTab === 'structured'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Table className="w-4 h-4" />
          Tabla de Datos
        </button>
        
        <button
          onClick={() => setActiveTab('markdown')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
            activeTab === 'markdown'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <FileText className="w-4 h-4" />
          Documento Plano
        </button>

        <button
          onClick={() => setActiveTab('token-stats')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 ${
            activeTab === 'token-stats'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Cpu className="w-4 h-4 text-indigo-500" />
          Consumo y Prompt
        </button>

        <button
          onClick={() => setActiveTab('assistant')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer shrink-0 relative ${
            activeTab === 'assistant'
              ? 'border-indigo-600 text-indigo-600 font-extrabold'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          Asistente de Consulta
          <span className="absolute top-1 right-2 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
        </button>
      </div>

      {/* Content wrapper */}
      <div className="pt-2">
        {activeTab === 'structured' && (
          <div className="border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100">
            {data.details && data.details.length > 0 ? (
              data.details.map((detail, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row p-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="sm:w-1/3 pr-4 pb-1 sm:pb-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {detail.label}
                    </span>
                  </div>
                  <div className="sm:w-2/3">
                    <span className="text-sm font-semibold text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {detail.value}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">
                No hay datos específicos estructurados disponibles para este archivo.
              </div>
            )}
          </div>
        )}

        {activeTab === 'markdown' && (
          <div className="prose prose-slate prose-sm max-w-none p-5 bg-slate-50 rounded-xl border border-slate-100">
            <ReactMarkdown className="leading-relaxed whitespace-pre-line text-slate-700">
              {data.rawMarkdown}
            </ReactMarkdown>
          </div>
        )}

        {activeTab === 'token-stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entrada (Prompt)</span>
                <p className="text-2xl font-extrabold text-slate-900">{data.tokenStats?.promptTokens ?? 'N/A'}</p>
                <p className="text-[11px] text-slate-400">Tokens enviados con la captura y la instrucción.</p>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Salida (Respuesta)</span>
                <p className="text-2xl font-extrabold text-slate-900">{data.tokenStats?.completionTokens ?? 'N/A'}</p>
                <p className="text-[11px] text-slate-400">Tokens consumidos por la estructura JSON.</p>
              </div>
              <div className="p-4 bg-indigo-50 border border-indigo-100/60 rounded-xl space-y-1">
                <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Total de Tokens</span>
                <p className="text-2xl font-extrabold text-indigo-950">{data.tokenStats?.totalTokens ?? 'N/A'}</p>
                <p className="text-[11px] text-indigo-600/80">Suma total consumida en el modelo activo.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-700">
                  <Terminal className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-bold text-slate-800">Prompt de la API</span>
                </div>
                {data.promptSent && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(data.promptSent || '');
                      toast.success('¡Prompt copiado al portapapeles!');
                    }}
                    className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-600 font-bold text-[10px] uppercase tracking-wider px-2.5 py-1.5 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                  >
                    Copiar Prompt
                  </button>
                )}
              </div>
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-y-auto max-h-[300px] leading-relaxed whitespace-pre-wrap select-text border border-slate-800">
                {data.promptSent || 'No hay prompt registrado para esta digitalización previa.'}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assistant' && (
          <div className="flex flex-col h-[500px] border border-slate-150 rounded-2xl bg-slate-50 overflow-hidden">
            {/* Assistant Chat Header */}
            <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Asistente Inteligente DocuDigit</h3>
                  <p className="text-[10px] text-slate-400">Analizando el documento actual</p>
                </div>
              </div>
              
              {activeDocMessages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChatHistory}
                  title="Borrar conversación"
                  className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer transition-all border-none"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeDocMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl animate-bounce text-indigo-600">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <p className="text-sm font-extrabold text-slate-800">¡Hola! Soy tu asistente de DocuDigit</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Pregúntame cualquier dato sobre <strong>{data.title}</strong>. Puedo calcular subtotales, resumir cláusulas, buscar nombres, fechas o contrastar datos.
                    </p>
                  </div>

                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-md">
                    {[
                      { text: '📝 Hazme un resumen detallado', label: 'Resumen' },
                      { text: '💰 ¿Hay montos, precios o totales?', label: 'Analizar montos' },
                      { text: '📅 ¿Qué fechas importantes contiene?', label: 'Fechas clave' },
                      { text: '🔎 ¿Quiénes son los firmantes o clientes?', label: 'Buscar firmantes' }
                    ].map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendChatMessage(chip.text)}
                        className="px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-xs font-semibold rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        {chip.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Fixed initial welcoming bubble */}
                  <div className="flex items-start gap-2.5 max-w-[85%]">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-white border border-slate-150 p-3 rounded-2xl rounded-tl-none shadow-sm space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Asistente DocuDigit</span>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        He estudiado el documento <strong>{data.title}</strong>. ¿Qué deseas saber o verificar sobre él?
                      </p>
                    </div>
                  </div>

                  {activeDocMessages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-2.5 max-w-[85%] ${
                          isUser ? 'ml-auto flex-row-reverse' : ''
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isUser
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-indigo-50 border border-indigo-100 text-indigo-600'
                          }`}
                        >
                          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                        <div
                          className={`p-3 rounded-2xl shadow-sm space-y-1 ${
                            isUser
                              ? 'bg-slate-900 text-slate-50 rounded-tr-none'
                              : 'bg-white border border-slate-150 rounded-tl-none text-slate-800'
                          }`}
                        >
                          <span
                            className={`text-[9px] uppercase font-bold tracking-wider block ${
                              isUser ? 'text-indigo-300 text-right' : 'text-slate-400'
                            }`}
                          >
                            {isUser ? 'Tú' : 'Asistente'}
                          </span>
                          <div className={`text-xs leading-relaxed prose prose-sm max-w-none ${isUser ? 'text-slate-100' : 'text-slate-700'}`}>
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {isAssistantLoading && (
                <div className="flex items-start gap-2.5 max-w-[85%] animate-pulse">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                  </div>
                  <div className="bg-white border border-slate-150 p-3 rounded-2xl rounded-tl-none shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Pensando</span>
                    <div className="flex gap-1 py-1">
                      <span className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce"></span>
                      <span className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage(inputVal);
              }}
              className="bg-white border-t border-slate-100 p-3 flex gap-2 items-center"
            >
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={`Pregunta algo sobre "${data.title}"...`}
                disabled={isAssistantLoading}
                className="flex-1 px-4 py-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-300 text-xs text-slate-800 rounded-xl outline-none transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputVal.trim() || isAssistantLoading}
                className="p-2 sm:px-4 sm:py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 text-white disabled:text-slate-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
