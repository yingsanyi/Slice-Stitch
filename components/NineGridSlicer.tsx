
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Download, Move, RefreshCw, ZoomIn, Image as ImageIcon, Trash2, Package, MousePointerClick, RotateCcw, ChevronDown, FolderOutput, FileArchive } from 'lucide-react';
import { CropArea, SlicedImage } from '../types';
import { generateNineGrid } from '../utils/canvasUtils';
import JSZip from 'jszip';

const NineGridSlicer: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState<number>(1);
  // Initial scale 1.0
  const [crop, setCrop] = useState<CropArea>({ x: 0, y: 0, scale: 1 });
  const [slices, setSlices] = useState<SlicedImage[]>([]);
  
  // Pointer/Gesture State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
  const initialPinchDist = useRef<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Enable Wheel Zoom (Trackpad/Mouse)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !image) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const ZOOM_SENSITIVITY = 0.0015;
      const MIN_SCALE = 0.2;
      const MAX_SCALE = 3.0;

      setCrop((prev) => {
        const delta = -e.deltaY * ZOOM_SENSITIVITY;
        const newScale = Math.min(Math.max(MIN_SCALE, prev.scale + delta), MAX_SCALE);
        return { ...prev, scale: newScale };
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [image]);

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    
    // Pre-load to get aspect ratio
    const img = new Image();
    img.onload = () => {
        setImageAspect(img.width / img.height);
        setImage(url);
        setSlices([]);
        setCrop({ x: 0, y: 0, scale: 1 });
    };
    img.src = url;
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Unified Pointer Handler for Mouse Drag & Touch Pinch
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
        // Start Drag
        setIsDragging(true);
        setDragStart({ x: e.clientX - crop.x, y: e.clientY - crop.y });
    } else if (activePointers.current.size === 2) {
        // Start Pinch - Stop dragging
        setIsDragging(false);
        const pts = Array.from(activePointers.current.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialPinchDist.current = dist;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return;
    e.preventDefault();
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2) {
        // Handle Pinch
        const pts = Array.from(activePointers.current.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        
        if (initialPinchDist.current) {
            const delta = dist - initialPinchDist.current;
            const ZOOM_SENSITIVITY = 0.005; // Sensitivity for touch pinch
            const MIN_SCALE = 0.2;
            const MAX_SCALE = 3.0;
            
            setCrop(prev => {
                const newScale = Math.min(Math.max(MIN_SCALE, prev.scale + delta * ZOOM_SENSITIVITY), MAX_SCALE);
                return { ...prev, scale: newScale };
            });
            // Update initial dist to avoid continuous compounding (optional, but better for relative delta)
            initialPinchDist.current = dist;
        }
    } else if (activePointers.current.size === 1 && isDragging) {
        // Handle Drag
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        setCrop((prev) => ({ ...prev, x: newX, y: newY }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (activePointers.current.size < 2) {
        initialPinchDist.current = null;
    }
    
    if (activePointers.current.size === 0) {
        setIsDragging(false);
    } else if (activePointers.current.size === 1) {
        // If one finger remains, maybe resume dragging? 
        // Usually simpler to force re-grab to prevent jumping
        setIsDragging(false);
    }
  };

  const handleGenerate = async () => {
    if (!image || !containerRef.current) return;
    setLoading(true);
    
    setTimeout(async () => {
        try {
            const generatedSlices = await generateNineGrid(
                image, 
                crop, 
                containerRef.current!.clientWidth
            );
            setSlices(generatedSlices.map((url, i) => ({ id: i, url })));
        } catch (error) {
            console.error(error);
            alert("Failed to generate slices.");
        } finally {
            setLoading(false);
        }
    }, 50);
  };

  const downloadSlice = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `slice_${index + 1}.png`; // High quality PNG
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const convertPngToJpeg = (pngUrl: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% quality JPG
            } else {
                resolve(pngUrl);
            }
        };
        img.src = pngUrl;
    });
  };

  const downloadAll = async (format: 'png' | 'jpg', method: 'zip' | 'separate' = 'zip') => {
    if (slices.length === 0) return;
    setIsDownloadMenuOpen(false);
    
    if (method === 'separate') {
        for (let i = 0; i < slices.length; i++) {
            let url = slices[i].url;
            if (format === 'jpg') {
                url = await convertPngToJpeg(url);
            }
            const a = document.createElement('a');
            a.href = url;
            a.download = `slice_${i + 1}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        return;
    }

    const zip = new JSZip();
    const folder = zip.folder("9-grid-images");
    
    const processPromises = slices.map(async (slice, i) => {
        let dataUrl = slice.url;
        const extension = format === 'jpg' ? 'jpg' : 'png';
        
        if (format === 'jpg') {
            dataUrl = await convertPngToJpeg(slice.url);
        }
        
        const data = dataUrl.split(',')[1];
        folder?.file(`slice_${i + 1}.${extension}`, data, { base64: true });
    });

    await Promise.all(processPromises);

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nine_grid_pack.${format === 'jpg' ? 'zip' : 'zip'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isLandscape = imageAspect > 1;
  const combinedTransform = `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px) scale(${crop.scale})`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto h-[calc(100vh-140px)] min-h-[600px]">
      {/* Backdrop for download menu */}
      {isDownloadMenuOpen && (
          <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsDownloadMenuOpen(false)} />
      )}

      {/* Editor Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm h-full flex flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Move className="w-5 h-5 text-indigo-500" />
                1. Position & Scale
            </h2>
            {image && (
                <button 
                    onClick={() => setImage(null)}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium transition-colors"
                >
                    <Trash2 className="w-3 h-3" /> Clear
                </button>
            )}
          </div>

          {!image ? (
            <label 
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center w-full h-full border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 group ${
                    isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:bg-gray-50 hover:border-indigo-400'
                }`}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <div className="w-16 h-16 bg-indigo-100 group-hover:bg-indigo-200 rounded-full flex items-center justify-center mb-4 text-indigo-600 transition-colors">
                    <Upload className="w-8 h-8" />
                </div>
                <p className="mb-2 text-base text-gray-700 font-medium">
                  Drop image here or click to upload
                </p>
                <p className="text-sm text-gray-500">JPG or PNG</p>
              </div>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
          ) : (
            <div className="flex flex-col items-center gap-6 flex-1 overflow-y-auto custom-scrollbar pt-2 pb-2">
              {/* Viewport Container */}
              <div className="relative w-full max-w-[400px] shadow-lg rounded-xl overflow-hidden bg-gray-100 ring-4 ring-gray-100 mx-auto aspect-square shrink-0">
                  <div 
                    className="relative w-full h-full cursor-move overflow-hidden bg-white"
                    ref={containerRef}
                    style={{ touchAction: 'none' }} // DISABLE BROWSER SCROLL/ZOOM for gestures
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  >
                    <div className="absolute top-2 left-2 z-30 text-[10px] text-gray-500 font-medium bg-white/90 px-2 py-1 rounded shadow-sm backdrop-blur-sm pointer-events-none border border-gray-200/50">
                        Drag to move • Pinch to zoom
                    </div>

                    <img 
                        src={image} 
                        alt="Source" 
                        draggable={false}
                        className="select-none max-w-none"
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: isLandscape ? 'auto' : '100%',
                            height: isLandscape ? '100%' : 'auto',
                            transform: combinedTransform,
                        }}
                    />

                    <div className="absolute inset-0 z-20 pointer-events-none grid grid-cols-3 grid-rows-3 border-2 border-indigo-500/50">
                        {[...Array(9)].map((_, i) => (
                            <div key={i} className="border border-white/40 shadow-[0_0_1px_rgba(0,0,0,0.2)]"></div>
                        ))}
                    </div>
                </div>
              </div>

              {/* Controls */}
              <div className="w-full max-w-[400px] space-y-5 bg-gray-50 p-5 rounded-xl border border-gray-100 mt-auto mx-auto shrink-0">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Zoom Level</span>
                        <div className="flex items-center gap-3">
                             <button
                                 onClick={() => setCrop({ x: 0, y: 0, scale: 1 })}
                                 className="text-[10px] font-semibold text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors flex items-center gap-1.5"
                                 title="Reset position and scale"
                             >
                                 <RotateCcw className="w-3 h-3" /> Reset View
                             </button>
                             <span className="text-xs text-gray-700 font-bold tabular-nums">{crop.scale.toFixed(2)}x</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <ZoomIn className="w-4 h-4 text-gray-400" />
                        <input 
                            type="range" 
                            min="0.2" 
                            max="3" 
                            step="0.01" 
                            value={crop.scale} 
                            onChange={(e) => setCrop(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500"
                        />
                    </div>
                </div>
                
                <button 
                    onClick={handleGenerate}
                    disabled={loading}
                    className="w-full py-3.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                >
                    {loading ? 'Processing...' : <><RefreshCw className="w-4 h-4" /> Slice Image</>}
                </button>
              </div>
            </div>
          )}
      </div>

      {/* Results Section */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm h-full flex flex-col">
        <div className="flex items-center justify-between mb-6 shrink-0">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Download className="w-5 h-5 text-green-500" />
                2. Save Results
            </h2>
            {slices.length > 0 && (
                <div className="relative">
                    <button 
                        onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                        className="text-sm bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition-colors"
                    >
                        <Package className="w-4 h-4" /> Batch Download <ChevronDown className="w-3 h-3" />
                    </button>
                    {isDownloadMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-1">
                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <FileArchive className="w-3 h-3" /> Download as ZIP
                                </div>
                                <button 
                                    onClick={() => downloadAll('png', 'zip')} 
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg text-gray-700 font-medium flex items-center justify-between group"
                                >
                                    <span>Original Quality</span>
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded group-hover:bg-white">PNG</span>
                                </button>
                                <button 
                                    onClick={() => downloadAll('jpg', 'zip')} 
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg text-gray-700 font-medium flex items-center justify-between group"
                                >
                                    <span>Compressed</span>
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded group-hover:bg-white">JPG</span>
                                </button>

                                <div className="my-1 border-t border-gray-100"></div>
                                
                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <FolderOutput className="w-3 h-3" /> Separate Files
                                </div>
                                <button 
                                    onClick={() => downloadAll('png', 'separate')} 
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg text-gray-700 font-medium flex items-center justify-between group"
                                >
                                    <span>Original Quality</span>
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded group-hover:bg-white">PNG</span>
                                </button>
                                <button 
                                    onClick={() => downloadAll('jpg', 'separate')} 
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg text-gray-700 font-medium flex items-center justify-between group"
                                >
                                    <span>Compressed</span>
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded group-hover:bg-white">JPG</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
        
        {slices.length > 0 ? (
            <div className="flex-1 flex flex-col items-center gap-6 overflow-y-auto custom-scrollbar pt-2 pb-2">
                <div className="grid grid-cols-3 gap-1 w-full max-w-[400px] aspect-square bg-white shadow-lg p-1.5 rounded-xl border border-gray-100 ring-4 ring-gray-100 mx-auto shrink-0">
                    {slices.map((slice, idx) => (
                        <div key={idx} className="relative group aspect-square overflow-hidden bg-gray-100 rounded-[2px]">
                            <img src={slice.url} alt={`Slice ${idx}`} className="w-full h-full object-cover block" />
                            <div 
                                className="absolute inset-0 bg-indigo-900/60 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center cursor-pointer"
                                onClick={() => downloadSlice(slice.url, idx)}
                            >
                                <Download className="text-white w-6 h-6 drop-shadow-md transform scale-90 group-hover:scale-100 transition-transform" />
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-xl text-sm flex items-start gap-3 w-full max-w-[400px] mx-auto mt-auto shadow-sm border border-blue-100">
                    <MousePointerClick className="w-5 h-5 shrink-0 mt-0.5" />
                    <p>Click any single piece to download it, or use the "Batch Download" button above to get them all.</p>
                </div>
            </div>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 m-4">
                <ImageIcon className="w-12 h-12 mb-3 text-gray-300" />
                <p className="font-medium">Preview will appear here</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default NineGridSlicer;
