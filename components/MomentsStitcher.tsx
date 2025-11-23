import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, ChevronLeft, Plus, Image as ImageIcon, Download, Layers, ArrowUp, ArrowDown, Trash2, GripVertical, RotateCcw, ChevronDown, Minus, Plus as PlusIcon, Lock, AlertCircle, X, Maximize, MoveVertical, MoveHorizontal, Scan, ChevronUp } from 'lucide-react';
import { CropArea, StitchItem, StitchConfig, AspectRatio } from '../types';
import { generateNineGrid, loadImage, generateStitchedImage } from '../utils/canvasUtils';

const RATIOS: { label: string; value: AspectRatio }[] = [
  { label: 'Original', value: 'original' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
];

type StoryMap = Record<number, StitchItem[]>;

// Helper to generate a unique signature for a file to detect duplicates
const getFileSignature = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

const MomentsStitcher: React.FC = () => {
  // --- Phase 1: Grid Generation State ---
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState<number>(1);
  const [crop, setCrop] = useState<CropArea>({ x: 0, y: 0, scale: 1 });
  const [slices, setSlices] = useState<string[]>([]); // The 9 blob URLs
  
  // Phase 1 Pointer State for Drag/Zoom
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
  const initialPinchDist = useRef<number | null>(null);

  // --- Phase 2/3: Story State ---
  const [stories, setStories] = useState<StoryMap>({});
  const [activeSliceIndex, setActiveSliceIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Enable Wheel Zoom for Cropper (Phase 1)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sourceImage || activeSliceIndex !== null) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ZOOM_SENSITIVITY = 0.0015;
      setCrop((prev) => ({
        ...prev,
        scale: Math.min(Math.max(0.2, prev.scale + -e.deltaY * ZOOM_SENSITIVITY), 3.0)
      }));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [sourceImage, activeSliceIndex]);

  // --- Handlers for Phase 1 ---
  const handleSourceFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        setImageAspect(img.width / img.height);
        setSourceImage(url);
        setCrop({ x: 0, y: 0, scale: 1 });
        setSlices([]); // Reset previous
        setStories({});
    };
    img.src = url;
  };

  // Unified Pointer Handler for Grid Cropper (Phase 1)
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - crop.x, y: e.clientY - crop.y });
    } else if (activePointers.current.size === 2) {
        setIsDragging(false);
        const pts = Array.from(activePointers.current.values()) as { x: number; y: number }[];
        initialPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return;
    e.preventDefault();
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2) {
        // Pinch
        const pts = Array.from(activePointers.current.values()) as { x: number; y: number }[];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        
        if (initialPinchDist.current) {
            const delta = dist - initialPinchDist.current;
            setCrop(prev => {
                const newScale = Math.min(Math.max(0.2, prev.scale + delta * 0.005), 3.0);
                return { ...prev, scale: newScale };
            });
            initialPinchDist.current = dist;
        }
    } else if (activePointers.current.size === 1 && isDragging) {
        // Drag
        setCrop(prev => ({ ...prev, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (activePointers.current.size < 2) initialPinchDist.current = null;
    if (activePointers.current.size === 0) setIsDragging(false);
  };

  const generateGrid = async () => {
     if (!sourceImage || !containerRef.current) return;
     const urls = await generateNineGrid(sourceImage, crop, containerRef.current.clientWidth);
     setSlices(urls);
     const initialStories: StoryMap = {};
     for(let i=0; i<9; i++) {
         const res = await fetch(urls[i]);
         const blob = await res.blob();
         const file = new File([blob], `slice_${i}.png`, { type: 'image/png' });
         initialStories[i] = [{
             id: `anchor-${i}`,
             file: file,
             url: urls[i],
             ratio: '1:1',
             scale: 1, x: 0, y: 0
         }];
     }
     setStories(initialStories);
  };

  // --- Render Logic ---
  // 1. Editor View
  if (activeSliceIndex !== null) {
      return (
          <StoryEditor 
             key={activeSliceIndex} 
             index={activeSliceIndex}
             items={stories[activeSliceIndex] || []}
             allStories={stories} 
             onSave={(newItems) => {
                 setStories(prev => ({ ...prev, [activeSliceIndex]: newItems }));
             }}
             onBack={() => setActiveSliceIndex(null)}
          />
      );
  }

  // 2. Grid View
  if (slices.length > 0) {
      return (
          <div className="h-full flex flex-col max-w-5xl mx-auto p-4 md:p-8">
              <div className="flex items-center justify-between mb-8">
                  <button 
                    onClick={() => { setSlices([]); setSourceImage(null); setStories({}); }}
                    className="flex items-center gap-2 text-gray-500 hover:text-indigo-600 transition-colors"
                  >
                      <ChevronLeft className="w-5 h-5" /> Start Over
                  </button>
                  <h2 className="text-xl font-bold text-gray-800">Tap a piece to add hidden story</h2>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="grid grid-cols-3 gap-1 w-full max-w-[450px] aspect-square bg-white shadow-2xl p-1.5 rounded-2xl border border-gray-100 ring-1 ring-gray-900/5">
                      {slices.map((url, idx) => {
                          const itemCount = stories[idx]?.length || 0;
                          const hasStory = itemCount > 1;
                          return (
                            <div 
                                key={idx} 
                                onClick={() => setActiveSliceIndex(idx)}
                                className="relative aspect-square group cursor-pointer overflow-hidden rounded-[2px] bg-gray-100"
                            >
                                <img src={url} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-indigo-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Plus className="text-white w-8 h-8 drop-shadow-md scale-90 group-hover:scale-110 transition-transform" />
                                </div>
                                {hasStory && (
                                    <div className="absolute bottom-1 right-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                                        <Layers className="w-3 h-3" /> Story
                                    </div>
                                )}
                            </div>
                          );
                      })}
                  </div>
                  <p className="mt-8 text-gray-400 text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Click grid cells to stitch images vertically (Add Top/Bottom)
                  </p>
              </div>
          </div>
      );
  }

  // 3. Initial Crop View
  const isLandscape = imageAspect > 1;
  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
       <div className="w-full max-w-xl bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col h-[80vh]">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              1. Prepare the Grid Cover
          </h2>
          
          {!sourceImage ? (
               <label 
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                      e.preventDefault(); setIsDragOver(false);
                      if(e.dataTransfer.files[0]) handleSourceFile(e.dataTransfer.files[0]);
                  }}
                  className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${
                      isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:bg-gray-50'
                  }`}
               >
                   <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 text-indigo-600">
                       <Upload className="w-8 h-8" />
                   </div>
                   <p className="text-gray-700 font-medium">Upload Grid Cover Image</p>
                   <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleSourceFile(e.target.files[0])} />
               </label>
          ) : (
              <>
                 <div className="flex-1 relative overflow-hidden bg-gray-100 rounded-xl ring-4 ring-gray-100 shadow-inner mb-6 flex items-center justify-center">
                    <div 
                        className="relative w-full max-w-[400px] aspect-square bg-white shadow-lg cursor-move overflow-hidden"
                        ref={containerRef}
                        style={{ touchAction: 'none' }} // Disable browser zoom/scroll
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                    >
                        <div className="absolute top-2 left-2 z-30 text-[10px] text-gray-500 font-medium bg-white/90 px-2 py-1 rounded pointer-events-none">
                            Drag & Pinch to Adjust
                        </div>

                        <div className="absolute top-2 right-2 z-30 flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
                            <div 
                                className="flex items-center gap-2"
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <button onClick={() => setCrop({ x: 0, y: 0, scale: 1 })} className="bg-white/90 hover:bg-white text-gray-600 hover:text-indigo-600 text-xs font-bold px-2 py-1.5 rounded-lg shadow-sm backdrop-blur-sm border border-gray-200 transition-all flex items-center gap-1.5">
                                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                                </button>
                                <button onClick={() => setSourceImage(null)} className="bg-white/90 hover:bg-red-50 text-gray-600 hover:text-red-600 p-1.5 rounded-lg shadow-sm backdrop-blur-sm border border-gray-200 transition-all" title="Remove Image">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        <img 
                            src={sourceImage} 
                            draggable={false}
                            className="select-none max-w-none"
                            style={{
                                position: 'absolute',
                                left: '50%', top: '50%',
                                width: isLandscape ? 'auto' : '100%',
                                height: isLandscape ? '100%' : 'auto',
                                transform: `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`
                            }}
                        />
                        <div className="absolute inset-0 z-20 pointer-events-none grid grid-cols-3 grid-rows-3 border-2 border-indigo-500/50">
                           {[...Array(9)].map((_,i) => <div key={i} className="border border-white/40 shadow-[0_0_1px_rgba(0,0,0,0.2)]"></div>)}
                        </div>
                    </div>
                 </div>
                 <button onClick={generateGrid} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95">Next: Create Stories</button>
              </>
          )}
       </div>
    </div>
  );
};


// --- Sub-Component: The Vertical Story Editor ---

const StoryEditor: React.FC<{
    index: number;
    items: StitchItem[];
    allStories: StoryMap;
    onSave: (items: StitchItem[]) => void;
    onBack: () => void;
}> = ({ index, items, allStories, onSave, onBack }) => {
    const [localItems, setLocalItems] = useState<StitchItem[]>(items);
    const localItemsRef = useRef(items);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [config, setConfig] = useState<StitchConfig>({ outerPadding: 0, innerSpacing: 0, backgroundColor: '#ffffff' });
    const [viewScale, setViewScale] = useState(1.0);
    const [activeControl, setActiveControl] = useState<'padding' | 'gap' | null>(null);
    const [notification, setNotification] = useState<{ message: string, type: 'error' | 'info' } | null>(null);
    const [imageAspects, setImageAspects] = useState<Record<string, number>>({});
    const imageAspectsRef = useRef<Record<string, number>>({});
    const lastVibrateTime = useRef(0);
    
    // Pointer Tracking for Pinch Zoom per Item
    const itemPointers = useRef<Map<string, Map<number, {x: number, y: number}>>>(new Map());
    const itemPinchStart = useRef<Map<string, number>>(new Map());

    const [reorderState, setReorderState] = useState<{ activeId: string } | null>(null);
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);
    const anchorItem = localItems.find(i => i.id === `anchor-${index}`);
    
    // Stepper Interval Ref
    const stepperIntervalRef = useRef<number | null>(null);

    // Sync Ref
    useEffect(() => { localItemsRef.current = localItems; }, [localItems]);
    useEffect(() => { onSave(localItems); }, [localItems]);

    // Pre-load aspects
    useEffect(() => {
        localItems.forEach(item => {
            if (imageAspectsRef.current[item.id]) return;
            const img = new Image();
            img.onload = () => {
                const aspect = img.width / img.height;
                imageAspectsRef.current[item.id] = aspect;
                setImageAspects(prev => ({ ...prev, [item.id]: aspect }));
            };
            img.src = item.url;
        });
    }, [localItems]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    // Mouse Wheel Logic (Desktop)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
    
        const handleNativeWheel = (e: WheelEvent) => {
            if (!selectedId) return;
            const selectedEl = itemRefs.current.get(selectedId);
            
            if (selectedEl && selectedEl.contains(e.target as Node)) {
                 e.preventDefault();
                 e.stopPropagation();
                 const currentItems = localItemsRef.current;
                 const currentItem = currentItems.find(i => i.id === selectedId);
                 if (!currentItem) return;
                 
                 applyZoom(currentItem, -e.deltaY * 0.001);
            }
        };
        container.addEventListener('wheel', handleNativeWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleNativeWheel);
      }, [selectedId]); 
      
    // --- Stepper Logic (Repeat on hold) ---
    const handleStepper = (type: 'padding' | 'gap', change: number) => {
         const update = () => {
             setConfig(prev => {
                 const current = type === 'padding' ? prev.outerPadding : prev.innerSpacing;
                 const newVal = Math.min(100, Math.max(0, current + change));
                 return type === 'padding' 
                    ? { ...prev, outerPadding: newVal }
                    : { ...prev, innerSpacing: newVal };
             });
         };
         update(); // Immediate fire
         
         // Start Repeating
         if (stepperIntervalRef.current) window.clearInterval(stepperIntervalRef.current);
         stepperIntervalRef.current = window.setInterval(update, 100);
    };

    const stopStepper = () => {
        if (stepperIntervalRef.current) {
            window.clearInterval(stepperIntervalRef.current);
            stepperIntervalRef.current = null;
        }
    };

    // Global listener to clear interval if mouse goes up anywhere
    useEffect(() => {
        window.addEventListener('pointerup', stopStepper);
        window.addEventListener('pointercancel', stopStepper);
        return () => {
            window.removeEventListener('pointerup', stopStepper);
            window.removeEventListener('pointercancel', stopStepper);
        };
    }, []);


    // --- Shared Zoom Logic ---
    const applyZoom = (item: StitchItem, delta: number) => {
         const MIN_SCALE = 0.01;
         const MAX_SCALE = 5.0;

         let imgAspect = imageAspectsRef.current[item.id] || 1.0;
         let cover = 1.0;
         let contain = 1.0;

         if (imgAspect) {
            let slotAspect = imgAspect;
            if (item.ratio !== 'original') {
                const [w, h] = item.ratio.split(':').map(Number);
                slotAspect = w / h;
            }
            if (imgAspect > slotAspect) {
                contain = slotAspect / imgAspect;
            } else {
                contain = imgAspect / slotAspect;
            }
         }

         setLocalItems(prev => prev.map(prevItem => {
             if (prevItem.id !== item.id) return prevItem;
             
             let newScale = Math.min(Math.max(MIN_SCALE, prevItem.scale + delta), MAX_SCALE);
             const SNAP_THRESHOLD = 0.05; 
             const distCover = Math.abs(newScale - cover);
             const distContain = Math.abs(newScale - contain);
             
             let didSnap = false;
             if (distCover < SNAP_THRESHOLD && distCover <= distContain) {
                 newScale = cover;
                 didSnap = true;
             } else if (distContain < SNAP_THRESHOLD) {
                 newScale = contain;
                 didSnap = true;
             }
             
             if (didSnap) {
                 const now = Date.now();
                 const isSameScale = Math.abs(prevItem.scale - newScale) < 0.0001;
                 if (!isSameScale && (now - lastVibrateTime.current > 150)) {
                     if (navigator.vibrate) navigator.vibrate(10);
                     lastVibrateTime.current = now;
                 }
             }
             const newX = didSnap ? 0 : prevItem.x;
             const newY = didSnap ? 0 : prevItem.y;
             return { ...prevItem, scale: newScale, x: newX, y: newY };
         }));
    };

    // --- Pan & Zoom Handlers (Pointer Events) ---
    const handlePointerDown = (e: React.PointerEvent, item: StitchItem) => {
        if (item.id !== selectedId && !reorderState) setSelectedId(item.id);
        if (item.id === anchorItem?.id) return;
        
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);

        // Init map for this item if missing
        if (!itemPointers.current.has(item.id)) {
            itemPointers.current.set(item.id, new Map());
        }
        const map = itemPointers.current.get(item.id)!;
        map.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (map.size === 2) {
            // Start Pinch
            const pts = Array.from(map.values()) as { x: number; y: number }[];
            itemPinchStart.current.set(item.id, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        }
    };
    
    const handlePointerMove = (e: React.PointerEvent, item: StitchItem) => {
        const map = itemPointers.current.get(item.id);
        if (!map || !map.has(e.pointerId)) return;
        e.preventDefault(); // Stop page scroll

        const prev = map.get(e.pointerId)!;
        const curr = { x: e.clientX, y: e.clientY };
        map.set(e.pointerId, curr);

        if (map.size === 2) {
            // Pinch Logic
            const pts = Array.from(map.values()) as { x: number; y: number }[];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const startDist = itemPinchStart.current.get(item.id);
            
            if (startDist) {
                const delta = dist - startDist;
                applyZoom(item, delta * 0.005); // Sensitivity for touch
                itemPinchStart.current.set(item.id, dist); // Reset start to avoid compound
            }
        } else if (map.size === 1) {
            // Pan Logic
            const deltaX = curr.x - prev.x;
            const deltaY = curr.y - prev.y;
            updateItem(item.id, { 
                x: item.x + deltaX * 0.2,
                y: item.y + deltaY * 0.2
            });
        }
    };

    const handlePointerUp = (e: React.PointerEvent, item: StitchItem) => {
        const map = itemPointers.current.get(item.id);
        if (map) {
            map.delete(e.pointerId);
            if (map.size < 2) itemPinchStart.current.delete(item.id);
        }
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    // --- Reordering ---
    useEffect(() => {
        if (!reorderState) return;
        const handleGlobalMove = (e: PointerEvent) => {
          e.preventDefault();
          const draggingId = reorderState.activeId;
          const currentItems = localItemsRef.current;
          let targetIndex = -1;
          let draggingIndex = -1;
          currentItems.forEach((item, index) => {
            if (item.id === draggingId) { draggingIndex = index; return; }
            const el = itemRefs.current.get(item.id);
            if (el) {
                const rect = el.getBoundingClientRect();
                if (e.clientY > rect.top && e.clientY < rect.bottom) targetIndex = index;
            }
          });
          if (targetIndex !== -1 && targetIndex !== draggingIndex) {
            setLocalItems(prev => {
                const newItems = [...prev];
                const [movedItem] = newItems.splice(draggingIndex, 1);
                newItems.splice(targetIndex, 0, movedItem);
                return newItems;
            });
          }
        };
        const handleGlobalUp = () => setReorderState(null);
        window.addEventListener('pointermove', handleGlobalMove);
        window.addEventListener('pointerup', handleGlobalUp);
        window.addEventListener('pointercancel', handleGlobalUp);
        return () => {
          window.removeEventListener('pointermove', handleGlobalMove);
          window.removeEventListener('pointerup', handleGlobalUp);
          window.removeEventListener('pointercancel', handleGlobalUp);
        };
      }, [reorderState]);

    const addFiles = (files: FileList, position: 'top' | 'bottom') => {
        const signatureMap = new Map<string, string>();
        Object.entries(allStories).forEach(([key, storyItems]) => {
            const storyIdx = parseInt(key);
            if (storyIdx === index) return; 
            (storyItems as StitchItem[]).forEach(item => signatureMap.set(getFileSignature(item.file), `Story #${storyIdx + 1}`));
        });
        localItems.forEach(item => signatureMap.set(getFileSignature(item.file), `this story`));

        const newItems: StitchItem[] = [];
        const duplicateDetails: string[] = [];
        Array.from(files).forEach(file => {
            const sig = getFileSignature(file);
            if (signatureMap.has(sig)) {
                duplicateDetails.push(`${file.name} (in ${signatureMap.get(sig)})`);
            } else {
                newItems.push({
                    id: Math.random().toString(36).substring(2, 9),
                    file, url: URL.createObjectURL(file),
                    ratio: 'original' as AspectRatio,
                    scale: 1, x: 0, y: 0
                });
                signatureMap.set(sig, "this batch");
            }
        });
        if (duplicateDetails.length > 0) {
             const count = duplicateDetails.length;
             const message = count === 1 ? `Skipped duplicate: ${duplicateDetails[0]}` : `Skipped ${count} duplicates including: ${duplicateDetails[0]}`;
             setNotification({ type: 'error', message: message });
        }
        if (newItems.length === 0) return;
        setLocalItems(prev => position === 'top' ? [...newItems, ...prev] : [...prev, ...newItems]);
    };

    const removeItem = (id: string) => {
        if (id === anchorItem?.id) return;
        setLocalItems(prev => prev.filter(i => i.id !== id));
        if(selectedId === id) setSelectedId(null);
    };

    const updateItem = (id: string, updates: Partial<StitchItem>) => setLocalItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));

    const handleReorderDown = (e: React.PointerEvent, id: string) => {
        e.preventDefault(); e.stopPropagation();
        setReorderState({ activeId: id }); setSelectedId(id);
    };

    const handleDownload = async () => {
        setIsGenerating(true);
        try {
            const dims = await Promise.all(localItems.map(i => loadImage(i.url)));
            const maxW = Math.max(...dims.map(d => d.naturalWidth));
            const width = Math.min(Math.max(maxW, 1080), 8192);
            const url = await generateStitchedImage(localItems, config, width);
            const a = document.createElement('a'); a.href = url; a.download = `story_slice_${index + 1}.png`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } finally { setIsGenerating(false); }
    };

    const zoomInView = () => setViewScale(p => Math.min(p + 0.1, 2.0));
    const zoomOutView = () => setViewScale(p => Math.max(p - 0.1, 0.2));
    const resetView = () => setViewScale(1.0);

    return (
        <div className="h-full flex flex-col bg-gray-100/50 relative">
            {notification && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
                    <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border pointer-events-auto ${notification.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium">{notification.message}</span>
                        <button onClick={() => setNotification(null)} className="ml-2 p-1 rounded-full hover:bg-black/5 transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                </div>
            )}
            
            <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 z-10">
                <button onClick={onBack} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium"><ChevronLeft className="w-5 h-5" /> Back to Grid</button>
                <span className="font-bold text-gray-800">Edit Story #{index + 1}</span>
                <div className="w-24"></div>
            </div>

            <div 
                ref={containerRef}
                className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 flex flex-col items-center pb-40"
                onClick={() => setSelectedId(null)}
            >
                 <div 
                    className="relative flex flex-col shadow-2xl transition-transform duration-200 origin-top ease-out"
                    style={{ width: '100%', maxWidth: '500px', backgroundColor: config.backgroundColor, padding: `${config.outerPadding}px`, gap: `${config.innerSpacing}px`, transform: `scale(${viewScale})` }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <label onClick={(e) => e.stopPropagation()} className="w-full h-12 border-2 border-dashed border-gray-300/50 hover:border-indigo-400 hover:bg-indigo-50 rounded-lg flex items-center justify-center text-gray-400 hover:text-indigo-600 cursor-pointer transition-all mb-2 shrink-0 opacity-60 hover:opacity-100">
                        <span className="text-xs font-bold flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Add Top</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={e => { if(e.target.files && e.target.files.length > 0) { addFiles(e.target.files, 'top'); e.target.value = ''; }}} />
                    </label>

                    {localItems.map(item => {
                        const isAnchor = item.id === anchorItem?.id;
                        const isSelected = selectedId === item.id;
                        const isOriginal = item.ratio === 'original';
                        const isReordering = reorderState?.activeId === item.id;
                        
                        const imgAspect = imageAspectsRef.current[item.id];
                        let isCoverSnap = false, isContainSnap = false;
                        let layoutStyle: React.CSSProperties = { position: 'absolute', top: '50%', left: '50%', maxWidth: 'none', transform: `translate(-50%, -50%) scale(${item.scale}) translate(${item.x}%, ${item.y}%)`, willChange: 'transform' };

                        if (imgAspect && !isOriginal) {
                             let slotRatio = 1;
                             if (item.ratio !== 'original') { const [w, h] = item.ratio.split(':').map(Number); slotRatio = w / h; }
                             let contain = 1.0;
                             if (imgAspect > slotRatio) { contain = slotRatio / imgAspect; layoutStyle.height = '100%'; layoutStyle.width = 'auto'; } 
                             else { contain = imgAspect / slotRatio; layoutStyle.width = '100%'; layoutStyle.height = 'auto'; }
                             const SNAP_THRESHOLD = 0.05;
                             isCoverSnap = Math.abs(item.scale - 1.0) < SNAP_THRESHOLD;
                             isContainSnap = Math.abs(item.scale - contain) < SNAP_THRESHOLD;
                        } else if (!isOriginal) { layoutStyle.minWidth = '100%'; layoutStyle.minHeight = '100%'; }

                        const isSnapped = (isCoverSnap || isContainSnap) && item.x === 0 && item.y === 0;
                        let snapText = 'Snapped'; if (isSnapped) { if (isCoverSnap) snapText = '↔ Cover'; else if (isContainSnap) snapText = '↕ Fit'; }

                        return (
                            <div 
                                key={`${item.id}-${item.ratio}`}
                                ref={(el) => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
                                onClick={(e) => { e.stopPropagation(); if (!isAnchor) setSelectedId(item.id); }}
                                className={`relative bg-gray-200 group select-none transition-all w-full ${isSelected ? (isSnapped ? 'ring-4 ring-emerald-500 z-20' : 'ring-4 ring-indigo-500 z-20') : (isAnchor ? 'z-0' : 'hover:ring-2 hover:ring-indigo-300/50')} ${isReordering ? 'opacity-80 scale-[1.02] z-50' : ''}`}
                                style={{ aspectRatio: isOriginal ? undefined : item.ratio.replace(':', '/'), height: isOriginal ? 'auto' : undefined, touchAction: 'none' }}
                            >
                                {!isAnchor && (
                                    <div className={`absolute left-0 top-0 bottom-0 w-10 z-30 flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors ${isSelected ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600' : 'bg-black/5 hover:bg-black/10 text-gray-500 opacity-0 group-hover:opacity-100'}`} onPointerDown={(e) => handleReorderDown(e, item.id)} title="Drag to Reorder">
                                        <GripVertical className="w-5 h-5 drop-shadow-sm" />
                                    </div>
                                )}
                                {isAnchor && <div className="absolute top-2 left-2 z-30 bg-gray-800/80 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm pointer-events-none backdrop-blur-sm flex items-center gap-1"><Lock className="w-3 h-3" /> FIXED ANCHOR</div>}
                                {isSnapped && isSelected && !isAnchor && <div className="absolute top-2 right-2 z-30 bg-emerald-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm pointer-events-none backdrop-blur-sm flex items-center gap-1 animate-in fade-in zoom-in duration-200"><Scan className="w-3 h-3" />{snapText}</div>}

                                {isOriginal ? (
                                    <div className={`relative w-full overflow-hidden ${isAnchor ? 'cursor-default' : 'cursor-move'}`}
                                        onPointerDown={isAnchor ? undefined : (e) => handlePointerDown(e, item)}
                                        onPointerMove={isAnchor ? undefined : (e) => handlePointerMove(e, item)}
                                        onPointerUp={isAnchor ? undefined : (e) => handlePointerUp(e, item)}
                                        onPointerCancel={isAnchor ? undefined : (e) => handlePointerUp(e, item)}
                                        style={{ touchAction: 'none' }}
                                    >
                                         <img src={item.url} draggable={false} style={{ display: 'block', width: '100%', height: 'auto', transform: `scale(${item.scale}) translate(${item.x}%, ${item.y}%)`, willChange: 'transform', maxWidth: 'none' }} />
                                    </div>
                                ) : (
                                    <div className={`absolute inset-0 w-full h-full overflow-hidden bg-gray-100 ${isAnchor ? 'cursor-default' : 'cursor-move'}`}
                                        onPointerDown={isAnchor ? undefined : (e) => handlePointerDown(e, item)}
                                        onPointerMove={isAnchor ? undefined : (e) => handlePointerMove(e, item)}
                                        onPointerUp={isAnchor ? undefined : (e) => handlePointerUp(e, item)}
                                        onPointerCancel={isAnchor ? undefined : (e) => handlePointerUp(e, item)}
                                        style={{ touchAction: 'none' }}
                                    >
                                        <img src={item.url} draggable={false} style={layoutStyle} />
                                    </div>
                                )}

                                {isSelected && !isAnchor && !reorderState && (
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900/85 backdrop-blur-md p-1.5 rounded-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 border border-white/10">
                                        <div className="relative group/select">
                                            <select value={item.ratio} onChange={(e) => updateItem(item.id, { ratio: e.target.value as AspectRatio, scale: 1, x: 0, y: 0 })} className="appearance-none bg-transparent text-white text-xs font-medium pl-3 pr-7 py-1.5 rounded-lg hover:bg-white/10 cursor-pointer outline-none transition-colors" onPointerDown={(e) => e.stopPropagation()}>
                                                {RATIOS.map(r => <option key={r.value} value={r.value} className="text-gray-900">{r.label}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/70 pointer-events-none" />
                                        </div>
                                        <button onClick={() => updateItem(item.id, { scale: 1, x: 0, y: 0 })} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Reset Position & Scale"><RotateCcw className="w-3.5 h-3.5" /></button>
                                        <div className="w-px h-4 bg-white/20 mx-1"></div>
                                        <button onClick={() => removeItem(item.id)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors" title="Remove Image"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <label onClick={(e) => e.stopPropagation()} className="w-full h-12 border-2 border-dashed border-gray-300/50 hover:border-indigo-400 hover:bg-indigo-50 rounded-lg flex items-center justify-center text-gray-400 hover:text-indigo-600 cursor-pointer transition-all mt-2 shrink-0 opacity-60 hover:opacity-100">
                        <span className="text-xs font-bold flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Add Bottom</span>
                        <input type="file" multiple accept="image/*" className="hidden" onChange={e => { if(e.target.files && e.target.files.length > 0) { addFiles(e.target.files, 'bottom'); e.target.value = ''; }}} />
                    </label>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200 z-50 pb-safe">
                <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-8">
                    <div className="flex items-center bg-gray-100 rounded-full p-1 border border-gray-200">
                        <button onClick={zoomOutView} className="p-1.5 hover:bg-white rounded-full text-gray-500 transition-all"><Minus className="w-3 h-3" /></button>
                        <span className="text-xs font-mono w-12 text-center text-gray-600">{Math.round(viewScale * 100)}%</span>
                        <button onClick={zoomInView} className="p-1.5 hover:bg-white rounded-full text-gray-500 transition-all"><PlusIcon className="w-3 h-3" /></button>
                        <div className="w-px h-4 bg-gray-300 mx-1"></div>
                        <button onClick={resetView} className="p-1.5 hover:bg-white rounded-full text-gray-500 transition-all" title="Reset View"><RotateCcw className="w-3 h-3" /></button>
                    </div>

                    <div className="flex items-center gap-8 justify-center w-full md:w-auto">
                        <div className="flex flex-col items-center gap-1.5">
                             <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-gray-200 shadow-sm cursor-pointer active:scale-95 transition-transform">
                                <div className="absolute inset-0" style={{ backgroundColor: config.backgroundColor }} />
                                <input type="color" value={config.backgroundColor} onChange={e => setConfig(p => ({...p, backgroundColor: e.target.value}))} className="absolute -top-4 -left-4 w-20 h-20 cursor-pointer opacity-0" />
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Background</span>
                        </div>
                        
                        {/* Border (Padding) - Stepper Mode */}
                        <div className="relative flex flex-col items-center gap-1.5">
                            {activeControl === 'padding' && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-10 bg-gray-900 shadow-xl rounded-full z-[70] flex flex-col items-center gap-1 py-2 animate-in fade-in slide-in-from-bottom-2 zoom-in-95">
                                     <button 
                                        onPointerDown={() => handleStepper('padding', 1)}
                                        className="p-1 text-white/80 hover:text-white active:scale-90 transition-transform"
                                     >
                                         <ChevronUp className="w-5 h-5" />
                                     </button>
                                     <div className="text-xs font-bold text-white tabular-nums py-1">{config.outerPadding}</div>
                                     <button 
                                        onPointerDown={() => handleStepper('padding', -1)}
                                        className="p-1 text-white/80 hover:text-white active:scale-90 transition-transform"
                                     >
                                         <ChevronDown className="w-5 h-5" />
                                     </button>
                                     <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900 rotate-45"></div>
                                </div>
                            )}
                            <button onClick={() => setActiveControl(activeControl === 'padding' ? null : 'padding')} className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm transition-all active:scale-95 ${activeControl === 'padding' ? 'bg-gray-900 border-gray-900 text-white z-[70] relative' : 'bg-white border-gray-200 text-gray-900'}`}><span className="text-sm font-bold">{config.outerPadding}</span></button>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Border</span>
                        </div>

                         {/* Spacing (Gap) - Stepper Mode */}
                         <div className="relative flex flex-col items-center gap-1.5">
                            {activeControl === 'gap' && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-10 bg-gray-900 shadow-xl rounded-full z-[70] flex flex-col items-center gap-1 py-2 animate-in fade-in slide-in-from-bottom-2 zoom-in-95">
                                     <button 
                                        onPointerDown={() => handleStepper('gap', 1)}
                                        className="p-1 text-white/80 hover:text-white active:scale-90 transition-transform"
                                     >
                                         <ChevronUp className="w-5 h-5" />
                                     </button>
                                     <div className="text-xs font-bold text-white tabular-nums py-1">{config.innerSpacing}</div>
                                     <button 
                                        onPointerDown={() => handleStepper('gap', -1)}
                                        className="p-1 text-white/80 hover:text-white active:scale-90 transition-transform"
                                     >
                                         <ChevronDown className="w-5 h-5" />
                                     </button>
                                     <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900 rotate-45"></div>
                                </div>
                            )}
                            <button onClick={() => setActiveControl(activeControl === 'gap' ? null : 'gap')} className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm transition-all active:scale-95 ${activeControl === 'gap' ? 'bg-gray-900 border-gray-900 text-white z-[70] relative' : 'bg-white border-gray-200 text-gray-900'}`}><span className="text-sm font-bold">{config.innerSpacing}</span></button>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Spacing</span>
                        </div>
                    </div>

                    <button onClick={handleDownload} disabled={isGenerating} className="w-full md:w-auto px-6 py-2 bg-gray-900 hover:bg-black text-white font-semibold rounded-full shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 text-sm">{isGenerating ? 'Processing...' : <><Download className="w-4 h-4" /> Export Story</>}</button>
                </div>
            </div>
        </div>
    );
};

export default MomentsStitcher;