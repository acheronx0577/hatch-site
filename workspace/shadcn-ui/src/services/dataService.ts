import { Property, MLSPropertyForm } from '@/types';
import { mockProperties } from '@/data/mockProperties';

class DataService {
  private storageKey = 'broker_properties';

  // Get all properties
  getAllProperties(): Property[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const storedProperties = JSON.parse(stored);
        // Merge with mock properties, avoiding duplicates
        const mockIds = new Set(mockProperties.map(p => p.id));
        const uniqueStored = storedProperties.filter((p: Property) => !mockIds.has(p.id));
        return [...mockProperties, ...uniqueStored];
      }
      return mockProperties;
    } catch (error) {
      console.error('Error loading properties:', error);
      return mockProperties;
    }
  }

  // Add new property
  addProperty(formData: MLSPropertyForm): Property {
    try {
      const newProperty: Property = {
        id: this.generatePropertyId(),
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        neighborhood: formData.neighborhood,
        price: formData.price,
        bedrooms: formData.mls.lotProperty.bedrooms,
        bathrooms: formData.mls.lotProperty.bathroomsTotal,
        squareFeet: formData.mls.lotProperty.buildingSqFtLivingArea,
        lotSize: formData.mls.lotProperty.lotAcres,
        propertyType: formData.propertyType,
        propertyCategory: formData.propertyCategory,
        yearBuilt: formData.mls.lotProperty.yearBuilt,
        daysOnMarket: 0, // New listing
        listingStatus: formData.listingStatus,
        listingType: formData.listingType,
        features: formData.features,
        imageUrl: formData.imageUrl || 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop',
        listingDate: new Date().toISOString().split('T')[0],
        description: formData.description,
        isSaved: false,
        condition: formData.condition,
        zoning: formData.mls.location.zoning,
        acres: formData.mls.lotProperty.lotAcres,
        agent: {
          name: formData.agentName,
          phone: formData.agentPhone,
          email: formData.agentEmail,
          company: formData.agentCompany
        },
        mls: formData.mls
      };

      // Get existing stored properties
      const existingProperties = this.getStoredProperties();
      
      // Add new property
      const updatedProperties = [...existingProperties, newProperty];
      
      // Save to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify(updatedProperties));
      
      return newProperty;
    } catch (error) {
      console.error('Error adding property:', error);
      throw new Error('Failed to add property');
    }
  }

  // Update existing property
  updateProperty(id: string, updates: Partial<Property>): Property | null {
    try {
      const properties = this.getAllProperties();
      const propertyIndex = properties.findIndex(p => p.id === id);
      
      if (propertyIndex === -1) {
        throw new Error('Property not found');
      }

      const updatedProperty = { ...properties[propertyIndex], ...updates };
      properties[propertyIndex] = updatedProperty;

      // Save only non-mock properties to localStorage
      const storedProperties = properties.filter(p => !mockProperties.some(mp => mp.id === p.id));
      localStorage.setItem(this.storageKey, JSON.stringify(storedProperties));
      
      return updatedProperty;
    } catch (error) {
      console.error('Error updating property:', error);
      return null;
    }
  }

  // Delete property
  deleteProperty(id: string): boolean {
    try {
      const properties = this.getAllProperties();
      const filteredProperties = properties.filter(p => p.id !== id);
      
      // Save only non-mock properties to localStorage
      const storedProperties = filteredProperties.filter(p => !mockProperties.some(mp => mp.id === p.id));
      localStorage.setItem(this.storageKey, JSON.stringify(storedProperties));
      
      return true;
    } catch (error) {
      console.error('Error deleting property:', error);
      return false;
    }
  }

  // Get property by ID
  getPropertyById(id: string): Property | null {
    const properties = this.getAllProperties();
    return properties.find(p => p.id === id) || null;
  }

  // Private helper methods
  private getStoredProperties(): Property[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading stored properties:', error);
      return [];
    }
  }

  private generatePropertyId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `PROP_${timestamp}_${random}`;
  }

  // Get statistics
  getPropertyStats() {
    const properties = this.getAllProperties();
    const totalValue = properties.reduce((sum, p) => sum + p.price, 0);
    const avgPrice = properties.length > 0 ? totalValue / properties.length : 0;
    const newListings = properties.filter(p => p.daysOnMarket <= 7).length;
    const activeListings = properties.filter(p => p.listingStatus === 'Active').length;

    return {
      totalProperties: properties.length,
      totalValue,
      avgPrice,
      newListings,
      activeListings
    };
  }
}

export const dataService = new DataService();
