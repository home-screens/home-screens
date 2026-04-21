'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';

interface DirectoryInfo {
  name: string;
  path: string;
  imageCount: number;
}

export default function PhotosTab({ directory: initialDirectory }: { directory: string }) {
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [selectedDir, setSelectedDir] = useState(initialDirectory);
  const [images, setImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deletingImage, setDeletingImage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fetchIdRef = useRef(0);

  // Fetch directories
  const fetchDirectories = useCallback(async () => {
    try {
      const res = await editorFetch('/api/backgrounds/directories');
      if (res.ok) {
        const data = await res.json();
        setDirectories(data.directories ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch images for selected directory
  const fetchImages = useCallback(async (dir: string) => {
    const id = ++fetchIdRef.current;
    setLoadingImages(true);
    setError(null);
    try {
      const url = dir
        ? `/api/backgrounds?directory=${encodeURIComponent(dir)}`
        : '/api/backgrounds';
      const res = await editorFetch(url);
      if (id !== fetchIdRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setImages(Array.isArray(data) ? data : []);
      } else {
        setImages([]);
      }
    } catch {
      if (id !== fetchIdRef.current) return;
      setImages([]);
    }
    if (id === fetchIdRef.current) setLoadingImages(false);
  }, []);

  useEffect(() => { fetchDirectories(); }, [fetchDirectories]);
  useEffect(() => { fetchImages(selectedDir); }, [selectedDir, fetchImages]);

  // Flash success message
  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }, []);

  // Upload handler
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setError(null);
    const total = fileList.length;
    let succeeded = 0;

    for (let i = 0; i < total; i++) {
      setUploadProgress(`Uploading ${i + 1} of ${total}...`);
      const formData = new FormData();
      formData.append('file', fileList[i]);
      if (selectedDir) formData.append('directory', selectedDir);

      try {
        const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || `Upload failed for ${fileList[i].name}`);
        } else {
          succeeded++;
        }
      } catch (err) {
        if (isSessionExpired(err)) return;
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    }

    setUploading(false);
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (succeeded > 0) {
      showSuccess(`${succeeded} photo${succeeded > 1 ? 's' : ''} uploaded`);
      fetchImages(selectedDir);
      fetchDirectories();
    }
  }, [selectedDir, fetchImages, fetchDirectories, showSuccess]);

  // Delete handler
  const handleDeleteImage = useCallback(async (imageUrl: string) => {
    const url = new URL(imageUrl, 'http://localhost');
    const file = url.searchParams.get('file') || '';
    if (!file) return;

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
        fetchDirectories();
        showSuccess('Photo deleted');
      }
    } catch { /* ignore */ }
    setDeletingImage(null);
    setConfirmDelete(null);
  }, [fetchDirectories, showSuccess]);

  // Create folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await editorFetch('/api/backgrounds/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), parent: selectedDir || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewFolderName('');
        setShowNewFolder(false);
        fetchDirectories();
        setSelectedDir(data.path);
        showSuccess('Folder created');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create folder');
      }
    } catch (err) {
      if (isSessionExpired(err)) return;
      setError('Failed to create folder');
    }
  }, [newFolderName, selectedDir, fetchDirectories, showSuccess]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-hs-text-primary">Photos</h2>
        <button
          onClick={() => setShowNewFolder(!showNewFolder)}
          className="text-xs text-hs-accent active:text-hs-accent-hover min-h-[44px] px-3 flex items-center"
        >
          {showNewFolder ? 'Cancel' : 'New Folder'}
        </button>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            placeholder="Folder name"
            autoFocus
            className="flex-1 px-3 py-2.5 text-sm bg-hs-card border border-hs-border-strong rounded-lg text-hs-text-primary placeholder:text-hs-text-faint focus:outline-none focus:border-hs-accent"
          />
          <button
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim()}
            className="px-4 py-2.5 text-sm font-medium bg-hs-accent text-white rounded-lg disabled:opacity-40 active:bg-hs-accent-hover min-h-[44px]"
          >
            Create
          </button>
        </div>
      )}

      {/* Directory pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
        <button
          onClick={() => setSelectedDir('')}
          className={`flex-shrink-0 px-3.5 py-2 text-sm rounded-full min-h-[44px] flex items-center transition-colors ${
            selectedDir === ''
              ? 'bg-hs-accent text-white'
              : 'bg-hs-card text-hs-text-muted active:bg-hs-hover'
          }`}
        >
          All Photos
        </button>
        {directories
          .filter((d) => d.path !== '')
          .map((d) => (
            <button
              key={d.path}
              onClick={() => setSelectedDir(d.path)}
              className={`flex-shrink-0 px-3.5 py-2 text-sm rounded-full min-h-[44px] flex items-center gap-1.5 transition-colors ${
                selectedDir === d.path
                  ? 'bg-hs-accent text-white'
                  : 'bg-hs-card text-hs-text-muted active:bg-hs-hover'
              }`}
            >
              {d.name}
              <span className={`text-xs ${selectedDir === d.path ? 'text-hs-accent-hover' : 'text-hs-text-faint'}`}>
                {d.imageCount}
              </span>
            </button>
          ))}
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="flex items-center gap-2 px-3 py-2 bg-hs-success/10 border border-hs-success/30 rounded-lg text-sm text-hs-success">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-hs-danger/10 border border-hs-danger/20 rounded-lg text-sm text-hs-danger">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-hs-danger min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2 -mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}

      {/* Upload button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          onChange={handleUpload}
          className="hidden"
          id="photo-upload"
        />
        <label
          htmlFor="photo-upload"
          className={`flex items-center justify-center gap-2 w-full py-3.5 text-sm font-medium rounded-xl min-h-[52px] transition-colors cursor-pointer ${
            uploading
              ? 'bg-hs-card text-hs-text-faint'
              : 'bg-hs-accent text-white active:bg-hs-accent-hover'
          }`}
        >
          {uploading ? (
            <>
              <div className="w-4 h-4 border-2 border-hs-border-strong border-t-hs-text-secondary rounded-full animate-spin" />
              {uploadProgress}
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              Upload Photos
            </>
          )}
        </label>
      </div>

      {/* Photo grid */}
      {loadingImages ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-hs-border-strong border-t-hs-text-secondary rounded-full animate-spin" />
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 mx-auto text-hs-text-faint">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
          </svg>
          <p className="text-hs-text-faint text-sm">No photos in this folder</p>
          <p className="text-hs-text-faint text-xs">Tap Upload Photos to add images</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((img) => (
            <div key={img} className="relative aspect-square group">
              <img
                src={img}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover rounded-lg"
              />
              {/* Delete button */}
              {confirmDelete === img ? (
                <div className="absolute inset-0 bg-black/70 rounded-lg flex flex-col items-center justify-center gap-2">
                  <span className="text-xs text-hs-text-secondary">Delete?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteImage(img)}
                      disabled={deletingImage === img}
                      className="px-3 py-1.5 text-xs font-medium bg-hs-danger text-white rounded-md min-h-[36px] active:opacity-90"
                    >
                      {deletingImage === img ? 'Deleting...' : 'Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1.5 text-xs font-medium bg-hs-card text-hs-text-secondary rounded-md min-h-[36px] active:bg-hs-hover"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(img)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center bg-black/60 rounded-full text-white/70 active:text-white opacity-0 group-active:opacity-100 transition-opacity"
                  style={{ opacity: undefined }}
                  aria-label="Delete photo"
                  onPointerDown={(e) => {
                    // Show delete button on touch
                    const target = e.currentTarget;
                    target.style.opacity = '1';
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.78.72l.5 6.5a.75.75 0 01-1.49.12l-.5-6.5a.75.75 0 01.71-.84zm3.62.72a.75.75 0 00-1.49-.12l-.5 6.5a.75.75 0 001.49.12l.5-6.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
