import { useCallback, useState } from 'react';
import { X, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DraftImage } from '@/features/jobs/jobsSlice';

interface ImageDropZoneProps {
  label: string;
  image: DraftImage | null;
  onImageSet: (image: DraftImage) => void;
  onImageClear: () => void;
  disabled?: boolean;
  className?: string;
}

export function ImageDropZone({
  label,
  image,
  onImageSet,
  onImageClear,
  disabled = false,
  className,
}: ImageDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;

      // Read as data URL for preview
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // Extract base64 without the data URL prefix
      const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!base64Match) return;

      const draftImage: DraftImage = {
        dataUrl,
        bytesBase64Encoded: base64Match[1],
        mimeType: file.type,
      };

      onImageSet(draftImage);
    },
    [onImageSet]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (disabled) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        await processFile(file);
      }
    },
    [disabled, processFile]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await processFile(file);
      }
    };
    input.click();
  }, [disabled, processFile]);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onImageClear();
    },
    [onImageClear]
  );

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center',
        'w-20 h-20 rounded-lg border-2 border-dashed',
        'transition-colors cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed',
        isDragOver && !disabled && 'border-primary bg-primary/10',
        !isDragOver && !image && 'border-muted-foreground/30 hover:border-muted-foreground/50',
        image && 'border-transparent',
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      {image ? (
        <>
          <img
            src={image.dataUrl}
            alt={label}
            className="w-full h-full object-cover rounded-md"
          />
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'absolute -top-1.5 -right-1.5',
              'w-5 h-5 rounded-full',
              'bg-destructive text-destructive-foreground',
              'flex items-center justify-center',
              'hover:bg-destructive/90 transition-colors',
              'shadow-sm'
            )}
          >
            <X className="size-3" />
          </button>
        </>
      ) : (
        <>
          <ImagePlus className="size-5 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground/70 mt-1 text-center px-1 leading-tight">
            {label}
          </span>
        </>
      )}
    </div>
  );
}
