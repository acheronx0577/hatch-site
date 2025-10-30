import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

const propertySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().min(0, 'Price must be positive'),
  location: z.string().min(1, 'Location is required'),
  property_type: z.enum(['house', 'apartment', 'condo', 'townhouse', 'land', 'commercial']),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  square_feet: z.number().min(0).optional(),
  lot_size: z.number().min(0).optional(),
  year_built: z.number().min(1800).max(new Date().getFullYear()).optional(),
  garage_spaces: z.number().min(0).optional(),
  features: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive', 'pending', 'sold']).default('active'),
});

type PropertyFormData = z.infer<typeof propertySchema>;

interface AddPropertyFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: Partial<PropertyFormData>;
}

interface ImageFile {
  file: File;
  preview: string;
  id: string;
}

const PROPERTY_FEATURES = [
  'Pool', 'Garage', 'Garden', 'Balcony', 'Fireplace', 'Air Conditioning',
  'Heating', 'Hardwood Floors', 'Updated Kitchen', 'Walk-in Closet',
  'Laundry Room', 'Basement', 'Attic', 'Security System', 'Fenced Yard'
];

export const AddPropertyForm: React.FC<AddPropertyFormProps> = ({ 
  onSuccess, 
  onCancel, 
  initialData 
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [newFeature, setNewFeature] = useState('');

  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
      price: initialData?.price || 0,
      location: initialData?.location || '',
      property_type: initialData?.property_type || 'house',
      bedrooms: initialData?.bedrooms || 0,
      bathrooms: initialData?.bathrooms || 0,
      square_feet: initialData?.square_feet || 0,
      lot_size: initialData?.lot_size || 0,
      year_built: initialData?.year_built || undefined,
      garage_spaces: initialData?.garage_spaces || 0,
      features: initialData?.features || [],
      status: initialData?.status || 'active',
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 10,
    onDrop: (acceptedFiles: File[]) => {
      const newImages: ImageFile[] = acceptedFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        id: Math.random().toString(36).substr(2, 9)
      }));
      setImages(prev => [...prev, ...newImages]);
    }
  });

  const removeImage = (id: string) => {
    setImages(prev => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const uploadImages = async (propertyId: string): Promise<string[]> => {
    const uploadPromises = images.map(async (image) => {
      const fileExt = image.file.name.split('.').pop();
      const fileName = `${propertyId}/${Date.now()}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('property-images')
        .upload(fileName, image.file);

      if (error) {
        console.error('Error uploading image:', error);
        throw error;
      }

      const { data } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName);

      return data.publicUrl;
    });

    return Promise.all(uploadPromises);
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      const currentFeatures = form.getValues('features') || [];
      if (!currentFeatures.includes(newFeature.trim())) {
        form.setValue('features', [...currentFeatures, newFeature.trim()]);
      }
      setNewFeature('');
    }
  };

  const removeFeature = (featureToRemove: string) => {
    const currentFeatures = form.getValues('features') || [];
    form.setValue('features', currentFeatures.filter(f => f !== featureToRemove));
  };

  const toggleFeature = (feature: string) => {
    const currentFeatures = form.getValues('features') || [];
    if (currentFeatures.includes(feature)) {
      form.setValue('features', currentFeatures.filter(f => f !== feature));
    } else {
      form.setValue('features', [...currentFeatures, feature]);
    }
  };

  const onSubmit = async (data: PropertyFormData) => {
    if (!user) {
      toast.error('You must be logged in to add a property');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create the property
      const { data: property, error: propertyError } = await supabase
        .from('properties')
        .insert({
          ...data,
          broker_id: user.id,
        })
        .select()
        .single();

      if (propertyError) throw propertyError;

      // Upload images if any
      let imageUrls: string[] = [];
      if (images.length > 0) {
        try {
          imageUrls = await uploadImages(property.id);
          
          // Update property with image URLs
          const { error: updateError } = await supabase
            .from('properties')
            .update({ images: imageUrls })
            .eq('id', property.id);

          if (updateError) {
            console.error('Error updating property with images:', updateError);
          }
        } catch (imageError) {
          console.error('Error uploading images:', imageError);
          toast.error('Property created but some images failed to upload');
        }
      }

      toast.success('Property added successfully!');
      form.reset();
      setImages([]);
      onSuccess?.();
    } catch (error) {
      console.error('Error adding property:', error);
      toast.error('Failed to add property. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchedFeatures = form.watch('features') || [];

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Add New Property</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Beautiful family home..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="property_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select property type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="house">House</SelectItem>
                        <SelectItem value="apartment">Apartment</SelectItem>
                        <SelectItem value="condo">Condo</SelectItem>
                        <SelectItem value="townhouse">Townhouse</SelectItem>
                        <SelectItem value="land">Land</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ($)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="350000" 
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main St, City, State" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bedrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedrooms</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="3" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bathrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bathrooms</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.5"
                        placeholder="2.5" 
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="square_feet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Square Feet</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="2000" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lot_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lot Size (sq ft)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="8000" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="year_built"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year Built</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="2020" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="garage_spaces"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Garage Spaces</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="2" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="sold">Sold</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe the property features, location benefits, etc..." 
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Features Section */}
            <div className="space-y-4">
              <FormLabel>Features</FormLabel>
              
              {/* Common Features */}
              <div className="flex flex-wrap gap-2">
                {PROPERTY_FEATURES.map((feature) => (
                  <Badge
                    key={feature}
                    variant={watchedFeatures.includes(feature) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleFeature(feature)}
                  >
                    {feature}
                  </Badge>
                ))}
              </div>

              {/* Custom Feature Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom feature"
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                />
                <Button type="button" onClick={addFeature} variant="outline">
                  Add
                </Button>
              </div>

              {/* Selected Features */}
              {watchedFeatures.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {watchedFeatures.map((feature) => (
                    <Badge key={feature} variant="secondary" className="flex items-center gap-1">
                      {feature}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeFeature(feature)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Image Upload Section */}
            <div className="space-y-4">
              <FormLabel>Property Images</FormLabel>
              
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                {isDragActive ? (
                  <p>Drop the images here...</p>
                ) : (
                  <div>
                    <p className="text-lg font-medium">Drag & drop images here</p>
                    <p className="text-sm text-gray-500">or click to select files</p>
                    <p className="text-xs text-gray-400 mt-2">Maximum 10 images, JPEG/PNG only</p>
                  </div>
                )}
              </div>

              {/* Image Previews */}
              {images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {images.map((image) => (
                    <div key={image.id} className="relative group">
                      <img
                        src={image.preview}
                        alt="Property preview"
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(image.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-6">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Adding Property...' : 'Add Property'}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
