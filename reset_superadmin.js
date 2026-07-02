const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, 'backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n❌ ERROR: SUPABASE_URL or SUPABASE_ANON_KEY is not defined in backend/.env');
  console.log('   Please make sure your backend/.env file is set up correctly with Supabase credentials.\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const reset = async () => {
  const newPassword = process.argv[2] || 'SuperAdmin#2026!Secure';
  console.log(`\n🔄 Resetting superadmin password to: "${newPassword}"...`);

  try {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // 1. Check if superadmin exists in the database
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('username', 'superadmin')
      .maybeSingle();

    if (checkError) {
      throw checkError;
    }

    if (!existingUser) {
      console.log('⚠️  superadmin user not found in database. Creating user...');
      
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          username: 'superadmin',
          email: 'kabirhaldar4444@gmail.com',
          password: hashedPassword,
          role: 'superadmin',
          is_active: true
        }]);

      if (insertError) {
        throw insertError;
      }
      
      console.log('✅ superadmin user created and seeded successfully!');
    } else {
      // 2. Update password
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', existingUser.id);

      if (updateError) {
        throw updateError;
      }

      console.log('✅ superadmin password reset successfully!');
    }

    console.log(`\n🔑 Login Credentials:`);
    console.log(`   Username: superadmin`);
    console.log(`   Password: ${newPassword}\n`);

  } catch (error) {
    console.error('❌ Reset process failed:', error.message);
  }
};

reset();
