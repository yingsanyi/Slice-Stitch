import React, { useState, useEffect } from 'react';
import { LayoutGrid, ScrollText, Scissors, Layers } from 'lucide-react';
import NineGridSlicer from './components/NineGridSlicer';
import LongImageStitcher from './components/LongImageStitcher';
import MomentsStitcher from './components/MomentsStitcher';

function App() {
  const [activeTab, setActiveTab] = useState<'grid' | 'stitch' | 'moments'>('grid');

  // Global Drag prevention to stop browser from opening file
  useEffect(() => {
    const preventDefault = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
        window.removeEventListener('dragover', preventDefault);
        window.removeEventListener('drop', preventDefault);
    };
  }, []);

  return (
    <div className="h-screen bg-gray-50 font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md z-50 shrink-0 h-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shrink-0">
                    <Scissors className="w-4 h-4 text-white" />
                </div>
                <div className="flex flex-col md:flex-row md:items-baseline md:gap-3 whitespace-nowrap overflow-hidden text-ellipsis">
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                        Slice & Stitch
                    </h1>
                    <span className="hidden md:block text-gray-300">|</span>
                    <p className="text-xs md:text-sm text-gray-500 font-medium truncate">
                        {activeTab === 'grid' && 'Social Grid Maker'}
                        {activeTab === 'stitch' && 'Seamless Vertical Stories'}
                        {activeTab === 'moments' && 'WeChat Hidden Stories'}
                    </p>
                </div>
            </div>
            <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg shrink-0">
                <button
                    onClick={() => setActiveTab('grid')}
                    className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                        activeTab === 'grid' 
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4" />
                        <span className="hidden sm:inline">9-Grid</span>
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('stitch')}
                    className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                        activeTab === 'stitch' 
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <ScrollText className="w-4 h-4" />
                        <span className="hidden sm:inline">Long Stitch</span>
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('moments')}
                    className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                        activeTab === 'moments' 
                        ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' 
                        : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        <span className="hidden sm:inline">Moments</span>
                    </span>
                </button>
            </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'grid' && (
            <div className="h-full overflow-y-auto custom-scrollbar">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <NineGridSlicer />
                </div>
            </div>
        )}
        {activeTab === 'stitch' && (
            <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                <LongImageStitcher />
            </div>
        )}
        {activeTab === 'moments' && (
            <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-500 bg-gray-50">
                <MomentsStitcher />
            </div>
        )}
      </main>
    </div>
  );
}

export default App;