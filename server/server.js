const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
const port = 3000;

// MongoDB connection
mongoose.connect('mongodb+srv://robertoprisoris12:IH0n6kWDDNbfVvL1@cluster0.sg4ze9x.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Message Schema
const messageSchema = new mongoose.Schema({
  content: String,
  type: {
    type: String,
    default: 'message'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  location: {
    lat: Number,
    lng: Number
  }
});

// Create Message model
const Message = mongoose.model('Message', messageSchema);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Endpoint to receive messages from Arduino
app.post('/message', async (req, res) => {
  try {
    const { content, type } = req.body;
    if (content) {
      // Extract GPS coordinates from the message with the new format
      const latMatch = content.match(/Lat:\s*([\d.-]+)/);
      const lngMatch = content.match(/Lng:\s*([\d.-]+)/);
      
      const location = (latMatch && lngMatch) ? {
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1])
      } : null;

      console.log('Extracted location:', location); // Debug log

      const message = new Message({
        content,
        type: type || 'message',
        location
      });
      
      await message.save();
      console.log('New message saved to MongoDB:', message);
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ error: 'No message content provided' });
    }
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to get all messages
app.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find()
      .sort({ timestamp: -1 }) // Sort by timestamp in descending order (newest first)
      .limit(50); // Limit to 50 messages
    
    const notifications = await Message.find({ type: 'notification' })
      .sort({ timestamp: -1 })
      .limit(10);
    
    // Get all locations for the map
    const locations = await Message.find({ location: { $exists: true, $ne: null } })
      .select('location timestamp')
      .sort({ timestamp: 1 }); // Sort by timestamp in ascending order for the path
    
    res.json({
      messages,
      notifications,
      locations
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 