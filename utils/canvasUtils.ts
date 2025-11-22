
import { CropArea, StitchItem, StitchConfig } from '../types';

export const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
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
  // The UI container (uiContainerSize) shows the crop box.
  // We need to map the UI coordinates (which are relative to the UI box) to the Canvas coordinates.
  const K = outputSize / uiContainerSize;
  const imgAspect = img.width / img.height;

  // Calculate dimensions of the image as it would be drawn to "cover" the outputSize square.
  let drawWidth, drawHeight;

  if (imgAspect > 1) {
    // Landscape: Height = BoxHeight. Width = Height * Aspect
    drawHeight = outputSize;
    drawWidth = outputSize * imgAspect;
  } else {
    // Portrait/Square: Width = BoxWidth. Height = Width / Aspect
    drawWidth = outputSize;
    drawHeight = outputSize / imgAspect;
  }

  // User Transforms
  // crop.x / crop.y are translations in UI pixels. Convert to Canvas pixels.
  const moveX = crop.x * K;
  const moveY = crop.y * K;

  ctx.save();
  
  // 1. Move origin to center of canvas
  ctx.translate(outputSize / 2, outputSize / 2);
  
  // 2. Apply Panning (X/Y)
  ctx.translate(moveX, moveY);
  
  // 3. Apply Scaling
  ctx.scale(crop.scale, crop.scale);
  
  // 4. Draw Image Centered (at the calculated cover size)
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
       // For original, we maintain the image aspect ratio fully visible?
       // OR does it behave like "Cover" in a dynamic height box?
       // In the DOM preview for 'original', height is auto, so it just fits width.
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

  // Total Canvas Height
  const totalContentHeight = drawData.reduce((acc, d) => acc + d.slotHeight + d.spacing, 0);
  // Remove last spacing
  const finalSpacing = drawData.length > 0 ? drawData[drawData.length - 1].spacing : 0;
  const totalHeight = totalContentHeight - finalSpacing + (config.outerPadding * 2);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context failed');

  // Fill Background
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let currentY = config.outerPadding;

  drawData.forEach(({ img, slotHeight, item, spacing }) => {
    // Define the slot area
    const slotX = config.outerPadding;
    const slotY = currentY;

    ctx.save();
    
    // Clip to the slot area (so scaled/moved images don't bleed)
    ctx.beginPath();
    ctx.rect(slotX, slotY, contentWidth, slotHeight);
    ctx.clip();

    // Optional: Fill slot with white behind image (transparency handling)
    ctx.fillStyle = '#eee';
    ctx.fillRect(slotX, slotY, contentWidth, slotHeight);

    // --- Drawing Logic matching CSS "Object-fit: Cover" + "Transform" ---
    
    const slotAspect = contentWidth / slotHeight;
    const imgAspect = img.width / img.height;
    
    let drawW, drawH;

    // Logic for 'cover':
    if (imgAspect > slotAspect) {
      // Image wider: Height = slotHeight, Width = scaled
      drawH = slotHeight;
      drawW = drawH * imgAspect;
    } else {
      // Image taller: Width = contentWidth, Height = scaled
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

    // 3. Apply User Panning (Translate)
    // In CSS: translate(x%, y%). Percent is relative to the element (the image itself).
    // Wait, CSS translate percentage is relative to the element bounding box.
    // So if drawW=500, 10% = 50px.
    const moveX = (item.x || 0) / 100 * drawW; 
    const moveY = (item.y || 0) / 100 * drawH;
    
    ctx.translate(moveX, moveY);

    // 4. Draw centered image
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();

    currentY += slotHeight + spacing;
  });

  // Use PNG for lossless quality
  return canvas.toDataURL('image/png');
};
