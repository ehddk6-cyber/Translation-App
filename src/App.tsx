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
    <div className="min-h-screen bg-surface text-on-surface font-sans overflow-x-hidden">
      {/* Header */}
      <header className="flex justify-between items-center w-full px-8 py-6 sticky top-0 z-50 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold tracking-tighter text-primary font-headline">Architect Editor</div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={loadSample}
            className="text-xs font-bold font-headline uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <Info className="w-4 h-4" />
            Load Sample
          </button>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-8 lg:px-16 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Panel: Controls */}
        <div className="lg:col-span-4 bg-surface-container-low rounded-xl p-8 flex flex-col gap-8">
          <div>
            <span className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-primary mb-4 block">The Workflow</span>
            <h3 className="text-3xl font-headline font-bold text-primary mb-2">Configuration</h3>
            <p className="text-on-surface-variant text-sm">Upload and configure your translation stack.</p>
          </div>

          {/* Upload Area */}
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
            <h2 className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-on-surface-variant mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4" /> 1. Upload
            </h2>
            
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-4",
                isDragActive ? "border-primary bg-primary/5" : "border-outline-variant/30 hover:border-primary/50 hover:bg-surface-container-low"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 text-outline-variant mx-auto mb-2" />
              <p className="text-primary font-semibold text-sm">Drag & drop subtitle files</p>
              <p className="text-on-surface-variant text-[10px] mt-1">Supports .srt, .vtt, .txt</p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-surface-container-high">
                {files.map((f, idx) => (
                  <div 
                    key={f.id} 
                    onClick={() => setSelectedFileIndex(idx)}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all group",
                      selectedFileIndex === idx 
                        ? "bg-primary/5 ring-1 ring-primary/20" 
                        : "bg-surface-container-low hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        f.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                      )}>
                        {f.status === 'translating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="overflow-hidden">
                        <p className={cn("text-xs font-bold truncate", selectedFileIndex === idx ? "text-primary" : "text-on-surface")}>{f.name}</p>
                        <p className="text-[9px] text-on-surface-variant font-mono uppercase">
                          {f.status === 'translating' ? `Translating ${f.progress}%` : `${f.ext} • ${f.blocks.length} blocks`}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(f.id);
                      }} 
                      className="p-1.5 hover:bg-surface-container-highest rounded-full text-on-surface-variant opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Options Area */}
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-6">
            <h2 className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-on-surface-variant mb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> 2. Options
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant ml-1">Source</label>
                <select 
                  value={options.sourceLang}
                  onChange={(e) => setOptions(prev => ({ ...prev, sourceLang: e.target.value }))}
                  className="w-full bg-surface-container-low rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/20 transition-all border-none"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant ml-1">Target</label>
                <select 
                  value={options.targetLang}
                  onChange={(e) => setOptions(prev => ({ ...prev, targetLang: e.target.value }))}
                  className="w-full bg-surface-container-low rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/20 transition-all border-none"
                >
                  {LANGUAGES.filter(l => l.code !== 'auto').map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant ml-1">Mode</label>
              <div className="grid grid-cols-1 gap-2">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setOptions(prev => ({ ...prev, mode: m.id as any }))}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-lg text-left transition-all",
                      options.mode === m.id 
                        ? "bg-primary/5 ring-1 ring-primary/20" 
                        : "bg-surface-container-low hover:bg-surface-container-high"
                    )}
                  >
                    <span className={cn("text-sm font-bold", options.mode === m.id ? "text-primary" : "text-on-surface")}>{m.name}</span>
                    <span className="text-[10px] text-on-surface-variant">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant ml-1">Prompt</label>
              <textarea 
                value={options.customPrompt}
                onChange={(e) => setOptions(prev => ({ ...prev, customPrompt: e.target.value }))}
                className="w-full h-32 bg-surface-container-low rounded-lg px-4 py-3 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary/20 transition-all resize-none border-none"
              />
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={options.keepSpeakerNames}
                  onChange={(e) => setOptions(prev => ({ ...prev, keepSpeakerNames: e.target.checked }))}
                  className="w-4 h-4 rounded border-outline-variant/50 text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">Keep Speaker Names (e.g. [Name]:)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={options.translateSoundEffects}
                  onChange={(e) => setOptions(prev => ({ ...prev, translateSoundEffects: e.target.checked }))}
                  className="w-4 h-4 rounded border-outline-variant/50 text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">Translate Sound Effects (e.g. (Music))</span>
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleTranslateAll}
                disabled={files.length === 0 || isTranslatingAll}
                className={cn(
                  "flex-1 py-4 rounded-lg font-bold text-xs font-headline uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                  files.length === 0 || isTranslatingAll
                    ? "bg-surface-container-high text-on-surface-variant cursor-not-allowed"
                    : "bg-gradient-to-br from-primary to-primary-container text-on-primary hover:shadow-[0_0_20px_rgba(0,7,42,0.2)] active:scale-[0.98]"
                )}
              >
                {isTranslatingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Translating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Translate All
                  </>
                )}
              </button>
              <button 
                onClick={handleReset}
                className="px-4 py-4 bg-surface-container-high text-on-surface-variant rounded-lg hover:bg-surface-container-highest transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </section>
        </div>

        {/* Right Panel: Results */}
        <div className="lg:col-span-8 flex flex-col min-h-[800px]">
          <section className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(0,7,42,0.04),0_12px_40px_rgba(0,7,42,0.08)] flex flex-col flex-1 overflow-hidden">
            {/* Tabs & Actions */}
            <div className="px-8 py-6 border-b border-surface-container-low flex items-center justify-between">
              <div className="flex bg-surface-container-low p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('source')}
                  className={cn(
                    "px-4 py-2 rounded-md text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-2",
                    activeTab === 'source' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  <Eye className="w-3.5 h-3.5" /> Source
                </button>
                <button 
                  onClick={() => setActiveTab('translated')}
                  className={cn(
                    "px-4 py-2 rounded-md text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-2",
                    activeTab === 'translated' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Translated
                </button>
                <button 
                  onClick={() => setActiveTab('compare')}
                  className={cn(
                    "px-4 py-2 rounded-md text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-2",
                    activeTab === 'compare' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  <Columns className="w-3.5 h-3.5" /> Compare
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => selectedFileIndex !== null && handleCopy(selectedFileIndex)}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-lg transition-all disabled:opacity-30"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-surface-container-high mx-1" />
                <button 
                  onClick={() => selectedFileIndex !== null && handleDownload(selectedFileIndex, 'srt')}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-low text-primary rounded-lg hover:bg-surface-container-high transition-all text-[10px] font-bold tracking-widest uppercase disabled:opacity-30"
                >
                  <FileDown className="w-3.5 h-3.5" /> .SRT
                </button>
                <button 
                  onClick={() => selectedFileIndex !== null && handleDownload(selectedFileIndex, 'txt')}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-low text-primary rounded-lg hover:bg-surface-container-high transition-all text-[10px] font-bold tracking-widest uppercase disabled:opacity-30"
                >
                  <FileText className="w-3.5 h-3.5" /> .TXT
                </button>
                {files.some(f => f.status === 'completed') && (
                  <button 
                    onClick={handleDownloadAll}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-all text-[10px] font-bold tracking-widest uppercase shadow-sm"
                    title="Download all completed as ZIP"
                  >
                    <Download className="w-3.5 h-3.5" /> All (ZIP)
                  </button>
                )}
              </div>
            </div>

            {/* Content View */}
            <div className="flex-1 overflow-hidden relative bg-surface-container-lowest">
              <AnimatePresence mode="wait">
                {!currentFile && (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-20 h-20 bg-surface-container-low rounded-full flex items-center justify-center mb-6">
                      <FileText className="w-10 h-10 text-outline-variant" />
                    </div>
                    <h3 className="text-3xl font-headline font-bold text-primary mb-4">No Subtitles Loaded</h3>
                    <p className="text-on-surface-variant text-sm max-w-md leading-relaxed">Upload files or load the sample to start the translation process. The Architect Editor maintains absolute legibility and structural integrity.</p>
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
                      <div className="w-24 h-24 border-4 border-surface-container-high rounded-full" />
                      <div className="w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">{currentFile.progress}%</span>
                      </div>
                    </div>
                    <h3 className="text-3xl font-headline font-bold text-primary mb-4">Architecting Translation...</h3>
                    <p className="text-on-surface-variant text-sm">Processing "{currentFile.name}" with extreme precision.</p>
                  </motion.div>
                )}

                {currentFile && currentFile.status === 'error' && (
                  <motion.div 
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-16 h-16 bg-error-container rounded-full flex items-center justify-center mb-6">
                      <AlertCircle className="w-8 h-8 text-error" />
                    </div>
                    <h3 className="text-error font-headline font-bold text-2xl mb-4">Translation Error</h3>
                    <p className="text-on-surface-variant text-sm max-w-md mb-8">{currentFile.error}</p>
                    <button 
                      onClick={() => selectedFileIndex !== null && translateFile(selectedFileIndex)}
                      className="px-8 py-3 bg-primary text-on-primary rounded-lg font-bold text-xs font-headline uppercase tracking-widest hover:bg-primary-container transition-all"
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
                    className="h-full overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-surface-container-high"
                  >
                    {activeTab === 'compare' ? (
                      <div className="space-y-8">
                        {currentFile.blocks.map((block, i) => (
                          <div key={block.id} className="flex gap-8 items-start relative group">
                            <div className="absolute -left-8 top-0 bottom-0 w-1 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="w-24 shrink-0 pt-1">
                              <div className="text-[10px] font-mono text-on-surface-variant font-bold">{block.timestamp?.split(' --> ')[0]}</div>
                              <div className="text-[10px] font-mono text-outline-variant">{block.timestamp?.split(' --> ')[1]}</div>
                            </div>
                            <div className="flex-1 space-y-4">
                              <div className="bg-surface-container-low p-5 rounded-xl text-sm text-on-surface-variant leading-relaxed">
                                {block.originalText}
                              </div>
                              <div className="bg-surface-container-lowest p-5 rounded-xl text-sm text-primary font-medium leading-relaxed shadow-sm ring-1 ring-primary/5">
                                {currentFile.translatedBlocks[i]?.text || "..."}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-surface-container-low rounded-xl p-8 font-mono text-sm leading-relaxed text-on-surface min-h-full">
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

      <footer className="bg-primary py-16 px-8 text-center border-t border-white/5 mt-12">
        <div className="text-on-primary-container font-headline font-black text-2xl tracking-tighter mb-4">Architect Editor</div>
        <p className="text-on-primary/60 text-xs font-medium tracking-widest uppercase">Premium Tier Workstation © 2026</p>
      </footer>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-xl shadow-[0_12px_40px_rgba(0,7,42,0.12)] z-[100] flex items-center gap-4 font-bold text-xs font-headline tracking-widest uppercase",
              notification.type === 'success' ? "bg-primary text-on-primary" : "bg-error text-on-error"
            )}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-on-primary-container" /> : <AlertCircle className="w-5 h-5" />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
