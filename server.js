const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const { register, login, logout } = require('./authController');
const { saveMessage, getMessages } = require('./chatController');


// Setup session middleware

const sessionMiddleware = session({
  secret: 'your_secret_key', // change to a secure key
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);

// Share sessions with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Parse incoming requests
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Auth routes
app.post('/register', register);
app.post('/login', login);
app.get('/logout', logout);

// Endpoint for image uploads
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  const imageUrl = '/uploads/' + req.file.filename;
  res.json({ imageUrl });
});

// Protect the chat page – only allow authenticated users
app.get('/chat.html', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// ... (other requires and setup code)

const onlineUsers = new Set();

io.on('connection', (socket) => {
  const session = socket.request.session;
  if (!session.user) {
    // Not authenticated: you might choose to disconnect the socket
    return;
  }
  const username = session.user.username;
  
  // Add user to the online users set and join their own room
  onlineUsers.add(username);
  socket.join(username);
  
  // Broadcast the updated online users list to all connected sockets
  io.emit('updateUserList', Array.from(onlineUsers));

  // Handle private messages, typing, call events, etc.
  socket.on('private message', async ({ recipient, message, imageUrl }) => {
    await saveMessage(username, recipient, message, imageUrl);
    io.to(recipient).emit('private message', { sender: username, message, imageUrl });
  });
  
  
  socket.on('typing', ({ recipient }) => {
    io.to(recipient).emit('typing', { sender: username });
  });
  socket.on('stop typing', ({ recipient }) => {
    io.to(recipient).emit('stop typing', { sender: username });
  });
  
  socket.on('call user', ({ recipient, offer }) => {
    io.to(recipient).emit('incoming call', { caller: username, offer });
  });
  socket.on('answer call', ({ recipient, answer }) => {
    io.to(recipient).emit('call accepted', { answer });
  });
  socket.on('webrtc signal', ({ recipient, signal }) => {
    io.to(recipient).emit('webrtc signal', { signal, sender: username });
  });
  socket.on('end call', ({ recipient }) => {
    io.to(recipient).emit('call ended', { caller: username });
  });
  
  socket.on('get messages', async ({ withUser }) => {
    const messages = await getMessages(username, withUser);
    socket.emit('message history', messages);
  });
  
  // When the socket disconnects, remove the user and update the list
  socket.on('disconnect', () => {
    onlineUsers.delete(username);
    io.emit('updateUserList', Array.from(onlineUsers));
  });
});


const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
