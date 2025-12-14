#!/usr/bin/env node

/**
 * Test script for Cognito agent invite flow
 *
 * This script:
 * 1. Logs in as broker@hatchcrm.test
 * 2. Creates an agent invite for a test email
 * 3. Displays the generated Cognito signup URL
 * 4. Shows the invite details
 */

const API_URL = 'http://localhost:4000/api/v1';

async function testInviteFlow() {
  console.log('🧪 Testing Cognito Agent Invite Flow\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Login as broker
    console.log('\n📝 Step 1: Logging in as broker@hatchcrm.test...');
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'broker@hatchcrm.test',
        password: 'password123'  // Default seed password
      })
    });

    if (!loginResponse.ok) {
      const error = await loginResponse.text();
      console.error('❌ Login failed:', error);
      console.log('\n💡 Note: If broker user has no password, you may need to:');
      console.log('   1. Update seed.ts to add passwordHash for broker user');
      console.log('   2. Or use a different auth method to get a token');
      return;
    }

    const loginData = await loginResponse.json();
    const accessToken = loginData.accessToken;
    console.log('✅ Login successful!');
    console.log(`   User: ${loginData.user.email}`);
    console.log(`   Role: ${loginData.user.role}`);
    console.log(`   Token: ${accessToken.substring(0, 30)}...`);

    // Step 2: Create agent invite
    console.log('\n📧 Step 2: Creating agent invite...');
    const testEmail = `test-agent-${Date.now()}@example.com`;

    const inviteResponse = await fetch(`${API_URL}/organizations/org-hatch/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        email: testEmail
      })
    });

    if (!inviteResponse.ok) {
      const error = await inviteResponse.text();
      console.error('❌ Invite creation failed:', error);
      return;
    }

    const inviteData = await inviteResponse.json();
    console.log('✅ Invite created successfully!');
    console.log(`   Invite ID: ${inviteData.id}`);
    console.log(`   Email: ${inviteData.email}`);
    console.log(`   Token: ${inviteData.token}`);
    console.log(`   Status: ${inviteData.status}`);
    console.log(`   Expires: ${inviteData.expiresAt}`);

    // Step 3: Generate Cognito signup URL
    console.log('\n🔗 Step 3: Generating Cognito signup URL...');

    const cognitoDomain = process.env.COGNITO_DOMAIN || 'https://us-east-1ch1jwrise.auth.us-east-1.amazoncognito.com';
    const clientId = process.env.COGNITO_CLIENT_ID || '3offtahrkccej3n55avkl8mkkn';
    const redirectUri = process.env.COGNITO_REDIRECT_URI || 'https://d84l1y8p4kdic.cloudfront.net';

    const state = Buffer.from(JSON.stringify({ inviteToken: inviteData.token })).toString('base64');
    const signupUrl = `${cognitoDomain}/signup?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}/auth/cognito/callback&state=${state}&login_hint=${encodeURIComponent(testEmail)}`;

    console.log('✅ Cognito Signup URL generated!');
    console.log(`\n📋 Signup URL:\n${signupUrl}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!\n');

    console.log('📝 Next steps to test the full flow:');
    console.log('   1. Check server logs for email send attempt');
    console.log('   2. Open the signup URL in a browser');
    console.log('   3. Complete Cognito signup');
    console.log('   4. Verify callback creates user with org association');
    console.log('   5. Check that invite status is updated to ACCEPTED\n');

    // Step 4: Verify email was sent (check logs)
    console.log('💌 Email status:');
    console.log('   Check API logs above for "Invite email sent" message');
    console.log('   Or "Demo mode: skipping email" if in demo mode\n');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
  }
}

// Run the test
testInviteFlow();
