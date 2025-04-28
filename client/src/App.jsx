import { useState, useEffect } from 'react'
import './App.css'

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

  return (
    <div className="app-container">
      <h1>SMS Messages</h1>
      
      <div className="current-message-container">
        <h2>Current Message</h2>
        <div className="current-message">
          {currentMessage || "No message received yet..."}
        </div>
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
