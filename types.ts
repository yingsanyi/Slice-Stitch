export interface CropArea {
  x: number;
  y: number;
  scale: number;
}

export type AspectRatio = 'original' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export interface StitchItem {
  id: string;
  file: File;
  url: string;
  ratio: AspectRatio;
  // Transformations inside the container
  scale: number; 
  x: number; // -100 to 100 (percentage)
  y: number; // -100 to 100 (percentage)
}

export interface StitchConfig {
  outerPadding: number;
  innerSpacing: number;
  backgroundColor: string;
}

export interface SlicedImage {
  id: number;
  url: string;
}