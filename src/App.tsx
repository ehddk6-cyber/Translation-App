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
  DEFAULT_PROMPT
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

const FILE_TRANSLATION_CONCURRENCY = 2;

export default function App() {
  const [files, setFiles] = useState<SubtitleFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [options, setOptions] = useState<TranslationOptions>({
    sourceLang: 'ja',
    targetLang: 'ko',
    mode: 'natural',
    customPrompt: DEFAULT_PROMPT,
    keepSpeakerNames: true,
    translateSoundEffects: true,
  });
  
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'source' | 'translated' | 'compare'>('translated');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const completedCount = files.filter((file) => file.status === 'completed').length;
  const translatingCount = files.filter((file) => file.status === 'translating').length;
  const pendingCount = files.filter((file) => file.status === 'idle').length;
  const totalBlocks = files.reduce((sum, file) => sum + file.blocks.length, 0);
  const sourceLanguageLabel = LANGUAGES.find((language) => language.code === options.sourceLang)?.name || options.sourceLang;
  const targetLanguageLabel = LANGUAGES.find((language) => language.code === options.targetLang)?.name || options.targetLang;
  const currentMode = MODES.find((mode) => mode.id === options.mode);

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
    try {
      const pendingIndexes = files
        .map((file, index) => ({ file, index }))
        .filter(({ file }) => file.status !== 'completed')
        .map(({ index }) => index);

      for (let i = 0; i < pendingIndexes.length; i += FILE_TRANSLATION_CONCURRENCY) {
        const batch = pendingIndexes.slice(i, i + FILE_TRANSLATION_CONCURRENCY);
        await Promise.all(batch.map((index) => translateFile(index)));
      }

      setActiveTab('translated');
    } finally {
      setIsTranslatingAll(false);
    }
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
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(222,98,72,0.18),_transparent_70%)]" />
        <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(27,43,89,0.16),_transparent_72%)]" />
        <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(209,181,111,0.14),_transparent_74%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-outline-variant/30 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-[0_14px_32px_rgba(27,43,89,0.2)]">
              <Languages className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-accent">Translation-App</div>
              <div className="font-headline text-2xl font-bold tracking-tight text-primary">Japanese Subtitle Control Room</div>
            </div>
          </div>
          <button
            onClick={loadSample}
            className="inline-flex items-center gap-2 rounded-full border border-primary/12 bg-surface-container-low px-4 py-2 text-[0.7rem] font-bold uppercase tracking-[0.24em] text-primary transition hover:border-primary/30 hover:bg-surface-container-high"
          >
            <Info className="h-4 w-4" />
            Load Sample
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1480px] flex-col gap-10 px-6 py-8 lg:px-10 lg:py-10">
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.7fr]">
          <div className="rounded-[2rem] border border-outline-variant/35 bg-surface-container-lowest p-7 shadow-[0_24px_80px_rgba(27,43,89,0.08)] lg:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-accent-soft px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.24em] text-accent">Session overview</span>
              <span className="rounded-full border border-outline-variant/40 px-4 py-2 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
                {sourceLanguageLabel} to {targetLanguageLabel}
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <h1 className="font-headline text-[2.35rem] font-bold leading-[1.02] tracking-tight text-primary lg:text-[3.25rem]">
                  Japanese subtitle workspace
                </h1>
                <p className="mt-3 text-sm leading-7 text-on-surface-variant">
                  업로드, 번역, 검수, 내려받기 흐름을 한 화면 안에서 관리하는 작업 표면입니다. 현재 큐 상태와 번역 프로필이 상단에 고정되어 있어 진행 상황을 즉시 판단할 수 있습니다.
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-outline-variant/30 bg-surface px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Lane status</div>
                <div className="mt-2 flex items-center gap-3">
                  <span className={cn("h-2.5 w-2.5 rounded-full", translatingCount > 0 ? "bg-accent" : "bg-emerald-500")} />
                  <span className="font-headline text-2xl font-bold text-primary">{translatingCount > 0 ? "Active" : "Standby"}</span>
                </div>
                <div className="mt-2 text-xs leading-5 text-on-surface-variant">Parallel file and chunk processing enabled</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[1.75rem] border border-outline-variant/35 bg-surface-container-lowest p-6 shadow-[0_20px_60px_rgba(27,43,89,0.06)]">
              <div className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-accent">Queue</div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div>
                  <div className="font-headline text-3xl font-bold text-primary">{files.length}</div>
                  <div className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Files</div>
                </div>
                <div>
                  <div className="font-headline text-3xl font-bold text-primary">{totalBlocks}</div>
                  <div className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Blocks</div>
                </div>
                <div>
                  <div className="font-headline text-3xl font-bold text-primary">{completedCount}</div>
                  <div className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Done</div>
                </div>
              </div>
              <div className="mt-5 border-t border-outline-variant/20 pt-4 text-sm leading-6 text-on-surface-variant">
                {pendingCount} pending, {translatingCount} translating
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-outline-variant/35 bg-surface-container-lowest p-6 shadow-[0_20px_60px_rgba(27,43,89,0.06)]">
              <div className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-accent">Profile</div>
              <div className="mt-4 flex items-center gap-3">
                <div className="rounded-full bg-accent-soft px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">{currentMode?.name || options.mode}</div>
                <ChevronRight className="h-4 w-4 text-outline-variant" />
                <div className="text-sm font-medium text-on-surface-variant">{options.keepSpeakerNames ? "Speaker tags kept" : "Speaker tags cleaned"}</div>
              </div>
              <div className="mt-4 text-sm leading-6 text-on-surface-variant">
                {currentMode?.desc || "문맥에 맞는 번역 프로필"}
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-outline-variant/35 bg-primary p-6 text-on-primary shadow-[0_24px_60px_rgba(27,43,89,0.18)]">
            <div className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-on-primary/70">Operator notes</div>
            <div className="mt-5 space-y-4 text-sm leading-6 text-on-primary/78">
              <p>업로드와 결과 비교가 한 시선 안에 들어오도록 구성을 유지했습니다.</p>
              <p>번역 중 상태는 숫자와 진행률 위주로 보여서 대기 시간을 관리하기 쉽습니다.</p>
              <p>완료된 파일은 즉시 복사 또는 내려받기 할 수 있게 상단 액션을 고정했습니다.</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4 rounded-[2rem] border border-outline-variant/35 bg-surface-container-lowest p-6 shadow-[0_24px_70px_rgba(27,43,89,0.07)] lg:p-7">
            <div className="mb-6">
              <span className="mb-3 block text-[0.65rem] font-bold uppercase tracking-[0.24em] text-accent">Workspace setup</span>
              <h2 className="font-headline text-3xl font-bold tracking-tight text-primary">Upload, tune, run</h2>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">작업 대상과 번역 정책을 먼저 결정하고, 그다음 결과 화면으로 자연스럽게 이어지도록 구성했습니다.</p>
            </div>

          {/* Upload Area */}
          <section className="rounded-[1.5rem] bg-surface p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <h2 className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-on-surface-variant mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4" /> 1. Upload
            </h2>
            
            <div 
              {...getRootProps()} 
              className={cn(
                "mb-4 rounded-[1.25rem] border-2 border-dashed p-6 text-center transition-all",
                isDragActive ? "border-accent bg-accent-soft/60" : "border-outline-variant/40 bg-surface-container-lowest hover:border-accent/50 hover:bg-accent-soft/35"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto mb-3 h-8 w-8 text-accent" />
              <p className="text-sm font-semibold text-primary">Drag & drop subtitle files</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">Supports .srt, .vtt, .txt</p>
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
                        ? "bg-accent-soft ring-1 ring-accent/20" 
                        : "bg-surface-container-low hover:bg-surface-container-high"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        f.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-accent-soft text-accent"
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
          <section className="mt-6 space-y-6 rounded-[1.5rem] bg-surface p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <h2 className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-on-surface-variant mb-2 flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> 2. Options
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant ml-1">Source</label>
                <select 
                  value={options.sourceLang}
                  onChange={(e) => setOptions(prev => ({ ...prev, sourceLang: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm outline-none transition-all focus:ring-1 focus:ring-accent/30"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant ml-1">Target</label>
                <select 
                  value={options.targetLang}
                  onChange={(e) => setOptions(prev => ({ ...prev, targetLang: e.target.value }))}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm outline-none transition-all focus:ring-1 focus:ring-accent/30"
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
                        ? "bg-accent-soft ring-1 ring-accent/20" 
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
                className="h-32 w-full resize-none rounded-[1.25rem] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-xs leading-6 text-on-surface outline-none transition-all focus:ring-1 focus:ring-accent/30"
              />
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={options.keepSpeakerNames}
                  onChange={(e) => setOptions(prev => ({ ...prev, keepSpeakerNames: e.target.checked }))}
                  className="h-4 w-4 rounded border-outline-variant/50 text-accent focus:ring-accent"
                />
                <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">Keep Speaker Names (e.g. [Name]:)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={options.translateSoundEffects}
                  onChange={(e) => setOptions(prev => ({ ...prev, translateSoundEffects: e.target.checked }))}
                  className="h-4 w-4 rounded border-outline-variant/50 text-accent focus:ring-accent"
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
                    ? "cursor-not-allowed bg-surface-container-high text-on-surface-variant"
                    : "bg-gradient-to-r from-primary via-primary-container to-accent text-on-primary shadow-[0_18px_40px_rgba(27,43,89,0.22)] hover:shadow-[0_22px_48px_rgba(27,43,89,0.28)] active:scale-[0.98]"
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
                className="rounded-xl bg-surface-container-high px-4 py-4 text-on-surface-variant transition-all hover:bg-surface-container-highest active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </section>
        </div>

        {/* Right Panel: Results */}
        <div className="lg:col-span-8 flex min-h-[840px] flex-col">
          <section className="flex flex-1 flex-col overflow-hidden rounded-[2rem] border border-outline-variant/35 bg-surface-container-lowest shadow-[0_28px_80px_rgba(27,43,89,0.08)]">
            {/* Tabs & Actions */}
            <div className="flex items-center justify-between border-b border-surface-container-low px-8 py-6">
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-accent">Live output</div>
                <div className="mt-2 text-lg font-semibold text-primary">{currentFile ? currentFile.name : "Translation preview"}</div>
              </div>
              <div className="flex rounded-xl bg-surface-container-low p-1">
                <button 
                  onClick={() => setActiveTab('source')}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                    activeTab === 'source' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  <Eye className="w-3.5 h-3.5" /> Source
                </button>
                <button 
                  onClick={() => setActiveTab('translated')}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                    activeTab === 'translated' ? "bg-surface-container-lowest text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Translated
                </button>
                <button 
                  onClick={() => setActiveTab('compare')}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
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
                  className="rounded-lg p-2 text-on-surface-variant transition-all hover:bg-accent-soft hover:text-accent disabled:opacity-30"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-surface-container-high mx-1" />
                <button 
                  onClick={() => selectedFileIndex !== null && handleDownload(selectedFileIndex, 'srt')}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-surface-container-low px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-primary transition-all hover:bg-surface-container-high disabled:opacity-30"
                >
                  <FileDown className="w-3.5 h-3.5" /> .SRT
                </button>
                <button 
                  onClick={() => selectedFileIndex !== null && handleDownload(selectedFileIndex, 'txt')}
                  disabled={!currentFile || currentFile.translatedBlocks.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-surface-container-low px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-primary transition-all hover:bg-surface-container-high disabled:opacity-30"
                >
                  <FileText className="w-3.5 h-3.5" /> .TXT
                </button>
                {files.some(f => f.status === 'completed') && (
                  <button 
                    onClick={handleDownloadAll}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-on-primary shadow-sm transition-all hover:bg-primary-container"
                    title="Download all completed as ZIP"
                  >
                    <Download className="w-3.5 h-3.5" /> All (ZIP)
                  </button>
                )}
              </div>
            </div>

            {/* Content View */}
            <div className="relative flex-1 overflow-hidden bg-surface-container-lowest">
              <AnimatePresence mode="wait">
                {!currentFile && (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-accent-soft">
                      <FileText className="h-10 w-10 text-accent" />
                    </div>
                    <h3 className="mb-4 font-headline text-3xl font-bold text-primary">No Subtitles Loaded</h3>
                    <p className="max-w-md text-sm leading-relaxed text-on-surface-variant">샘플을 불러오거나 실제 일본어 자막을 업로드하면, 여기서 원문과 번역문을 빠르게 비교할 수 있습니다.</p>
                  </motion.div>
                )}

                {currentFile && currentFile.status === 'translating' && (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="relative mb-8">
                      <div className="w-24 h-24 border-4 border-surface-container-high rounded-full" />
                      <div className="w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">{currentFile.progress}%</span>
                      </div>
                    </div>
                    <h3 className="mb-4 font-headline text-3xl font-bold text-primary">Translating in Parallel...</h3>
                    <p className="text-sm text-on-surface-variant">"{currentFile.name}" 을(를) 일본어 자막 워크플로로 처리 중입니다.</p>
                  </motion.div>
                )}

                {currentFile && currentFile.status === 'error' && (
                  <motion.div 
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-full flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-16 h-16 bg-error-container rounded-full flex items-center justify-center mb-6">
                      <AlertCircle className="w-8 h-8 text-error" />
                    </div>
                    <h3 className="text-error font-headline font-bold text-2xl mb-4">Translation Error</h3>
                    <p className="text-on-surface-variant text-sm max-w-md mb-8">{currentFile.error}</p>
                    <button 
                      onClick={() => selectedFileIndex !== null && translateFile(selectedFileIndex)}
                      className="rounded-lg bg-primary px-8 py-3 text-xs font-bold uppercase tracking-widest text-on-primary transition-all hover:bg-primary-container"
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
                      <div className="space-y-6">
                        {currentFile.blocks.map((block, i) => (
                          <div key={block.id} className="group relative rounded-[1.5rem] border border-outline-variant/25 bg-surface p-5 shadow-[0_12px_28px_rgba(27,43,89,0.04)]">
                            <div className="mb-4 flex items-center justify-between">
                              <div className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent">Block {block.index || i + 1}</div>
                              <div className="text-[10px] font-mono text-on-surface-variant">{block.timestamp || "No timestamp"}</div>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="rounded-[1.25rem] bg-surface-container-low p-5 text-sm leading-relaxed text-on-surface-variant">
                                {block.originalText}
                              </div>
                              <div className="rounded-[1.25rem] bg-accent-soft p-5 text-sm font-medium leading-relaxed text-primary ring-1 ring-accent/10">
                                {currentFile.translatedBlocks[i]?.text || "..."}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="min-h-full rounded-[1.5rem] bg-surface p-8 font-mono text-sm leading-relaxed text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
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
        </section>

        <footer className="flex flex-col gap-4 border-t border-outline-variant/25 px-2 pb-6 pt-2 text-sm text-on-surface-variant lg:flex-row lg:items-center lg:justify-between">
          <div className="font-headline text-lg font-bold tracking-tight text-primary">Translation Control Room</div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <span>{files.length} files loaded</span>
            <span>{totalBlocks} subtitle blocks</span>
            <span>{targetLanguageLabel} output profile</span>
          </div>
        </footer>
      </main>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-8 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-4 rounded-2xl px-8 py-4 text-xs font-bold uppercase tracking-widest shadow-[0_20px_50px_rgba(27,43,89,0.16)]",
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
