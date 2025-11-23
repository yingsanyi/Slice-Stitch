
import { CropArea, StitchItem, StitchConfig } from '../types';

export const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Fix for local blob URLs: usually don't need crossOrigin, 
    // but if it's an external URL, we do.
    if (!url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (e) => {
        console.error("Failed to load image", url, e);
        reject(e);
    };
    img.src = url;
  });
};

// --- Feature 1: 9-Grid Slicer ---

export const generateNineGrid = async (
  imageUrl: string,
  crop: CropArea,
  uiContainerSize: number 
): Promise<string[]> => {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Canvas context not available');

  // QUALITY FIX: 
  // Use the image's intrinsic size to ensure no resolution loss.
  // We cap the minimum at 1080 to ensure even small images generate usable social media slices.
  const sourceMinDimension = Math.min(img.width, img.height);
  const outputSize = Math.max(1080, sourceMinDimension);
  
  canvas.width = outputSize;
  canvas.height = outputSize;

  // Fill background white (for when zoomed out)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputSize, outputSize);

  // Logic to match CSS "object-fit: cover" exactly
  const K = outputSize / uiContainerSize;
  const imgAspect = img.width / img.height;

  let drawWidth, drawHeight;

  if (imgAspect > 1) {
    // Landscape
    drawHeight = outputSize;
    drawWidth = outputSize * imgAspect;
  } else {
    // Portrait/Square
    drawWidth = outputSize;
    drawHeight = outputSize / imgAspect;
  }

  // User Transforms
  const moveX = crop.x * K;
  const moveY = crop.y * K;

  ctx.save();
  ctx.translate(outputSize / 2, outputSize / 2);
  ctx.translate(moveX, moveY);
  ctx.scale(crop.scale, crop.scale);
  ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();

  // Slice into 9 parts
  const slices: string[] = [];
  const partSize = outputSize / 3;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = partSize;
      pCanvas.height = partSize;
      const pCtx = pCanvas.getContext('2d');
      if (!pCtx) continue;

      pCtx.drawImage(
        canvas,
        col * partSize,
        row * partSize,
        partSize,
        partSize,
        0,
        0,
        partSize,
        partSize
      );
      // Use PNG for lossless quality
      slices.push(pCanvas.toDataURL('image/png'));
    }
  }

  return slices;
};


// --- Feature 2: Long Stitcher ---

export const generateStitchedImage = async (
  items: StitchItem[],
  config: StitchConfig,
  outputWidth: number = 1080
): Promise<string> => {
  const loadedImages = await Promise.all(items.map(item => loadImage(item.url)));
  
  // Calculate content width (inside borders)
  const contentWidth = outputWidth - (config.outerPadding * 2);
  
  // Calculate heights
  const drawData = items.map((item, index) => {
    const img = loadedImages[index];
    const imgAspect = img.width / img.height;
    let slotHeight: number;

    if (item.ratio === 'original') {
       slotHeight = contentWidth / imgAspect;
    } else {
      const [w, h] = item.ratio.split(':').map(Number);
      const targetAspect = w / h;
      slotHeight = contentWidth / targetAspect;
    }
    
    const spacing = index < items.length - 1 ? config.innerSpacing : 0;

    return {
      img,
      slotHeight,
      item,
      spacing
    };
  });

  // Total Logical Height
  const totalContentHeight = drawData.reduce((acc, d) => acc + d.slotHeight + d.spacing, 0);
  const finalSpacing = drawData.length > 0 ? drawData[drawData.length - 1].spacing : 0;
  const totalHeight = totalContentHeight - finalSpacing + (config.outerPadding * 2);

  // --- SAFETY CHECK & DOWNSCALE ---
  // Mobile browsers often crash above 16k pixels height or > 50MP area.
  // We set a safe limit of ~50 Megapixels (e.g. 5000 x 10000).
  const MAX_AREA = 50 * 1000 * 1000; 
  const currentArea = outputWidth * totalHeight;
  
  let finalScale = 1.0;
  if (currentArea > MAX_AREA) {
      finalScale = Math.sqrt(MAX_AREA / currentArea);
      console.warn(`Canvas too large (${outputWidth}x${totalHeight}), downscaling by ${finalScale.toFixed(2)} to prevent crash.`);
  }

  const canvas = document.createElement('canvas');
  // Apply scale to physical dimensions
  canvas.width = Math.floor(outputWidth * finalScale);
  canvas.height = Math.floor(totalHeight * finalScale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context failed');

  // CRITICAL FIX: Scale the context!
  // All drawing commands below use logical coords (outputWidth), 
  // so we must scale the context to map them to the smaller physical canvas.
  ctx.scale(finalScale, finalScale);

  // Fill Background
  ctx.fillStyle = config.backgroundColor;
  // We fill using logical dimensions because we already scaled the context
  ctx.fillRect(0, 0, outputWidth, totalHeight);

  let currentY = config.outerPadding;

  drawData.forEach(({ img, slotHeight, item, spacing }) => {
    const slotX = config.outerPadding;
    const slotY = currentY;

    ctx.save();
    
    // Clip to the slot area
    ctx.beginPath();
    ctx.rect(slotX, slotY, contentWidth, slotHeight);
    ctx.clip();

    // Fill slot background
    ctx.fillStyle = config.backgroundColor; // Match main bg or use white? Usually transparent/match bg.
    ctx.fillRect(slotX, slotY, contentWidth, slotHeight);

    const slotAspect = contentWidth / slotHeight;
    const imgAspect = img.width / img.height;
    
    let drawW, drawH;

    // Logic for 'cover' / 'contain' simulation based on user scale
    // The UI uses a hybrid model. But assuming standard 'cover' logic base:
    if (imgAspect > slotAspect) {
      drawH = slotHeight;
      drawW = drawH * imgAspect;
    } else {
      drawW = contentWidth;
      drawH = drawW / imgAspect;
    }

    // 1. Move to Center of Slot
    const centerX = slotX + contentWidth / 2;
    const centerY = slotY + slotHeight / 2;
    ctx.translate(centerX, centerY);

    // 2. Apply User Scaling
    const scale = item.scale || 1;
    ctx.scale(scale, scale);

    // 3. Apply User Panning
    // Note: In UI, x/y are percentages of the IMAGE size, not the slot.
    // But checking LongImageStitcher logic: `translate(${item.x}%, ${item.y}%)` applied to img.
    // This translates relative to the element (the image).
    // So x=10 means 10% of drawW.
    const moveX = (item.x || 0) / 100 * drawW; 
    const moveY = (item.y || 0) / 100 * drawH;
    
    ctx.translate(moveX, moveY);

    // 4. Draw centered image
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();

    currentY += slotHeight + spacing;
  });

  // Use Blob instead of DataURL to handle large files
  return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
          if (blob) {
              resolve(URL.createObjectURL(blob));
          } else {
              reject(new Error("Canvas export failed (empty blob)"));
          }
      }, 'image/png');
  });
};
