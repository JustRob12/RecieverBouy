import { useState, useEffect, useRef } from 'react'
import './App.css'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function extractLatLng(message) {
  const latMatch = message.match(/Lat:\s*([\d.-]+)/);
  const lngMatch = message.match(/Lng:\s*([\d.-]+)/);
  
  if (latMatch && lngMatch) {
    const lat = parseFloat(latMatch[1]);
    const lng = parseFloat(lngMatch[1]);
    
    // Validate the coordinates
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

function MapAutoFollow({ latLng }) {
  const map = useMap();
  useEffect(() => {
    if (latLng && latLng.lat && latLng.lng) {
      map.setView([latLng.lat, latLng.lng], map.getZoom(), { animate: true });
    }
  }, [latLng, map]);
  return null;
}

function parseSensorData(message) {
  // First try to extract the content after "Message content:" if it exists
  const contentMarker = '✉️ Message content:';
  let dataString = message;
  
  if (message.includes(contentMarker)) {
    dataString = message.split(contentMarker)[1].trim();
  }
  
  // Split the data string by commas
  const parts = dataString.split(',');
  if (parts.length === 6) {
    return {
      date: parts[0].trim(),
      time: parts[1].trim(),
      gps: parts[2].trim(),
      ph: parts[3].trim(),
      temperature: parts[4].trim(),
      tdh: parts[5].trim()
    };
  }
  return null;
}

function SensorDataTable({ messages }) {
  // Parse sensor data from messages
  const sensorDataRows = messages
    .map(message => ({
      ...parseSensorData(message.content),
      timestamp: message.timestamp
    }))
    .filter(data => data.date); // Only include messages that could be parsed as sensor data

  if (!sensorDataRows.length) return <p>No sensor data available...</p>;
  
  return (
    <div className="sensor-data-table">
      <table>
        <thead>
          <tr>
            <th>DATE</th>
            <th>TIME</th>
            <th>GPS</th>
            <th>PH LEVEL</th>
            <th>TEMPERATURE</th>
            <th>TDS</th>
          </tr>
        </thead>
        <tbody>
          {sensorDataRows.map((data, index) => (
            <tr key={data.timestamp}>
              <td>{data.date}</td>
              <td>{data.time}</td>
              <td>{data.gps}</td>
              <td>{data.ph}</td>
              <td>{data.temperature}</td>
              <td>{data.tdh}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SensorGraphs({ messages }) {
  // Process data for graphs
  const processedData = messages
    .map(message => {
      const data = parseSensorData(message.content);
      if (!data) return null;
      return {
        timestamp: new Date(message.timestamp),
        ph: parseFloat(data.ph),
        temperature: parseFloat(data.temperature),
        tds: parseFloat(data.tdh)
      };
    })
    .filter(data => data !== null)
    .reverse(); // Show oldest to newest

  const timestamps = processedData.map(data => data.timestamp.toLocaleTimeString());
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: false,
      },
    },
  };

  const phData = {
    labels: timestamps,
    datasets: [
      {
        label: 'pH Level',
        data: processedData.map(data => data.ph),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  const temperatureData = {
    labels: timestamps,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: processedData.map(data => parseFloat(data.temperature)),
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      },
    ],
  };

  const tdsData = {
    labels: timestamps,
    datasets: [
      {
        label: 'TDS (ppm)',
        data: processedData.map(data => data.tds),
        borderColor: 'rgb(53, 162, 235)',
        tension: 0.1,
      },
    ],
  };

  return (
    <div className="sensor-graphs">
      <div className="graph-container">
        <h3>pH Level Over Time</h3>
        <div className="graph-wrapper">
          <Line options={chartOptions} data={phData} />
        </div>
      </div>
      <div className="graph-container">
        <h3>Temperature Over Time</h3>
        <div className="graph-wrapper">
          <Line options={chartOptions} data={temperatureData} />
        </div>
      </div>
      <div className="graph-container">
        <h3>TDS Over Time</h3>
        <div className="graph-wrapper">
          <Line options={chartOptions} data={tdsData} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [locationHistory, setLocationHistory] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    // Function to fetch messages from the server
    const fetchMessages = async () => {
      try {
        const response = await fetch('http://localhost:3000/messages');
        const data = await response.json();
        setMessages(data.messages);
        setNotifications(data.notifications);
        
        // Update location history from the server
        if (data.locations && data.locations.length > 0) {
          const validLocations = data.locations
            .map(loc => loc.location)
            .filter(loc => loc && loc.lat && loc.lng);
            
          setLocationHistory(validLocations);
          
          // Set current location to the most recent valid one
          const lastValidLocation = validLocations[validLocations.length - 1];
          if (lastValidLocation) {
            setCurrentLocation(lastValidLocation);
          }
        }
        
        // Update current message if there are any messages
        if (data.messages.length > 0) {
          const latestMessage = data.messages[0];
          setCurrentMessage(latestMessage.content);
          
          // If the message has location data, update current location
          if (latestMessage.location) {
            setCurrentLocation(latestMessage.location);
          }
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

  // Only render map if we have valid coordinates
  const hasValidLocation = currentLocation && 
    currentLocation.lat && 
    currentLocation.lng && 
    !isNaN(currentLocation.lat) && 
    !isNaN(currentLocation.lng);

  return (
    <div className="app-container">
      <h1>SMS Messages</h1>
      
      <div className="current-message-container">
        <h2>Location Tracking</h2>
        {hasValidLocation && (
          <div style={{ marginBottom: 32, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <MapContainer 
              center={[currentLocation.lat, currentLocation.lng]} 
              zoom={15} 
              style={{ height: '400px', width: '100%', maxWidth: 800, borderRadius: '12px', boxShadow: '0 2px 8px rgba(2,132,199,0.07)' }}
            >
              <MapAutoFollow latLng={currentLocation} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
              />
              {locationHistory.map((loc, index) => (
                loc && loc.lat && loc.lng && (
                  <Marker 
                    key={index} 
                    position={[loc.lat, loc.lng]}
                  >
                    <Popup>
                      Location {index + 1}: [{loc.lat}, {loc.lng}]
                    </Popup>
                  </Marker>
                )
              ))}
              {locationHistory.length > 1 && (
                <Polyline
                  positions={locationHistory
                    .filter(loc => loc && loc.lat && loc.lng)
                    .map(loc => [loc.lat, loc.lng])}
                  color="blue"
                  weight={3}
                  opacity={0.7}
                />
              )}
            </MapContainer>
          </div>
        )}

        <h2>Sensor Graphs</h2>
        <SensorGraphs messages={messages} />

        <h2>Sensor Data</h2>
        <SensorDataTable messages={messages} />
      </div>

      {/* <div className="notifications-section">
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
      </div> */}
    </div>
  )
}

export default App
