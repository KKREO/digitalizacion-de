import { History, Trash2, Clock, ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';

// Define the ExtractedData interface inside to make it completely self-contained
export interface ExtractedData {
  id?: string;
  timestamp?: number;
  title: string;
  summary: string;
  details: { label: string; value: string }[];
  rawMarkdown: string;
}

interface HistorySidebarProps {
  history: ExtractedData[];
  onSelectItem: (item: ExtractedData) => void;
  onDeleteItem: (id: string) => void;
  onClearHistory: () => void;
  activeId?: string;
}

export function HistorySidebar({
  history,
  onSelectItem,
  onDeleteItem,
  onClearHistory,
  activeId
}: HistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredHistory = history.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-slate-500" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">Historial Local</h3>
        </div>
        {history.length > 0 && (
          <button 
            onClick={onClearHistory} 
            className="text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
          >
            Borrar Todo
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="p-3 border-b border-slate-100">
          <input
            type="text"
            placeholder="Buscar en el historial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 bg-slate-50/50"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {filteredHistory.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-2 h-[200px]">
            <Clock className="w-8 h-8 text-slate-300 stroke-[1.5]" />
            <p className="text-xs text-slate-400">
              {searchQuery ? 'No se encontraron coincidencias' : 'No hay documentos guardados'}
            </p>
          </div>
        ) : (
          <div className="p-1.5 space-y-1">
            {filteredHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectItem(item)}
                className={`group flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                  activeId === item.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'text-slate-700 bg-white hover:bg-slate-50 border-transparent'
                }`}
              >
                <div className={`p-1.5 rounded-lg shrink-0 ${activeId === item.id ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <FileText className="w-4 h-4 text-slate-500 group-hover:text-slate-700" />
                </div>
                
                <div className="flex-1 min-w-0 pr-1">
                  <p className={`text-sm font-semibold truncate ${activeId === item.id ? 'text-white' : 'text-slate-800'}`}>
                    {item.title}
                  </p>
                  <p className={`text-xs truncate ${activeId === item.id ? 'text-slate-300' : 'text-slate-500'}`}>
                    {item.summary}
                  </p>
                  <p className={`text-[10px] mt-1 ${activeId === item.id ? 'text-slate-400' : 'text-slate-400'}`}>
                    {item.timestamp ? new Date(item.timestamp).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : ''}
                  </p>
                </div>

                <div className="shrink-0 self-center flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.id) onDeleteItem(item.id);
                    }}
                    className={`p-1 rounded-lg hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                      activeId === item.id ? 'text-slate-400 hover:bg-rose-950/20' : 'text-slate-400'
                    }`}
                    title="Eliminar del historial"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <ChevronRight className={`w-4 h-4 shrink-0 opacity-40 ${activeId === item.id ? 'text-white' : 'text-slate-400'}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
