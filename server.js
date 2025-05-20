const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;


// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/anyhunt')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  fullname: String,
  email: { type: String, unique: true },
  password: String,
});
const User = mongoose.model('User', userSchema);

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(session({
  secret: 'yourSecretKey123!',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/anyhunt' }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 },
}));

// Set current user for all views
app.use(async (req, res, next) => {
  if (req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).lean();
      res.locals.currentUser = user;
    } catch {
      res.locals.currentUser = null;
    }
  } else {
    res.locals.currentUser = null;
  }
  next();
});

// Multer Setup
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Content Store (In-Memory for Now)
let content = {
  movies: [],
  tvShows: [],
  anime: [],
  trending: []
};

// ROUTES =====================

// Home Page
app.get('/', (req, res) => {
  res.render('index', { content });
});

// Downloads Page
app.get('/downloads', (req, res) => {
  res.render('downloads', { content });
});

// Admin Panel
app.get('/admin', (req, res) => {
  res.render('admin', { content });
});

// Upload Handler
app.post('/upload', upload.single('video'), (req, res) => {
  const { title, category } = req.body;
  const video = `/uploads/${req.file.filename}`;
  const item = { id: Date.now(), title, video };

  if (content[category]) {
    content[category].push(item);
  } else {
    content.movies.push(item); // fallback
  }

  res.redirect('/admin');
});

// Delete Handler
app.post('/admin/delete', (req, res) => {
  const { id, category } = req.body;
  if (content[category]) {
    content[category] = content[category].filter(item => item.id != id);
  }
  res.redirect('/admin');
});

// =====================
// AUTHENTICATION ROUTES
// =====================

// Auth Page
app.get('/auth', (req, res) => {
  res.render('auth', { error: null, success: null });
});

// Redirect legacy auth routes
app.get('/login', (req, res) => res.redirect('/auth'));
app.get('/signup', (req, res) => res.redirect('/auth'));

// Signup Handler
app.post('/auth/signup', async (req, res) => {
  const { fullname, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 12);
  try {
    const user = await User.create({ fullname, email, password: hashedPassword });
    req.session.userId = user._id;
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.render('auth', { error: 'Email already exists.', success: null });
  }
});

// Login Handler
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.render('auth', { error: 'Invalid email.', success: null });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.render('auth', { error: 'Incorrect password.', success: null });
  }
  req.session.userId = user._id;
  res.redirect('/profile');
});

// Profile Page
app.get('/profile', async (req, res) => {
  if (!req.session.userId) return res.redirect('/auth');
  const user = await User.findById(req.session.userId).lean();
  if (!user) return res.redirect('/auth');

  res.render('profile', {
    user,
    content
  });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.log('Logout error:', err);
      return res.redirect('/profile');
    }
    res.clearCookie('connect.sid');
    res.redirect('/auth');
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
