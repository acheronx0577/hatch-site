import { supabase } from '@/integrations/supabase/client';

export interface AdminBootstrapResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'broker' | 'customer';
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  price: number;
  location: string;
  property_type: string;
  status: 'active' | 'inactive' | 'sold';
  broker_id: string;
  created_at: string;
  updated_at: string;
}

const createAdminUser = async (email: string, password: string): Promise<AdminBootstrapResult> => {
  try {
    // First, try to sign up the user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      console.error('Sign up error:', signUpError);
      return {
        success: false,
        message: `Failed to create user: ${signUpError.message}`,
      };
    }

    if (!signUpData.user) {
      return {
        success: false,
        message: 'Failed to create user: No user data returned',
      };
    }

    // Wait a moment for the user to be created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Now create the profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: signUpData.user.id,
        email: email,
        full_name: 'System Administrator',
        role: 'admin',
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return {
        success: false,
        message: `Failed to create admin profile: ${profileError.message}`,
      };
    }

    return {
      success: true,
      message: 'Admin user created successfully',
      details: {
        userId: signUpData.user.id,
        email: email,
      },
    };
  } catch (error) {
    console.error('Unexpected error in createAdminUser:', error);
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

const createSampleData = async (): Promise<AdminBootstrapResult> => {
  try {
    // Create sample broker
    const { data: brokerAuth, error: brokerAuthError } = await supabase.auth.signUp({
      email: 'broker@example.com',
      password: 'broker123',
    });

    if (brokerAuthError || !brokerAuth.user) {
      return {
        success: false,
        message: `Failed to create broker user: ${brokerAuthError?.message || 'No user data'}`,
      };
    }

    // Create broker profile
    const { error: brokerProfileError } = await supabase
      .from('profiles')
      .insert({
        id: brokerAuth.user.id,
        email: 'broker@example.com',
        full_name: 'Sample Broker',
        role: 'broker',
      });

    if (brokerProfileError) {
      return {
        success: false,
        message: `Failed to create broker profile: ${brokerProfileError.message}`,
      };
    }

    // Create sample customer
    const { data: customerAuth, error: customerAuthError } = await supabase.auth.signUp({
      email: 'customer@example.com',
      password: 'customer123',
    });

    if (customerAuthError || !customerAuth.user) {
      return {
        success: false,
        message: `Failed to create customer user: ${customerAuthError?.message || 'No user data'}`,
      };
    }

    // Create customer profile
    const { error: customerProfileError } = await supabase
      .from('profiles')
      .insert({
        id: customerAuth.user.id,
        email: 'customer@example.com',
        full_name: 'Sample Customer',
        role: 'customer',
      });

    if (customerProfileError) {
      return {
        success: false,
        message: `Failed to create customer profile: ${customerProfileError.message}`,
      };
    }

    // Create sample properties
    const sampleProperties = [
      {
        title: 'Modern Downtown Apartment',
        description: 'Beautiful 2-bedroom apartment in the heart of downtown',
        price: 350000,
        location: 'Downtown',
        property_type: 'apartment',
        status: 'active' as const,
        broker_id: brokerAuth.user.id,
      },
      {
        title: 'Suburban Family Home',
        description: 'Spacious 4-bedroom house with large backyard',
        price: 550000,
        location: 'Suburbs',
        property_type: 'house',
        status: 'active' as const,
        broker_id: brokerAuth.user.id,
      },
    ];

    const { error: propertiesError } = await supabase
      .from('properties')
      .insert(sampleProperties);

    if (propertiesError) {
      return {
        success: false,
        message: `Failed to create sample properties: ${propertiesError.message}`,
      };
    }

    return {
      success: true,
      message: 'Sample data created successfully',
      details: {
        brokerId: brokerAuth.user.id,
        customerId: customerAuth.user.id,
        propertiesCount: sampleProperties.length,
      },
    };
  } catch (error) {
    console.error('Unexpected error in createSampleData:', error);
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

export const bootstrapAdmin = async (adminEmail: string, adminPassword: string): Promise<AdminBootstrapResult> => {
  try {
    console.log('Starting admin bootstrap process...');

    // Step 1: Create admin user
    const adminResult = await createAdminUser(adminEmail, adminPassword);
    if (!adminResult.success) {
      return adminResult;
    }

    // Step 2: Create sample data
    const sampleDataResult = await createSampleData();
    if (!sampleDataResult.success) {
      return {
        success: false,
        message: `Admin created but sample data failed: ${sampleDataResult.message}`,
        details: {
          adminCreated: true,
          sampleDataCreated: false,
        },
      };
    }

    return {
      success: true,
      message: 'Admin bootstrap completed successfully',
      details: {
        adminCreated: true,
        sampleDataCreated: true,
        ...adminResult.details,
        ...sampleDataResult.details,
      },
    };
  } catch (error) {
    console.error('Bootstrap error:', error);
    return {
      success: false,
      message: `Bootstrap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

export const checkAdminExists = async (): Promise<{ exists: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1);

    if (error) {
      return { exists: false, error: error.message };
    }

    return { exists: data && data.length > 0 };
  } catch (error) {
    return { 
      exists: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
