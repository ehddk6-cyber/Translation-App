import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  FileText, 
  Languages, 
  Download, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  X,
  Settings2,
  ChevronRight,
  Copy,
  FileDown,
  RefreshCw,
  Eye,
  Columns,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { cn } from './lib/utils';
import { 
  parseSubtitleContent, 
  translateSubtitles, 
  reassembleSubtitles, 
  SubtitleBlock, 
  TranslationOptions, 
  DEFAULT_PROMPT,
  NOCTURNE_SYSTEM_PROMPT 
} from './services/subtitleService';

const LANGUAGES = [
  { code: 'auto', name: 'Auto Detect' },
  { code: 'ko', name: 'Korean' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
];

const MODES = [
  { id: 'literal', name: 'Literal (직역)', desc: '원문의 구조를 최대한 유지' },
  { id: 'natural', name: 'Natural (자연 번역)', desc: '문맥에 맞는 자연스러운 표현' },
  { id: 'optimized', name: 'Optimized (자막 최적화)', desc: '가독성과 길이 최적화' },
];

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello, welcome to our AI Subtitle Architect.

2
00:00:04,500 --> 00:00:07,000
This tool helps you translate subtitles professionally.

3
00:00:07,500 --> 00:00:10,000
Enjoy the seamless translation experience!`;

interface SubtitleFile {
  id: string;
  name: string;
  content: string;
  ext: string;
  blocks: SubtitleBlock[];
  translatedBlocks: SubtitleBlock[];
  status: 'idle' | 'translating' | 'completed' | 'error';
  progress: number;
  error?: string;
}

export default function App() {
  const [files, setFiles] = useState<SubtitleFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [options, setOptions] = useState<TranslationOptions>({
    sourceLang: 'auto',
    targetLang: 'ko',
    mode: 'natural',
    customPrompt: NOCTURNE_SYSTEM_PROMPT,
    keepSpeakerNames: true,
    translateSoundEffects: true,
  });
  
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'source' | 'translated' | 'compare'>('translated');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFilesPromises = acceptedFiles.map(selectedFile => {
      return new Promise<SubtitleFile>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'txt';
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            name: selectedFile.name,
            content,
            ext,
            blocks: parseSubtitleContent(content, ext),
            translatedBlocks: [],
            status: 'idle',
            progress: 0
          });
        };
        reader.readAsText(selectedFile);
      });
    });

    Promise.all(newFilesPromises).then(newFiles => {
      setFiles(prev => {
        const updated = [...prev, ...newFiles];
        if (selectedFileIndex === null && updated.length > 0) {
          setSelectedFileIndex(prev.length);
        }
        return updated;
      });
      showNotification(`${newFiles.length} files uploaded successfully.`);
    });
  }, [selectedFileIndex]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.srt', '.vtt', '.txt'],
    },
    multiple: true
  } as any);

  const translateFile = async (index: number) => {
    const file = files[index];
    if (!file || file.blocks.length === 0) return;

    setFiles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'translating', progress: 0, error: undefined };
      return next;
    });

    try {
      const result = await translateSubtitles(file.blocks, options, (p) => {
        setFiles(prev => {
          const next = [...prev];
          next[index] = { ...next[index], progress: p };
          return next;
        });
      });
      
      setFiles(prev => {
        const next = [...prev];
        next[index] = { ...next[index], translatedBlocks: result, status: 'completed' };
        return next;
      });
    } catch (err: any) {
      console.error(err);
      setFiles(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'error', error: err.message || "Translation failed." };
        return next;
      });
    }
  };

  const handleTranslateAll = async () => {
    setIsTranslatingAll(true);
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'completed') {
        await translateFile(i);
      }
    }
    setIsTranslatingAll(false);
    setActiveTab('translated');
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      if (selectedFileIndex !== null && selectedFileIndex >= filtered.length) {
        setSelectedFileIndex(filtered.length > 0 ? filtered.length - 1 : null);
      }
      return filtered;
    });
  };

  const handleReset = () => {
    setFiles([]);
    setSelectedFileIndex(null);
  };

  const handleDownload = (index: number, format: 'srt' | 'txt') => {
    const file = files[index];
    if (!file || file.translatedBlocks.length === 0) return;
    const content = reassembleSubtitles(file.translatedBlocks, format);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const targetLangName = LANGUAGES.find(l => l.code === options.targetLang)?.name || options.targetLang;
    a.href = url;
    a.download = `${file.name.replace(/\.[^/.]+$/, "")}.${targetLangName}.translated.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = (index: number) => {
    const file = files[index];
    if (!file || file.translatedBlocks.length === 0) return;
    const content = reassembleSubtitles(file.translatedBlocks, file.ext as any || 'srt');
    navigator.clipboard.writeText(content);
    showNotification("Copied to clipboard!");
  };

  const handleDownloadAll = async () => {
    const completedFiles = files.filter(f => f.status === 'completed');
    if (completedFiles.length === 0) {
      showNotification("No completed translations to download.", "error");
      return;
    }

    const zip = new JSZip();
    const targetLangName = LANGUAGES.find(l => l.code === options.targetLang)?.name || options.targetLang;

    completedFiles.forEach(f => {
      const content = reassembleSubtitles(f.translatedBlocks, f.ext as any || 'srt');
      const fileName = `${f.name.replace(/\.[^/.]+$/, "")}.${targetLangName}.translated.${f.ext}`;
      zip.file(fileName, content);
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `translated_subtitles_${new Date().getTime()}.zip`);
    showNotification(`Downloaded ${completedFiles.length} files as ZIP.`);
  };

  const loadSample = () => {
    const newFile: SubtitleFile = {
      id: "sample-" + Date.now(),
      name: "sample.srt",
      content: SAMPLE_SRT,
      ext: "srt",
      blocks: parseSubtitleContent(SAMPLE_SRT, "srt"),
      translatedBlocks: [],
      status: 'idle',
      progress: 0
    };
    setFiles(prev => {
      const updated = [...prev, newFile];
      setSelectedFileIndex(updated.length - 1);
      return updated;
    });
  };

  const currentFile = selectedFileIndex !== null ? files[selectedFileIndex] : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Languages className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">AI Subtitle Architect</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Professional Translation Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={loadSample}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Info className="w-4 h-4" />
              Load Sample
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel: Controls */}
        <div className="lg:col-span-4 space-y-6">
          {/* Upload Area */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4" /> 1. Upload Subtitles
            </h2>
            
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-4",
                isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-600 font-semibold text-sm">Drag & drop subtitle files</p>
              <p className="text-slate-400 text-[10px] mt-1">Supports .srt, .vtt, .txt</p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                {files.map((f, idx) => (
                  <div 
                    key={f.id} 
                    onClick={() => setSelectedFileIndex(idx)}
                    className={cn(
                      "flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-all group",
                      selectedFileIndex === idx 
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" 
                        : "border-slate-100 bg-slate-50 hover:border-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        f.status === 'completed' ? "bg-emerald-100 text-emerald-600" : "bg-indigo-100 text-indigo-600"
                      )}>
                        {f.status === 'translating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="overflow-hidden">
                        <p className={cn("text-xs font-bold truncate", selectedFileIndex === idx ? "text-indigo-900" : "text-slate-800")}>{f.name}</p>
                        <p className="text-[9px] text-slate-500 font-mono uppercase">
                          {f.status === 'translating' ? `Translating ${f.progress}%` : `${f.ext} • ${f.blocks.length} blocks`}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(f.id);
                      }} 
                      className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Options Area */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> 2. Translation Options
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 ml-1">Source Language</label>
                <select 
                  value={options.sourceLang}
                  onChange={(e) => setOptions(prev => ({ ...prev, sourceLang: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 ml-1">Target Language</label>
                <select 
                  value={options.targetLang}
                  onChange={(e) => setOptions(prev => ({ ...prev, targetLang: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                >
                  {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 ml-1">Translation Mode</label>
              <div className="grid grid-cols-1 gap-2">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setOptions(prev => ({ ...prev, mode: m.id as any }))}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-xl border text-left transition-all",
                      options.mode === m.id 
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" 
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    )}
                  >
                    <span className={cn("text-sm font-bold", options.mode === m.id ? "text-indigo-700" : "text-slate-700")}>{m.name}</span>
                    <span className="text-[10px] text-slate-500">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 ml-1">Custom Prompt</label>
              <textarea 
                value={options.customPrompt}
                onChange={(e) => setOptions(prev => ({ ...prev, customPrompt: e.target.value }))}
                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
              />
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={options.keepSpeakerNames}
                  onChange={(e) => setOptions(prev => ({ ...prev, keepSpeakerNames: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Keep Speaker Names (e.g. [Name]:)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={options.translateSoundEffects}
                  onChange={(e) => setOptions(prev => ({ ...prev, translateSoundEffects: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">Translate Sound Effects (e.g. (Music))</span>
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleTranslateAll}
                disabled={files.length === 0 || isTranslatingAll}
                className={cn(
                  "flex-1 py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg",
                  files.length === 0 || isTranslatingAll
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-indigo-200"
                )}
              >
                {isTranslatingAll ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Translating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Translate All
                  </>
                )}
              </button>
              <button 
                onClick={handleReset}
                className="px-4 py-4 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </section>
        </div>

        {/* Right Panel: Results */}
        <div className="lg:col-span-8 flex flex-col min-h-[600px]">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden">
            {/* Tabs & Actions */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex bg-slate-200/50 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveTab('source')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'source' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Eye className="w-3.5 h-3.5" /> Source
                </button>
                <button 
                  onClick={() => setActiveTab('translated')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'translated' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Translated
                </button>
                <button 
                  onClick={() => setActiveTab('compare')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                    activeTab === 'compare' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Columns className="w-3.5 h-3.5" /> Compare
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => selectedFileIndex !== null && handleCopy(selectedFileIndex)}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-30"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button 
                  onClick={() => selectedFileIndex !== null && handleDownload(selectedFileIndex, 'srt')}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all text-xs font-bold disabled:opacity-30"
                >
                  <FileDown className="w-3.5 h-3.5" /> .SRT
                </button>
                <button 
                  onClick={() => selectedFileIndex !== null && handleDownload(selectedFileIndex, 'txt')}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-all text-xs font-bold disabled:opacity-30"
                >
                  <FileText className="w-3.5 h-3.5" /> .TXT
                </button>
                {files.some(f => f.status === 'completed') && (
                  <button 
                    onClick={handleDownloadAll}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-xs font-bold shadow-sm shadow-indigo-200"
                    title="Download all completed as ZIP"
                  >
                    <Download className="w-3.5 h-3.5" /> All (ZIP)
                  </button>
                )}
              </div>
            </div>

            {/* Content View */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait">
                {!currentFile && (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                      <FileText className="w-10 h-10 text-slate-200" />
                    </div>
                    <h3 className="text-slate-400 font-bold mb-2">No Subtitles Loaded</h3>
                    <p className="text-slate-300 text-sm max-w-xs">Upload files or load the sample to start the translation process.</p>
                  </motion.div>
                )}

                {currentFile && currentFile.status === 'translating' && (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="relative mb-8">
                      <div className="w-24 h-24 border-4 border-indigo-100 rounded-full" />
                      <div className="w-24 h-24 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-indigo-600">{currentFile.progress}%</span>
                      </div>
                    </div>
                    <h3 className="text-slate-800 font-bold text-xl mb-2">Architecting Translation...</h3>
                    <p className="text-slate-500 text-sm">Processing "{currentFile.name}" using Gemini AI.</p>
                  </motion.div>
                )}

                {currentFile && currentFile.status === 'error' && (
                  <motion.div 
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
                      <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="text-red-600 font-bold text-lg mb-2">Translation Error</h3>
                    <p className="text-red-400 text-sm max-w-md">{currentFile.error}</p>
                    <button 
                      onClick={() => selectedFileIndex !== null && translateFile(selectedFileIndex)}
                      className="mt-6 px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all"
                    >
                      Retry
                    </button>
                  </motion.div>
                )}

                {currentFile && (currentFile.status === 'completed' || currentFile.status === 'idle') && (
                  <motion.div 
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200"
                  >
                    {activeTab === 'compare' ? (
                      <div className="space-y-4">
                        {currentFile.blocks.map((block, i) => (
                          <div key={block.id} className="grid grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                                <span className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">{block.index || i+1}</span>
                                <span>{block.timestamp}</span>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed">{block.originalText}</p>
                            </div>
                            <div className="space-y-2 border-l border-slate-200 pl-6">
                              <div className="flex items-center gap-2 text-[10px] font-mono text-indigo-400">
                                <span className="bg-indigo-100 px-1.5 py-0.5 rounded text-indigo-600">TRANSLATED</span>
                              </div>
                              <p className="text-sm text-slate-900 font-medium leading-relaxed">
                                {currentFile.translatedBlocks[i]?.text || "..."}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs leading-relaxed text-slate-300 min-h-full">
                        <pre className="whitespace-pre-wrap">
                          {activeTab === 'source' 
                            ? reassembleSubtitles(currentFile.blocks, currentFile.ext as any || 'srt')
                            : reassembleSubtitles(currentFile.translatedBlocks.length > 0 ? currentFile.translatedBlocks : currentFile.blocks, currentFile.ext as any || 'srt')
                          }
                        </pre>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center gap-4">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        <div className="flex items-center gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
          <span>© 2026 AI Subtitle Architect</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span>Powered by Gemini 3 Flash</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span>v1.0.0</span>
        </div>
      </footer>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl z-[100] flex items-center gap-3 font-bold text-sm",
              notification.type === 'success' ? "bg-slate-900 text-white" : "bg-red-600 text-white"
            )}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5" />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
