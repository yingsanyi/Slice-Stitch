
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, Plus, Trash2, GripVertical, ChevronDown, Minus, Plus as PlusIcon, RotateCcw, X } from 'lucide-react';
import { AspectRatio, StitchItem, StitchConfig } from '../types';
import { generateStitchedImage, loadImage } from '../utils/canvasUtils';

const RATIOS: { label: string; value: AspectRatio }[] = [
  { label: 'Original', value: 'original' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
];

const sliderStyle = `
  .elegant-slider {
    -webkit-appearance: none;
    width: 100%;
    background: transparent;
    touch-action: none; /* DISABLE SCROLL ON SLIDER */
  }
  .elegant-slider:focus {
    outline: none;
  }
  /* Webkit (Chrome/Safari) */
  .elegant-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 6px;
    width: 6px;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    margin-top: -2.5px; /* (1px track - 6px thumb) / 2 */
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    transition: transform 0.1s ease;
  }
  .elegant-slider::-webkit-slider-thumb:hover {
    transform: scale(1.3);
  }
  .elegant-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 1px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 999px;
  }
  
  /* Firefox */
  .elegant-slider::-moz-range-thumb {
    height: 6px;
    width: 6px;
    border: none;
    border-radius: 50%;
    background: #ffffff;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    transition: transform 0.1s ease;
  }
  .elegant-slider::-moz-range-thumb:hover {
    transform: scale(1.3);
  }
  .elegant-slider::-moz-range-track {
    width: 100%;
    height: 1px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 999px;
  }
`;

const LongImageStitcher: React.FC = () => {
  const [items, setItems] = useState<StitchItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Viewport Zoom State (Does not affect output)
  const [viewScale, setViewScale] = useState(1.0);

  // Global Config
  const [config, setConfig] = useState<StitchConfig>({
    outerPadding: 0,
    innerSpacing: 0,
    backgroundColor: '#ffffff'
  });

  // Active control popup state
  const [activeControl, setActiveControl] = useState<'padding' | 'gap' | null>(null);

  // State for Image Panning
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, initialItemX: 0, initialItemY: 0 });

  // State for Reordering
  const [reorderState, setReorderState] = useState<{ activeId: string } | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      items.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (items.length > 0 && !selectedId) {
       if (items.length === 1) setSelectedId(items[0].id);
    }
  }, [items.length]);

  // --- Wheel Zoom with Scroll Prevention ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
        if (!selectedId) return;
        const selectedEl = itemRefs.current.get(selectedId);
        
        // Check if the mouse is over the selected item's DOM tree
        if (selectedEl && selectedEl.contains(e.target as Node)) {
             e.preventDefault();
             e.stopPropagation();
             
             const ZOOM_SENSITIVITY = 0.001;
             const MIN_SCALE = 0.2;
             const MAX_SCALE = 3.0;
             const delta = -e.deltaY * ZOOM_SENSITIVITY;

             setItems(prev => prev.map(item => {
                 if (item.id !== selectedId) return item;
                 const newScale = Math.min(Math.max(MIN_SCALE, item.scale + delta), MAX_SCALE);
                 return { ...item, scale: newScale };
             }));
        }
    };

    // Passive: false is crucial to allow preventDefault()
    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [selectedId]);

  // --- Reordering Logic ---
  useEffect(() => {
    if (!reorderState) return;

    const handleGlobalMove = (e: PointerEvent) => {
      e.preventDefault();
      const draggingId = reorderState.activeId;
      
      let targetIndex = -1;
      let draggingIndex = -1;

      items.forEach((item, index) => {
        if (item.id === draggingId) {
            draggingIndex = index;
            return;
        }
        const el = itemRefs.current.get(item.id);
        if (el) {
            const rect = el.getBoundingClientRect();
            if (e.clientY > rect.top && e.clientY < rect.bottom) {
                targetIndex = index;
            }
        }
      });

      if (targetIndex !== -1 && targetIndex !== draggingIndex) {
        const newItems = [...items];
        const [movedItem] = newItems.splice(draggingIndex, 1);
        newItems.splice(targetIndex, 0, movedItem);
        setItems(newItems);
      }
    };

    const handleGlobalUp = () => {
      setReorderState(null);
    };

    window.addEventListener('pointermove', handleGlobalMove);
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalMove);
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, [reorderState, items]);

  const processFiles = (files: FileList | File[]) => {
    const newItems: StitchItem[] = Array.from(files).map((file: File) => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      url: URL.createObjectURL(file),
      ratio: 'original',
      scale: 1,
      x: 0,
      y: 0
    }));
    
    setItems(prev => {
        const updated = [...prev, ...newItems];
        if (!selectedId && newItems.length > 0) {
            setTimeout(() => setSelectedId(newItems[0].id), 0);
        }
        return updated;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
    }
  }, []);

  const removeItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setItems(prev => prev.filter(item => item.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSelectedItem = (updates: Partial<StitchItem>, id?: string) => {
    const targetId = id || selectedId;
    if (!targetId) return;
    setItems(prev => prev.map(item => item.id === targetId ? { ...item, ...updates } : item));
  };

  // --- Panning ---
  const handlePanDown = (e: React.PointerEvent, item: StitchItem) => {
    if (item.id !== selectedId) setSelectedId(item.id);
    if (!e.isPrimary) return;

    e.preventDefault();
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    panStartRef.current = { 
        x: e.clientX, 
        y: e.clientY, 
        initialItemX: item.x, 
        initialItemY: item.y 
    };
  };

  const handlePanMove = (e: React.PointerEvent, item: StitchItem) => {
    if (!isPanning || selectedId !== item.id) return;
    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;
    
    // Adjust sensitivity based on whether we are zoomed in or not, but keep it consistent
    const SENSITIVITY = 0.2; 
    const newX = panStartRef.current.initialItemX + (deltaX * SENSITIVITY);
    const newY = panStartRef.current.initialItemY + (deltaY * SENSITIVITY);
    updateSelectedItem({ x: newX, y: newY });
  };

  const handlePanUp = (e: React.PointerEvent) => {
    if (isPanning) {
        setIsPanning(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleReorderDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderState({ activeId: id });
    setSelectedId(id);
  };

  const handleDownload = async () => {
    if (items.length === 0) return;
    setIsGenerating(true);
    try {
        // Intelligent Resolution Calculation:
        // 1. Load all images to find their natural dimensions.
        // 2. Determine the maximum width available to preserve the quality of high-res photos.
        // 3. Cap at 8192px (8K) to ensure browser canvas stability while remaining "High Quality" for all web/mobile uses.
        const imageDimensions = await Promise.all(items.map(item => loadImage(item.url)));
        const maxWidth = Math.max(...imageDimensions.map(img => img.naturalWidth));
        
        // CHANGED: Cap increased from 3840 to 8192
        const optimalWidth = Math.min(Math.max(maxWidth, 1080), 8192);

        const url = await generateStitchedImage(items, config, optimalWidth);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `stitch_${new Date().getTime()}.png`; // High Quality PNG
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        console.error(e);
        alert("Error generating stitched image");
    } finally {
        setIsGenerating(false);
    }
  };

  // View Controls
  const resetView = () => setViewScale(1.0);
  const zoomInView = () => setViewScale(p => Math.min(p + 0.1, 2.0));
  const zoomOutView = () => setViewScale(p => Math.max(p - 0.1, 0.2));

  return (
    <div className="relative w-full h-full flex flex-col bg-gray-100/50">
        <style>{sliderStyle}</style>
        {/* Backdrop for active popups */}
        {activeControl && (
            <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActiveControl(null)} />
        )}

        {/* Main Preview Area */}
        <div className="flex-1 overflow-hidden relative flex flex-col items-center justify-start bg-gray-100/50">
             
             {items.length === 0 ? (
                <div 
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={onDrop}
                    className={`flex-1 w-full flex flex-col items-center justify-center transition-colors ${isDragOver ? 'bg-indigo-50/50' : ''}`}
                >
                    <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
                        <ImageIcon className="w-10 h-10 text-gray-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Start stitching</h3>
                    <p className="text-gray-400 mb-8">Drop photos here or use the add button below</p>
                </div>
             ) : (
                <div 
                    ref={containerRef}
                    className="w-full h-full overflow-y-auto custom-scrollbar pt-8 pb-40 px-4 flex flex-col items-center"
                    onClick={() => setSelectedId(null)} // Click background to deselect
                >
                    {/* The "Canvas" */}
                    <div 
                        className="relative flex flex-col shadow-2xl transition-transform duration-200 origin-top ease-out"
                        style={{ 
                            width: '100%', 
                            maxWidth: '500px', 
                            backgroundColor: config.backgroundColor,
                            padding: `${config.outerPadding}px`,
                            gap: `${config.innerSpacing}px`,
                            transform: `scale(${viewScale})`,
                        }}
                        onClick={(e) => e.stopPropagation()} // Stop propagation if clicking the canvas background itself? 
                        // Actually, clicking the canvas background should also deselect. 
                        // So we remove stopPropagation here or change logic.
                        // If we remove it, it bubbles to container and deselects. That is correct behavior.
                    >
                        {items.map((item) => {
                            const isOriginal = item.ratio === 'original';
                            const isSelected = selectedId === item.id;
                            const isReordering = reorderState?.activeId === item.id;

                            return (
                                <div 
                                    key={`${item.id}-${item.ratio}`}
                                    ref={(el) => {
                                        if (el) itemRefs.current.set(item.id, el);
                                        else itemRefs.current.delete(item.id);
                                    }}
                                    onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}
                                    className={`relative bg-gray-200 group select-none transition-all w-full ${
                                        isSelected ? 'ring-4 ring-indigo-500 z-20' : 'hover:ring-2 hover:ring-indigo-300/50'
                                    } ${isReordering ? 'opacity-80 scale-[1.02] z-50' : ''}`}
                                    style={{
                                        // Use aspectRatio for fixed ratios
                                        aspectRatio: isOriginal ? undefined : item.ratio.replace(':', '/'),
                                        // For original, let it flow naturally
                                        height: isOriginal ? 'auto' : undefined,
                                        touchAction: 'none',
                                    }}
                                >
                                    {/* Reorder Handle */}
                                    <div 
                                        className={`absolute left-0 top-0 bottom-0 w-10 z-30 flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors ${
                                            isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600' : 'bg-black/5 hover:bg-black/10 text-gray-500 opacity-0 group-hover:opacity-100'
                                        }`}
                                        onPointerDown={(e) => handleReorderDown(e, item.id)}
                                        title="Drag to Reorder"
                                    >
                                        <GripVertical className="w-5 h-5 drop-shadow-sm" />
                                    </div>

                                    {/* Content Wrapper */}
                                    {isOriginal ? (
                                        <div className="relative w-full overflow-hidden cursor-move"
                                            onPointerDown={(e) => handlePanDown(e, item)}
                                            onPointerMove={(e) => handlePanMove(e, item)}
                                            onPointerUp={handlePanUp}
                                            onPointerCancel={handlePanUp}
                                        >
                                             <img 
                                                src={item.url} 
                                                alt=""
                                                draggable={false}
                                                decoding="async"
                                                style={{
                                                    display: 'block',
                                                    width: '100%',
                                                    height: 'auto',
                                                    transform: `scale(${item.scale}) translate(${item.x}%, ${item.y}%)`,
                                                    willChange: 'transform',
                                                    maxWidth: 'none',
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div 
                                            className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center cursor-move bg-gray-100"
                                            onPointerDown={(e) => handlePanDown(e, item)}
                                            onPointerMove={(e) => handlePanMove(e, item)}
                                            onPointerUp={handlePanUp}
                                            onPointerCancel={handlePanUp}
                                        >
                                            <img 
                                                src={item.url} 
                                                alt=""
                                                draggable={false}
                                                decoding="async"
                                                style={{
                                                    width: 'auto',
                                                    height: 'auto',
                                                    minWidth: '100%',
                                                    minHeight: '100%',
                                                    maxWidth: 'none',
                                                    transform: `scale(${item.scale}) translate(${item.x}%, ${item.y}%)`,
                                                    willChange: 'transform',
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Contextual Toolbar (Bottom of Image) */}
                                    {isSelected && !reorderState && (
                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900/85 backdrop-blur-md p-1.5 rounded-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 border border-white/10">
                                            {/* Ratio Select */}
                                            <div className="relative group/select">
                                                <select
                                                    value={item.ratio}
                                                    onChange={(e) => updateSelectedItem({ ratio: e.target.value as AspectRatio }, item.id)}
                                                    className="appearance-none bg-transparent text-white text-xs font-medium pl-3 pr-7 py-1.5 rounded-lg hover:bg-white/10 cursor-pointer outline-none transition-colors"
                                                    onPointerDown={(e) => e.stopPropagation()} // Prevent panning when clicking select
                                                >
                                                    {RATIOS.map((r) => (
                                                        <option key={r.value} value={r.value} className="text-gray-900">{r.label}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/70 pointer-events-none" />
                                            </div>

                                            <div className="w-px h-4 bg-white/20 mx-1"></div>
                                            
                                            {/* Reset Transforms */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    updateSelectedItem({ x: 0, y: 0, scale: 1 }, item.id);
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                title="Reset Position & Scale"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </button>

                                            <div className="w-px h-4 bg-white/20 mx-1"></div>
                                            
                                            {/* Remove */}
                                            <button 
                                                onClick={(e) => removeItem(e, item.id)}
                                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                                                title="Remove Image"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        
                        {/* Append Drop Zone */}
                        <label 
                            className="w-full border-2 border-dashed border-gray-300/50 hover:border-indigo-400 hover:bg-indigo-50 rounded-b-sm h-16 flex items-center justify-center cursor-pointer transition-all text-gray-400 hover:text-indigo-600 opacity-50 hover:opacity-100"
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDrop={onDrop}
                            onClick={(e) => e.stopPropagation()} // Prevent background click from deselecting immediately if dragging? No, normal click should probably just allow file dialog. 
                            // Actually, if we stop propagation, it won't deselect. That's better for UX when interacting with controls.
                        >
                            <Plus className="w-5 h-5" />
                            <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>
                </div>
             )}
        </div>

        {/* Fixed Bottom Control Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200 z-50 pb-safe">
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-8">
                
                {/* Left: Add & Global View */}
                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                    <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full cursor-pointer shadow-md shadow-indigo-200 transition-all active:scale-95 font-medium text-sm">
                        <Plus className="w-4 h-4" />
                        <span>Add Photos</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                    </label>

                    <div className="flex items-center bg-gray-100 rounded-full p-1 border border-gray-200">
                        <button onClick={zoomOutView} className="p-1.5 hover:bg-white rounded-full text-gray-500 transition-all"><Minus className="w-3 h-3" /></button>
                        <span className="text-xs font-mono w-12 text-center text-gray-600">{Math.round(viewScale * 100)}%</span>
                        <button onClick={zoomInView} className="p-1.5 hover:bg-white rounded-full text-gray-500 transition-all"><PlusIcon className="w-3 h-3" /></button>
                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={resetView} className="p-1.5 hover:bg-white rounded-full text-gray-500 transition-all" title="Reset View"><RotateCcw className="w-3 h-3" /></button>
                    </div>
                </div>

                {/* Center: Canvas Style (Compact Buttons with Popups) */}
                <div className="flex items-center gap-8 justify-center w-full md:w-auto">
                    
                    {/* Bg Color */}
                    <div className="flex flex-col items-center gap-1.5" title="Change canvas background color">
                         <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-gray-200 shadow-sm cursor-pointer active:scale-95 transition-transform">
                            <div className="absolute inset-0" style={{ backgroundColor: config.backgroundColor }} />
                            <input 
                                type="color"
                                value={config.backgroundColor}
                                onChange={e => setConfig(p => ({...p, backgroundColor: e.target.value}))}
                                className="absolute -top-4 -left-4 w-20 h-20 cursor-pointer opacity-0"
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-4 h-4 rounded-full border border-white/20 shadow-sm ring-1 ring-black/10" style={{ backgroundColor: config.backgroundColor }} />
                            </div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Background</span>
                    </div>

                    {/* Border (Padding) */}
                    <div className="relative flex flex-col items-center gap-1.5" title="Adjust outer border thickness">
                        {activeControl === 'padding' && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-5 h-48 bg-gray-900 shadow-xl rounded-full z-50 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 zoom-in-95 overflow-visible">
                                 {/* Value Display */}
                                 <div className="h-8 w-full flex items-center justify-center text-[9px] font-bold text-white/90 tabular-nums pt-1">
                                    {config.outerPadding}px
                                 </div>
                                 {/* Slider Track Area */}
                                 <div className="flex-1 w-full flex items-center justify-center relative">
                                    <div className="absolute w-32 h-5 flex items-center justify-center -rotate-90">
                                        <input 
                                            type="range" min="0" max="100" step="5"
                                            value={config.outerPadding}
                                            onChange={e => setConfig(p => ({...p, outerPadding: Number(e.target.value)}))}
                                            className="elegant-slider"
                                            onPointerDown={(e) => e.stopPropagation()} // PREVENT DRAG INTERFERENCE
                                        />
                                    </div>
                                 </div>
                                 
                                 <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900 rotate-45"></div>
                            </div>
                        )}
                        <button 
                            onClick={() => setActiveControl(activeControl === 'padding' ? null : 'padding')}
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm transition-all active:scale-95 ${
                                activeControl === 'padding' 
                                ? 'bg-gray-900 border-gray-900 text-white' 
                                : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'
                            }`}
                        >
                            <span className="text-sm font-bold">{config.outerPadding}</span>
                        </button>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Border</span>
                    </div>

                    {/* Spacing (Gap) */}
                    <div className="relative flex flex-col items-center gap-1.5" title="Adjust spacing between images">
                        {activeControl === 'gap' && (
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-5 h-48 bg-gray-900 shadow-xl rounded-full z-50 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 zoom-in-95 overflow-visible">
                                 {/* Value Display */}
                                 <div className="h-8 w-full flex items-center justify-center text-[9px] font-bold text-white/90 tabular-nums pt-1">
                                    {config.innerSpacing}px
                                 </div>
                                 {/* Slider Track Area */}
                                 <div className="flex-1 w-full flex items-center justify-center relative">
                                    <div className="absolute w-32 h-5 flex items-center justify-center -rotate-90">
                                        <input 
                                            type="range" min="0" max="100" step="2"
                                            value={config.innerSpacing}
                                            onChange={e => setConfig(p => ({...p, innerSpacing: Number(e.target.value)}))}
                                            className="elegant-slider"
                                            onPointerDown={(e) => e.stopPropagation()} // PREVENT DRAG INTERFERENCE
                                        />
                                    </div>
                                 </div>

                                 <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900 rotate-45"></div>
                            </div>
                        )}
                        <button 
                            onClick={() => setActiveControl(activeControl === 'gap' ? null : 'gap')}
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm transition-all active:scale-95 ${
                                activeControl === 'gap' 
                                ? 'bg-gray-900 border-gray-900 text-white' 
                                : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'
                            }`}
                        >
                            <span className="text-sm font-bold">{config.innerSpacing}</span>
                        </button>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Spacing</span>
                    </div>
                </div>

                {/* Right: Export */}
                <button 
                    onClick={handleDownload}
                    disabled={items.length === 0 || isGenerating}
                    className="w-full md:w-auto px-6 py-2 bg-gray-900 hover:bg-black text-white font-semibold rounded-full shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                >
                    {isGenerating ? 'Processing...' : <><Download className="w-4 h-4" /> Export Image</>}
                </button>
            </div>
        </div>
    </div>
  );
};

export default LongImageStitcher;
