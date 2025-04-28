import { useState, useEffect, useRef } from 'react'
import './App.css'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function extractLatLng(message) {
  const latMatch = message.match(/Lat:\s*([\d.\-]+)/i);
  const lngMatch = message.match(/Lng:\s*([\d.\-]+)/i);
  if (latMatch && lngMatch) {
    return {
      lat: parseFloat(latMatch[1]),
      lng: parseFloat(lngMatch[1])
    };
  }
  return null;
}

function MapAutoFollow({ latLng }) {
  const map = useMap();
  useEffect(() => {
    if (latLng) {
      map.setView([latLng.lat, latLng.lng], map.getZoom(), { animate: true });
    }
  }, [latLng, map]);
  return null;
}

function App() {
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');

  useEffect(() => {
    // Function to fetch messages from the server
    const fetchMessages = async () => {
      try {
        const response = await fetch('http://localhost:3000/messages');
        const data = await response.json();
        setMessages(data.messages);
        setNotifications(data.notifications);
        
        // Update current message if there are any messages
        if (data.messages.length > 0) {
          setCurrentMessage(data.messages[data.messages.length - 1].content);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    // Fetch messages initially and then every 5 seconds
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);

    return () => clearInterval(interval);
  }, []);

  const latLng = extractLatLng(currentMessage);

  return (
    <div className="app-container">
      <h1>SMS Messages</h1>
      
      <div className="current-message-container">
        <h2>Current Message</h2>
        <div className="current-message">
          {currentMessage || "No message received yet..."}
        </div>
        {latLng && (
          <div style={{ marginTop: 24, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <MapContainer center={[latLng.lat, latLng.lng]} zoom={15} style={{ height: '300px', width: '90%', maxWidth: 500, borderRadius: '12px', boxShadow: '0 2px 8px rgba(2,132,199,0.07)' }}>
              <MapAutoFollow latLng={latLng} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
              />
              <Marker position={[latLng.lat, latLng.lng]}>
                <Popup>
                  Location: [{latLng.lat}, {latLng.lng}]
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        )}
      </div>

      <div className="notifications-section">
        <h2>Notifications</h2>
        <div className="notifications-container">
          {notifications.length === 0 ? (
            <p>No notifications yet...</p>
          ) : (
            notifications.map((notification, index) => (
              <div key={index} className="notification-card">
                <p className="notification-content">{notification.content}</p>
                <p className="notification-time">{new Date(notification.timestamp).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="messages-section">
        <h2>Message History</h2>
        <div className="messages-container">
          {messages.length === 0 ? (
            <p>No messages received yet...</p>
          ) : (
            messages.map((message, index) => (
              <div key={index} className="message-card">
                <p className="message-content">{message.content}</p>
                <p className="message-time">{new Date(message.timestamp).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default App
