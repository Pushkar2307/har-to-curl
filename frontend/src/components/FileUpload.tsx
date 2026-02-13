'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  currentFile: File | null;
}

export function FileUpload({
  onFileSelected,
  isLoading,
  currentFile,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files?.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.har')) {
          onFileSelected(file);
        }
      }
    },
    [onFileSelected],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length) {
        onFileSelected(files[0]);
      }
    },
    [onFileSelected],
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-10 w-10 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>

            {currentFile ? (
              <div>
                <p className="text-sm font-medium">{currentFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(currentFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium">
                  Drop your .har file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports HTTP Archive (.har) files up to 150MB
                </p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => document.getElementById('har-file-input')?.click()}
            >
              {isLoading ? 'Uploading...' : currentFile ? 'Choose Different File' : 'Browse Files'}
            </Button>

            <input
              id="har-file-input"
              type="file"
              accept=".har"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
