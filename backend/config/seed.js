const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

const initializeDatabase = async () => {
  try {
    // 1. Seed Superadmin
    const { data: superadminUser, error: superadminError } = await supabase
      .from('users')
      .select('id')
      .eq('username', 'superadmin')
      .maybeSingle();

    if (superadminError) {
      console.error('❌ Failed to check superadmin user in Supabase:', superadminError.message);
    } else if (!superadminUser) {
      console.log('📦 Seeding default superadmin user in Supabase...');
      const hashedPassword = bcrypt.hashSync('SuperAdmin#2026!Secure', 10);
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
        console.error('❌ Failed to seed superadmin user:', insertError.message);
      } else {
        console.log('✅ Default superadmin user created!');
        console.log('   Email: kabirhaldar4444@gmail.com');
        console.log('   Password: SuperAdmin#2026!Secure');
      }
    } else {
      console.log('📊 Superadmin user already seeded');
    }

    // 2. Seed Admin
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('id')
      .eq('username', 'admin')
      .maybeSingle();

    if (adminError) {
      console.error('❌ Failed to check admin user in Supabase:', adminError.message);
    } else if (!adminUser) {
      console.log('📦 Seeding default admin user in Supabase...');
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      const { error: insertError } = await supabase
        .from('users')
        .insert([{
          username: 'admin',
          email: 'admin@callaudit.com',
          password: hashedPassword,
          role: 'admin',
          is_active: true
        }]);

      if (insertError) {
        console.error('❌ Failed to seed admin user:', insertError.message);
      } else {
        console.log('✅ Default admin user created!');
        console.log('   Username: admin');
        console.log('   Password: admin123');
      }
    } else {
      console.log('📊 Admin user already seeded');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
  }
};

module.exports = initializeDatabase;

