const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Store messages in memory (in a real app, you'd use a database)
let messages = [];
let notifications = [];

// Endpoint to receive messages from Arduino
app.post('/message', (req, res) => {
  const { content, type } = req.body;
  if (content) {
    const message = {
      content,
      timestamp: new Date().toISOString(),
      type: type || 'message'
    };
    
    if (type === 'notification') {
      notifications.push(message);
      // Keep only the last 10 notifications
      if (notifications.length > 10) {
        notifications.shift();
      }
    } else {
      messages.push(message);
      // Keep only the last 50 messages
      if (messages.length > 50) {
        messages.shift();
      }
    }
    
    console.log('New message received:', message);
    res.status(200).json({ success: true });
  } else {
    res.status(400).json({ error: 'No message content provided' });
  }
});

// Endpoint to get all messages
app.get('/messages', (req, res) => {
  res.json({
    messages,
    notifications
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 