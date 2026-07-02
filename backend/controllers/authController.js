const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { findUserByUsernameOrEmail, saveUser, verifyPassword } = require('../utils/userPersistence');

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Try to register in Supabase if not in offline mode
    if (process.env.DB_MODE !== 'offline') {
      // Check if user exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq."${email}",username.eq."${username}"`)
        .maybeSingle();

      if (checkError) {
        throw new Error(checkError.message);
      }

      if (existingUser) {
        console.log(`❌ Registration: User already exists - ${username}`);
        return res.status(400).json({ message: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new user
      const { data: user, error: insertError } = await supabase
        .from('users')
        .insert([{ 
          username, 
          email, 
          password: hashedPassword, 
          role: 'admin',
          is_active: true
        }])
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log(`✅ User registered: ${username}`);
      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: { id: user.id, _id: user.id, username: user.username, email: user.email, role: user.role },
      });
    } else {
      // Use offline storage
      const result = saveUser({ username, email, password, role: 'admin' });
      
      if (!result.success) {
        console.log(`❌ Registration: ${result.error} - ${username}`);
        return res.status(400).json({ message: result.error });
      }

      const token = jwt.sign(
        { userId: result.user._id, role: result.user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log(`✅ User registered (offline): ${username}`);
      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: { id: result.user._id, _id: result.user._id, username: result.user.username, email: result.user.email, role: result.user.role },
      });
    }
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Please provide username and password' });
    }

    // Try to login using Supabase if not in offline mode
    if (process.env.DB_MODE !== 'offline') {
      // Find user
      let query = supabase.from('users').select('*');
      if (username.includes('@')) {
        query = query.eq('email', username);
      } else {
        query = query.eq('username', username);
      }
      const { data: user, error: findError } = await query.maybeSingle();

      if (findError) {
        throw new Error(findError.message);
      }

      if (!user) {
        console.log(`❌ Login attempt: User not found - ${username}`);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Compare passwords
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        console.log(`❌ Login attempt: Invalid password for user - ${username}`);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log(`✅ Login successful: ${username}`);
      res.status(200).json({
        message: 'Login successful',
        token,
        user: { id: user.id, _id: user.id, username: user.username, email: user.email, role: user.role },
      });
    } else {
      // Use offline storage
      const user = findUserByUsernameOrEmail(username, username);
      
      if (!user) {
        console.log(`❌ Login attempt (offline): User not found - ${username}`);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Verify password
      if (!verifyPassword(user.password, password)) {
        console.log(`❌ Login attempt (offline): Invalid password for user - ${username}`);
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log(`✅ Login successful (offline): ${username}`);
      res.status(200).json({
        message: 'Login successful',
        token,
        user: { id: user._id, _id: user._id, username: user.username, email: user.email, role: user.role },
      });
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    if (process.env.DB_MODE === 'offline') {
      return res.status(400).json({ message: 'User creation is not supported in offline mode' });
    }

    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq."${email}",username.eq."${username}"`)
      .maybeSingle();

    if (checkError) throw new Error(checkError.message);

    if (existingUser) {
      return res.status(400).json({ message: 'User with this username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data: user, error: insertError } = await supabase
      .from('users')
      .insert([{
        username,
        email,
        password: hashedPassword,
        role,
        is_active: true
      }])
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    res.status(201).json({
      message: 'User created successfully',
      user: { id: user.id, _id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('❌ Create user error:', error.message);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    if (process.env.DB_MODE === 'offline') {
      return res.status(400).json({ message: 'Listing users is not supported in offline mode' });
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, role, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    const mappedUsers = users.map(u => ({
      ...u,
      _id: u.id
    }));

    res.status(200).json({
      message: 'Users retrieved successfully',
      data: mappedUsers
    });
  } catch (error) {
    console.error('❌ Get all users error:', error.message);
    res.status(500).json({ message: 'Error retrieving users', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (process.env.DB_MODE === 'offline') {
      return res.status(400).json({ message: 'Deleting users is not supported in offline mode' });
    }

    if (id === req.userId) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('❌ Delete user error:', error.message);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

module.exports = { register, login, createUser, getAllUsers, deleteUser };


