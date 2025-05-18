const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Message Schema (for processed sensor data)
const messageSchema = new mongoose.Schema({
  buoyId: {
    type: Number,
    default: 0
  },
  date: String,
  time: String,
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
  },
  ph: Number,
  temperature: Number,
  tds: Number // Total Dissolved Solids
});

// Raw Message Schema (for storing original GSM messages)
const rawMessageSchema = new mongoose.Schema({
  content: String,
  buoyId: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    default: 'message'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Create models
const Message = mongoose.model('Message', messageSchema);
const RawMessage = mongoose.model('RawMessage', rawMessageSchema);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Helper function to parse message content
function parseSensorData(content) {
  try {
    // Split the data string by commas
    const parts = content.split(',');
    if (parts.length >= 6) {
      // Extract buoy ID (first part)
      const buoyId = parts.length >= 7 ? parseInt(parts[0].trim()) : 0;
      
      // Shift index based on whether buoy ID is present
      const dateIndex = parts.length >= 7 ? 1 : 0;
      const timeIndex = parts.length >= 7 ? 2 : 1;
      const gpsIndex = parts.length >= 7 ? 3 : 2;
      const phIndex = parts.length >= 7 ? 4 : 3;
      const tempIndex = parts.length >= 7 ? 5 : 4;
      const tdsIndex = parts.length >= 7 ? 6 : 5;
      
      // Extract lat and lng from GPS string
      const gpsMatch = parts[gpsIndex].trim().match(/Lat:\s*([\d.-]+)\s*Lng:\s*([\d.-]+)/);
      const lat = gpsMatch ? parseFloat(gpsMatch[1]) : null;
      const lng = gpsMatch ? parseFloat(gpsMatch[2]) : null;
      
      return {
        buoyId: isNaN(buoyId) ? 0 : buoyId,
        date: parts[dateIndex].trim(),
        time: parts[timeIndex].trim(),
        location: (lat && lng) ? { lat, lng } : null,
        ph: parseFloat(parts[phIndex].trim()),
        temperature: parseFloat(parts[tempIndex].trim()),
        tds: parseFloat(parts[tdsIndex].trim())
      };
    }
  } catch (error) {
    console.error('Error parsing sensor data:', error);
  }
  return null;
}

// Endpoint to receive messages from Arduino
app.post('/message', async (req, res) => {
  try {
    const { content, type, buoyId: requestBuoyId } = req.body;
    if (content) {
      // Extract buoy ID from the message (first value before comma)
      let buoyId = requestBuoyId || 0;
      if (!requestBuoyId) {
        const contentParts = content.split(',');
        if (contentParts.length > 0) {
          const firstPart = contentParts[0].trim();
          if (!isNaN(parseInt(firstPart))) {
            buoyId = parseInt(firstPart);
          }
        }
      }

      // Save the raw message first
      const rawMessage = new RawMessage({
        content,
        buoyId,
        type: type || 'message'
      });
      
      await rawMessage.save();
      console.log('Raw message saved to MongoDB:', rawMessage._id);
      
      // Try to parse as sensor data and save to the main collection if valid
      const parsedData = parseSensorData(content);
      if (parsedData) {
        const message = new Message({
          ...parsedData,
          type: type || 'message'
      });
      
      await message.save();
        console.log('Processed message saved to MongoDB:', message._id);
      }
      
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ error: 'No message content provided' });
    }
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to get all messages (processed sensor data)
app.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find()
      .sort({ timestamp: -1 }) // Sort by timestamp in descending order (newest first)
      .limit(50); // Limit to 50 messages
    
    const notifications = await RawMessage.find({ type: 'notification' })
      .sort({ timestamp: -1 })
      .limit(10);
    
    // Get ALL locations for the map, without limit
    const locations = await Message.find({ 
      location: { $exists: true, $ne: null },
      'location.lat': { $exists: true, $ne: null },
      'location.lng': { $exists: true, $ne: null }
    })
      .select('location timestamp buoyId')
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

// Endpoint to get all raw messages
app.get('/rawmessages', async (req, res) => {
  try {
    const rawMessages = await RawMessage.find()
      .sort({ timestamp: -1 })
      .limit(100);
    
    res.json({
      rawMessages
    });
  } catch (error) {
    console.error('Error fetching raw messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to get messages by buoy ID
app.get('/messages/buoy/:id', async (req, res) => {
  try {
    const buoyId = parseInt(req.params.id);
    
    if (isNaN(buoyId)) {
      return res.status(400).json({ error: 'Invalid buoy ID' });
    }
    
    const messages = await Message.find({ buoyId })
      .sort({ timestamp: -1 })
      .limit(50);
      
    const rawMessages = await RawMessage.find({ buoyId })
      .sort({ timestamp: -1 })
      .limit(50);
      
    const locations = await Message.find({ 
      buoyId,
      location: { $exists: true, $ne: null } 
    })
      .select('location timestamp buoyId')
      .sort({ timestamp: 1 });
    
    res.json({
      messages,
      rawMessages,
      locations
    });
  } catch (error) {
    console.error('Error fetching messages for buoy:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to delete a specific message by ID
app.delete('/messages/:id', async (req, res) => {
  try {
    const messageId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    
    const result = await Message.findByIdAndDelete(messageId);
    
    if (!result) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    console.log(`Message deleted: ${messageId}`);
    res.status(200).json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to delete a raw message by ID
app.delete('/rawmessages/:id', async (req, res) => {
  try {
    const messageId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    
    const result = await RawMessage.findByIdAndDelete(messageId);
    
    if (!result) {
      return res.status(404).json({ error: 'Raw message not found' });
    }
    
    console.log(`Raw message deleted: ${messageId}`);
    res.status(200).json({ success: true, message: 'Raw message deleted successfully' });
  } catch (error) {
    console.error('Error deleting raw message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to delete all messages from a specific buoy
app.delete('/messages/buoy/:id/all', async (req, res) => {
  try {
    const buoyId = parseInt(req.params.id);
    
    if (isNaN(buoyId)) {
      return res.status(400).json({ error: 'Invalid buoy ID' });
    }
    
    const result = await Message.deleteMany({ buoyId });
    
    // Also delete corresponding raw messages
    await RawMessage.deleteMany({ buoyId });
    
    console.log(`Deleted ${result.deletedCount} messages from buoy ${buoyId}`);
    res.status(200).json({ 
      success: true, 
      message: `Successfully deleted all records from buoy ${buoyId}`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting messages from buoy:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 