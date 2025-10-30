import { supabase } from '@/integrations/supabase/client';

export interface EmergencyAdminResult {
  success: boolean;
  message: string;
  adminId?: string;
}

export const createEmergencyAdmin = async (): Promise<EmergencyAdminResult> => {
  try {
    console.log('Creating emergency admin...');
    
    const adminEmail = 'admin@realestate.com';
    const adminPassword = 'admin123!';
    
    // First check if admin already exists
    const { data: existingProfiles, error: checkError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('role', 'admin')
      .limit(1);
    
    if (checkError) {
      console.error('Error checking existing admin:', checkError);
    } else if (existingProfiles && existingProfiles.length > 0) {
      return {
        success: true,
        message: 'Admin already exists',
        adminId: existingProfiles[0].id,
      };
    }
    
    // Try to sign in first to see if user exists
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    
    let userId: string;
    
    if (signInError || !signInData.user) {
      // User doesn't exist, create new one
      console.log('Creating new admin user...');
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
      });
      
      if (signUpError || !signUpData.user) {
        return {
          success: false,
          message: `Failed to create admin user: ${signUpError?.message || 'Unknown error'}`,
        };
      }
      
      userId = signUpData.user.id;
    } else {
      userId = signInData.user.id;
    }
    
    // Create or update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: adminEmail,
        full_name: 'Emergency Administrator',
        role: 'admin',
      });
    
    if (profileError) {
      console.error('Profile error:', profileError);
      return {
        success: false,
        message: `Failed to create admin profile: ${profileError.message}`,
      };
    }
    
    return {
      success: true,
      message: 'Emergency admin created successfully',
      adminId: userId,
    };
  } catch (error) {
    console.error('Emergency admin setup error:', error);
    return {
      success: false,
      message: `Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

export const setupEmergencyAccess = async (): Promise<EmergencyAdminResult> => {
  try {
    // Create emergency admin
    const adminResult = await createEmergencyAdmin();
    if (!adminResult.success) {
      return adminResult;
    }
    
    // Additional setup can be added here if needed
    console.log('Emergency access setup completed');
    
    return {
      success: true,
      message: 'Emergency access setup completed successfully',
      adminId: adminResult.adminId,
    };
  } catch (error) {
    console.error('Emergency access setup error:', error);
    return {
      success: false,
      message: `Emergency access setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

// Function to check if emergency admin exists
export const checkEmergencyAdmin = async (): Promise<{ exists: boolean; adminId?: string; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('email', 'admin@realestate.com')
      .limit(1);
    
    if (error) {
      return { exists: false, error: error.message };
    }
    
    return { 
      exists: data && data.length > 0,
      adminId: data && data.length > 0 ? data[0].id : undefined
    };
  } catch (error) {
    return { 
      exists: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
