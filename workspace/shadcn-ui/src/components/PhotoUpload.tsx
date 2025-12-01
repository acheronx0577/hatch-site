import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Upload,
  X,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
  ExternalLink
} from 'lucide-react'
import { MIN_PROPERTY_PHOTOS, MAX_PROPERTY_PHOTOS } from '@/constants/photoRequirements'
import { toast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api/client'

interface PhotoUploadProps {
  photos: string[]
  onPhotosChange: (photos: string[]) => void
  minPhotos?: number
  maxPhotos?: number
}

export default function PhotoUpload({ 
  photos = [], 
  onPhotosChange, 
  minPhotos = MIN_PROPERTY_PHOTOS, 
  maxPhotos = MAX_PROPERTY_PHOTOS 
}: PhotoUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [qualityMap, setQualityMap] = useState<Record<number, string[]>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const isPdfFile = useCallback((file: File) => {
    const name = file.name?.toLowerCase() ?? ''
    return file.type === 'application/pdf' || name.endsWith('.pdf')
  }, [])

  const isPdfUrl = useCallback((url: string) => {
    try {
      const parsed = new URL(url)
      return parsed.pathname.toLowerCase().endsWith('.pdf')
    } catch (error) {
      return url.toLowerCase().includes('.pdf')
    }
  }, [])

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return [] as string[]

    setUploading(true)
    setUploadError(null)

    try {
      const urls = await Promise.all(
        files.map(async (file) => {
          const contentType = file.type || 'application/octet-stream'
          const { data } = await apiClient.post('/property-media/presign', {
            fileName: file.name,
            mimeType: contentType,
          })

          const uploadUrl: string = data.uploadUrl
          const publicUrl: string = data.publicUrl

          const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': contentType,
            },
            body: file,
          })

          if (!putRes.ok) {
            throw new Error(`Upload failed with status ${putRes.status}`)
          }

          return publicUrl
        })
      )

      return urls
    } catch (error) {
      console.error('Media upload failed:', error)
      setUploadError('Failed to upload one or more files. Please try again.')
      return [] as string[]
    } finally {
      setUploading(false)
    }
  }, [])

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files) return

    const fileArray = Array.from(files)
    const mediaFiles = fileArray.filter(
      (file) => file.type.startsWith('image/') || isPdfFile(file)
    )

    if (mediaFiles.length === 0) {
      setUploadError('Only JPG/PNG images or PDF documents are supported.')
      return
    }

    if (photos.length + mediaFiles.length > maxPhotos) {
      toast({
        title: 'Upload limit reached',
        description: `You can add ${Math.max(maxPhotos - photos.length, 0)} more item(s).`,
        variant: 'destructive',
      })
      return
    }

    const urls = await uploadFiles(mediaFiles)
    if (urls.length > 0) {
      onPhotosChange([...photos, ...urls])
    }
  }, [photos, onPhotosChange, maxPhotos, uploadFiles, isPdfFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    void handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index)
    onPhotosChange(newPhotos)
  }

  const handleDragStartPhoto = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOverPhoto = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDropOnPhoto = (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void handleFileSelect(e.dataTransfer.files)
      setDragIndex(null)
      return
    }
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      return
    }
    const updated = [...photos]
    const [moved] = updated.splice(dragIndex, 1)
    updated.splice(targetIndex, 0, moved)
    setDragIndex(null)
    onPhotosChange(updated)
  }

  const handleDropOnGridEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void handleFileSelect(e.dataTransfer.files)
      setDragIndex(null)
      return
    }
    if (dragIndex === null) return
    const updated = [...photos]
    const [moved] = updated.splice(dragIndex, 1)
    updated.push(moved)
    setDragIndex(null)
    onPhotosChange(updated)
  }

  const handleDragEndPhoto = () => {
    setDragIndex(null)
  }

  useEffect(() => {
    let isActive = true

    const analyzePhotos = async () => {
      if (typeof window === 'undefined') {
        return
      }
      if (photos.length === 0) {
        if (isActive) setQualityMap({})
        return
      }

      const duplicateTracker = new Map<string, number[]>()
      photos.forEach((url, index) => {
        const normalized = (url || '').trim().toLowerCase()
        if (!duplicateTracker.has(normalized)) duplicateTracker.set(normalized, [])
        duplicateTracker.get(normalized)!.push(index)
      })

      const duplicateIndices = new Set<number>()
      duplicateTracker.forEach((indices) => {
        if (indices.length > 1) {
          indices.forEach((i) => duplicateIndices.add(i))
        }
      })

      const results: Record<number, string[]> = {}

      await Promise.all(
        photos.map((photoUrl, index) => new Promise<void>((resolve) => {
          const warnings: string[] = []

          if (!photoUrl) {
            results[index] = ['Missing image URL']
            resolve()
            return
          }

          if (duplicateIndices.has(index)) {
            warnings.push('Possible duplicate image')
          }

          if (isPdfUrl(photoUrl)) {
            warnings.push('PDF document')
            results[index] = warnings
            resolve()
            return
          }

          const img = new Image()
          img.crossOrigin = 'anonymous'
          const timeout = window.setTimeout(() => {
            warnings.push('Image load timed out')
            results[index] = warnings
            resolve()
          }, 5000)

          img.onload = () => {
            window.clearTimeout(timeout)
            const width = img.naturalWidth || img.width
            const height = img.naturalHeight || img.height

            if (width && height) {
              if (width < 1024 || height < 768) {
                warnings.push(`Low resolution (${width}x${height})`)
              }
              if (height > width * 1.1) {
                warnings.push('Portrait orientation – check rotation')
              }
            } else {
              warnings.push('Unable to read image dimensions')
            }
            results[index] = warnings
            resolve()
          }

          img.onerror = () => {
            window.clearTimeout(timeout)
            warnings.push('Image failed to load')
            results[index] = warnings
            resolve()
          }

          img.src = photoUrl
        }))
      )

      if (isActive) {
        setQualityMap(results)
      }
    }

    analyzePhotos()

    return () => {
      isActive = false
    }
  }, [photos])

  const flaggedPhotosCount = useMemo(
    () => Object.values(qualityMap).filter((warnings) => warnings && warnings.length > 0).length,
    [qualityMap]
  )

  const hasMinPhotos = photos.length >= minPhotos

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      {photos.length < maxPhotos && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragging 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <h4 className="text-sm font-medium text-gray-900 mb-1">
            Upload Property Photos
          </h4>
          <p className="text-xs text-gray-600 mb-2">
            Drag and drop files here, or click to browse
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => void handleFileSelect(e.target.files)}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Choose Files
              </>
            )}
          </Button>
          <p className="text-xs text-gray-500 mt-2">
            {photos.length}/{maxPhotos} uploads • JPG, PNG, PDF up to 10MB each
          </p>
        </div>
      )}

      {uploadError && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{uploadError}</AlertDescription>
        </Alert>
      )}

      {/* Photo Requirements Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {hasMinPhotos ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600" />
          )}
          <span className={`text-sm ${hasMinPhotos ? 'text-green-700' : 'text-red-700'}`}>
            {photos.length} of {minPhotos} minimum photos uploaded
          </span>
        </div>
      </div>

      {/* Photo Grid */}
      {flaggedPhotosCount > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            {flaggedPhotosCount} photo{flaggedPhotosCount === 1 ? '' : 's'} flagged for quality issues. Review the warnings displayed on each photo card below.
          </AlertDescription>
        </Alert>
      )}

      {photos.length > 0 && (
        <>
          <p className="text-xs text-gray-500">Drag and drop photos to reorder. Drop outside the grid to move a photo to the end.</p>
          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            onDragOver={handleDragOverPhoto}
            onDrop={handleDropOnGridEnd}
          >
          {photos.map((photo, index) => (
            <div
              key={index}
              className={`relative group border rounded-lg overflow-hidden cursor-move ${dragIndex === index ? 'ring-2 ring-blue-400' : ''}`}
              draggable
              onDragStart={() => handleDragStartPhoto(index)}
              onDragOver={handleDragOverPhoto}
              onDrop={(e) => handleDropOnPhoto(e, index)}
              onDragEnd={handleDragEndPhoto}
            >
              <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                {isPdfUrl(photo) ? (
                  <div className="flex flex-col items-center gap-2 text-gray-600">
                    <FileText className="h-10 w-10" />
                    <span className="text-xs font-medium">PDF Document</span>
                    <a
                      href={photo}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : (
                  <img
                    src={photo}
                    alt={`Property photo ${index + 1}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 p-0"
                onClick={() => removePhoto(index)}
                title="Remove photo"
              >
                <X className="w-3 h-3" />
              </Button>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white text-xs px-1.5 py-0.5 rounded">
                {index + 1}
              </div>
              {qualityMap[index] && qualityMap[index].length > 0 && (
                <div className="absolute inset-x-0 bottom-0 bg-red-600/80 text-white text-xs px-2 py-1 space-y-0.5">
                  {qualityMap[index].map((warning, warningIdx) => (
                    <div key={warningIdx} className="leading-tight">
                      {warning}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          </div>
        </>
      )}

      {/* Status Messages */}
      {!hasMinPhotos && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            {`You need at least ${minPhotos - photos.length} more photo${minPhotos - photos.length !== 1 ? 's' : ''} to meet listing requirements.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Instructions */}
      {photos.length === 0 && (
        <Alert>
          <ImageIcon className="h-4 w-4" />
          <AlertDescription>
            <strong>Photo Requirements:</strong> Upload high-quality photos of the property. 
            The first photo will be used as the main listing image. 
            Minimum {minPhotos} photos required for MLS compliance.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
