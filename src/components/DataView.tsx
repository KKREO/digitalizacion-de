import ReactMarkdown from 'react-markdown';
import { Copy, Download, FileText, Table, Check, Cpu, Terminal } from 'lucide-react';
import { useState } from 'react';
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

export function DataView({ data }: DataViewProps) {
  const [activeTab, setActiveTab] = useState<'structured' | 'markdown' | 'token-stats'>('structured');
  const [copied, setCopied] = useState(false);

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
      </div>
    </div>
  );
}
