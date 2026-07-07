'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslate } from '@/i18n';
import { editorFetch } from '@/lib/editor-fetch';
import { logger } from '@/lib/logger';

const log = logger('useImageLibrary');

export interface DirectoryInfo {
  name: string;
  path: string;
  imageCount: number;
}

interface UseImageLibraryOptions {
  initialDirectory: string;
}

interface UseImageLibraryReturn {
  // Directory state
  directories: DirectoryInfo[];
  selectedDir: string;
  setSelectedDir: (dir: string) => void;
  loadingDirs: boolean;

  // Image state
  images: string[];
  selectedImage: string | null;
  setSelectedImage: (img: string | null) => void;
  loadingImages: boolean;

  // Upload state
  uploading: boolean;
  uploadProgress: string;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Folder creation state
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  showNewFolder: boolean;
  setShowNewFolder: (show: boolean) => void;

  // Delete state
  deletingImage: string | null;

  // Actions
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDeleteImage: (imageUrl: string) => Promise<void>;
  handleCreateFolder: () => Promise<void>;
  handleDeleteFolder: () => Promise<void>;

  // Refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  newFolderInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useImageLibrary({ initialDirectory }: UseImageLibraryOptions): UseImageLibraryReturn {
  const t = useTranslate('core');
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [selectedDir, setSelectedDir] = useState(initialDirectory);
  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadingDirs, setLoadingDirs] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [deletingImage, setDeletingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const fetchIdRef = useRef(0);

  // Fetch directories
  const fetchDirectories = useCallback(async () => {
    setLoadingDirs(true);
    try {
      const res = await editorFetch('/api/backgrounds/directories');
      if (res.ok) {
        const data = await res.json();
        setDirectories(data.directories ?? []);
      }
    } catch (err) {
      log.debug('fetchDirectories failed:', err);
    }
    setLoadingDirs(false);
  }, []);

  // Fetch images for selected directory (with stale-response guard)
  const fetchImages = useCallback(async (dir: string, preserveError = false) => {
    const id = ++fetchIdRef.current;
    setLoadingImages(true);
    if (!preserveError) setError(null);
    try {
      const url = dir
        ? `/api/backgrounds?directory=${encodeURIComponent(dir)}`
        : '/api/backgrounds';
      const res = await editorFetch(url);
      if (id !== fetchIdRef.current) return; // stale, discard
      if (res.ok) {
        const data = await res.json();
        setImages(Array.isArray(data) ? data : []);
      } else {
        setImages([]);
        if (!preserveError) setError(t('errors.loadImagesFailed'));
      }
    } catch {
      if (id !== fetchIdRef.current) return;
      setImages([]);
      if (!preserveError) setError(t('errors.loadImagesFailed'));
    }
    if (id === fetchIdRef.current) setLoadingImages(false);
  }, [t]);

  useEffect(() => {
    fetchDirectories();
  }, [fetchDirectories]);

  useEffect(() => {
    fetchImages(selectedDir);
  }, [selectedDir, fetchImages]);

  useEffect(() => {
    if (showNewFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [showNewFolder]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setError(null);
    const total = fileList.length;
    let hadError = false;
    let hadSuccess = false;

    for (let i = 0; i < total; i++) {
      setUploadProgress(`Uploading ${i + 1} of ${total}...`);
      const formData = new FormData();
      formData.append('file', fileList[i]);
      if (selectedDir) formData.append('directory', selectedDir);

      try {
        const res = await editorFetch('/api/backgrounds', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || `Upload failed for ${fileList[i].name}`);
          hadError = true;
        } else {
          hadSuccess = true;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.uploadFailed'));
        hadError = true;
      }
    }

    setUploading(false);
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Refresh images and directories only if at least one upload succeeded
    if (hadSuccess) {
      fetchImages(selectedDir, hadError);  // preserve error if some uploads failed
      fetchDirectories();
    }
  }, [selectedDir, fetchImages, fetchDirectories, t]);

  const handleDeleteImage = useCallback(async (imageUrl: string) => {
    // Extract filename from serve URL
    const url = new URL(imageUrl, 'http://localhost');
    const file = url.searchParams.get('file') || '';
    if (!file) return;

    // Extract directory and basename from the file path
    const parts = file.split('/');
    const basename = parts.pop() || '';
    const directory = parts.join('/');

    setDeletingImage(imageUrl);
    try {
      const res = await editorFetch('/api/backgrounds', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: basename, directory: directory || undefined }),
      });
      if (res.ok) {
        setImages((prev) => prev.filter((img) => img !== imageUrl));
        setSelectedImage((prev) => prev === imageUrl ? null : prev);
        fetchDirectories();
      }
    } catch (err) {
      log.debug('deleteImage failed:', err);
    }
    setDeletingImage(null);
  }, [fetchDirectories]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    try {
      const res = await editorFetch('/api/backgrounds/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parent: selectedDir || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewFolderName('');
        setShowNewFolder(false);
        fetchDirectories();
        setSelectedDir(data.path);
      } else {
        const data = await res.json();
        setError(data.error || t('errors.createFolderFailed'));
      }
    } catch {
      setError(t('errors.createFolderFailed'));
    }
  }, [newFolderName, selectedDir, fetchDirectories, t]);

  const handleDeleteFolder = useCallback(async () => {
    if (!selectedDir) return;
    try {
      const res = await editorFetch('/api/backgrounds/directories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedDir }),
      });
      if (res.ok) {
        setSelectedDir('');
        fetchDirectories();
      } else {
        const data = await res.json();
        setError(data.error || t('errors.deleteFolderFailed'));
      }
    } catch {
      setError(t('errors.deleteFolderFailed'));
    }
  }, [selectedDir, fetchDirectories, t]);

  return {
    directories,
    selectedDir,
    setSelectedDir,
    loadingDirs,
    images,
    selectedImage,
    setSelectedImage,
    loadingImages,
    uploading,
    uploadProgress,
    error,
    setError,
    newFolderName,
    setNewFolderName,
    showNewFolder,
    setShowNewFolder,
    deletingImage,
    handleUpload,
    handleDeleteImage,
    handleCreateFolder,
    handleDeleteFolder,
    fileInputRef,
    newFolderInputRef,
  };
}
