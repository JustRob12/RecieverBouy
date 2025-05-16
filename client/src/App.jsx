import { useState, useEffect, useRef } from 'react'
import './App.css'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'bootstrap/dist/css/bootstrap.min.css';
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
    const lat = gpsMatch ? gpsMatch[1] : '';
    const lng = gpsMatch ? gpsMatch[2] : '';
    
    return {
      buoyId: isNaN(buoyId) ? 0 : buoyId,
      date: parts[dateIndex].trim(),
      time: parts[timeIndex].trim(),
      lat: lat,
      lng: lng,
      ph: parts[phIndex].trim(),
      temperature: parts[tempIndex].trim(),
      tdh: parts[tdsIndex].trim()
    };
  }
  return null;
}

function SensorDataTable({ messages }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(10);
  
  // Get unique buoy IDs for filtering
  const uniqueBuoyIds = [...new Set(
    messages.map(message => message.buoyId).filter(id => id !== undefined)
  )];

  // Calculate pagination
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = messages.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(messages.length / rowsPerPage);

  // Function to handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
    setSelectedItems([]); // Clear selection when changing pages
  };

  // Function to handle rows per page change
  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number(event.target.value));
    setCurrentPage(1); // Reset to first page
    setSelectedItems([]); // Clear selection
  };

  const downloadCSV = () => {
    if (!messages.length) return;

    const headers = ['BUOY ID', 'DATE', 'TIME', 'LATITUDE', 'LONGITUDE', 'PH LEVEL', 'TDS', 'TEMPERATURE'];
    const csvContent = [
      headers.join(','),
      ...messages.map(row => [
        row.buoyId,
        row.date,
        row.time,
        row.location?.lat || '',
        row.location?.lng || '',
        row.ph,
        row.temperature,
        row.tds
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `sensor_data_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to handle deleting a record
  const handleDelete = async (id) => {
    if (!id || !window.confirm('Are you sure you want to delete this record?')) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/messages/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setDeleteSuccess({ success: true, message: 'Record deleted successfully!' });
        // Refresh will happen via the polling in the parent component
      } else {
        const error = await response.json();
        setDeleteSuccess({ success: false, message: error.error || 'Failed to delete record' });
      }
    } catch (error) {
      console.error('Error deleting record:', error);
      setDeleteSuccess({ success: false, message: 'Error connecting to server' });
    } finally {
      setIsDeleting(false);
      // Clear success/error message after 3 seconds
      setTimeout(() => setDeleteSuccess(null), 3000);
    }
  };

  // Function to handle bulk deleting records
  const handleBulkDelete = async () => {
    if (!selectedItems.length) {
      alert('Please select at least one record to delete');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.length} selected record(s)?`)) return;
    
    setIsDeleting(true);
    try {
      let successCount = 0;
      let failCount = 0;
      
      // Delete each selected record sequentially
      for (const id of selectedItems) {
        const response = await fetch(`${API_URL}/messages/${id}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      }
      
      // Show success/fail message
      if (failCount === 0) {
        setDeleteSuccess({ 
          success: true, 
          message: `Successfully deleted ${successCount} record(s)!`
        });
      } else {
        setDeleteSuccess({
          success: successCount > 0,
          message: `Deleted ${successCount} record(s), failed to delete ${failCount} record(s)`
        });
      }
      
      // Clear selection
      setSelectedItems([]);
      
    } catch (error) {
      console.error('Error bulk deleting records:', error);
      setDeleteSuccess({ success: false, message: 'Error connecting to server' });
    } finally {
      setIsDeleting(false);
      // Clear success/error message after 3 seconds
      setTimeout(() => setDeleteSuccess(null), 3000);
    }
  };

  // Function to delete all records from a specific buoy
  const handleDeleteAllFromBuoy = async (buoyId) => {
    if (buoyId === null || buoyId === undefined) {
      alert('Please select a buoy first');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete ALL records from Buoy ${buoyId}? This action cannot be undone.`)) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/messages/buoy/${buoyId}/all`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setDeleteSuccess({ 
          success: true, 
          message: `Successfully deleted ${result.deletedCount} record(s) from Buoy ${buoyId}!`
        });
      } else {
        setDeleteSuccess({
          success: false,
          message: result.error || 'Failed to delete records'
        });
      }
    } catch (error) {
      console.error('Error deleting all records from buoy:', error);
      setDeleteSuccess({ success: false, message: 'Error connecting to server' });
    } finally {
      setIsDeleting(false);
      setTimeout(() => setDeleteSuccess(null), 3000);
    }
  };

  // Function to toggle item selection
  const toggleItemSelection = (id) => {
    setSelectedItems(prev => {
      if (prev.includes(id)) {
        return prev.filter(itemId => itemId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Function to toggle selection of all visible items
  const toggleSelectAll = () => {
    if (selectedItems.length === messages.length) {
      // If all are selected, deselect all
      setSelectedItems([]);
    } else {
      // Otherwise, select all visible messages
      setSelectedItems(messages.map(message => message._id).filter(id => id));
    }
  };

  if (!messages.length) return <p className="text-center">No sensor data available...</p>;
  
  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white">
        <h2 className="h4 mb-0">Sensor Data Table</h2>
      </div>
      <div className="card-body">
        {deleteSuccess && (
          <div className={`alert ${deleteSuccess.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show`} role="alert">
            {deleteSuccess.message}
            <button type="button" className="btn-close" onClick={() => setDeleteSuccess(null)}></button>
          </div>
        )}
        <div className="d-flex justify-content-between mb-3">
          <div>
            {uniqueBuoyIds.length > 0 && (
              <div className="btn-group me-2">
                {uniqueBuoyIds.map(buoyId => (
                  <button 
                    key={buoyId}
                    className="btn btn-sm btn-danger" 
                    onClick={() => handleDeleteAllFromBuoy(buoyId)}
                    disabled={isDeleting}
                  >
                    <i className="bi bi-trash"></i> Delete All Buoy {buoyId}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <button 
              className="btn btn-sm btn-danger me-2" 
              onClick={handleBulkDelete}
              disabled={isDeleting || !selectedItems.length}
            >
              <i className="bi bi-trash"></i> Delete Selected ({selectedItems.length})
            </button>
            <button onClick={downloadCSV} className="btn btn-sm btn-primary">
              <i className="bi bi-download"></i> Download CSV
            </button>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-striped table-hover">
            <thead className="table-light">
              <tr>
                <th>
                  <div className="form-check">
                    <input 
                      className="form-check-input" 
                      type="checkbox" 
                      checked={selectedItems.length === currentRows.length && currentRows.length > 0}
                      onChange={() => {
                        if (selectedItems.length === currentRows.length) {
                          setSelectedItems([]);
                        } else {
                          setSelectedItems(currentRows.map(row => row._id).filter(id => id));
                        }
                      }}
                    />
                  </div>
                </th>
                <th>BUOY ID</th>
                <th>DATE</th>
                <th>TIME</th>
                <th>LATITUDE</th>
                <th>LONGITUDE</th>
                <th>PH LEVEL</th>
                <th>TEMPERATURE</th>
                <th>TDS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((data, index) => (
                <tr key={data._id || index}>
                  <td>
                    {data._id && (
                      <div className="form-check">
                        <input 
                          className="form-check-input" 
                          type="checkbox" 
                          checked={selectedItems.includes(data._id)}
                          onChange={() => toggleItemSelection(data._id)}
                        />
                      </div>
                    )}
                  </td>
                  <td>{data.buoyId}</td>
                  <td>{data.date}</td>
                  <td>{data.time}</td>
                  <td>{data.location?.lat || 'N/A'}</td>
                  <td>{data.location?.lng || 'N/A'}</td>
                  <td>{data.ph}</td>
                  <td>{data.temperature}</td>
                  <td>{data.tds}</td>
                  <td>
                    <button 
                      className="btn btn-sm btn-danger" 
                      onClick={() => handleDelete(data._id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      ) : (
                        <i className="bi bi-trash"></i>
                      )}
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="d-flex justify-content-between align-items-center mt-3">
          <div className="d-flex align-items-center">
            <span className="me-2">Rows per page:</span>
            <select 
              className="form-select form-select-sm" 
              style={{ width: '70px' }}
              value={rowsPerPage}
              onChange={handleRowsPerPageChange}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="ms-3">
              Showing {indexOfFirstRow + 1} to {Math.min(indexOfLastRow, messages.length)} of {messages.length} entries
            </span>
          </div>
          <nav>
            <ul className="pagination mb-0">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
              </li>
              {[...Array(totalPages)].map((_, index) => (
                <li key={index + 1} className={`page-item ${currentPage === index + 1 ? 'active' : ''}`}>
                  <button 
                    className="page-link" 
                    onClick={() => handlePageChange(index + 1)}
                  >
                    {index + 1}
                  </button>
                </li>
              ))}
              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button 
                  className="page-link" 
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}

// Add this new component for individual sensor graphs
function SensorGraph({ messages, dataKey, label, color, selectedBuoyId }) {
  // Filter and process data for the graph
  const processedData = messages
    .filter(data => selectedBuoyId === null || data.buoyId === selectedBuoyId)
    .map(data => ({
      timestamp: new Date(data.timestamp),
      value: data[dataKey]
    }))
    .reverse();

  const timestamps = processedData.map(data => data.timestamp.toLocaleTimeString());

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: selectedBuoyId === null ? `${label} - All Buoys` : `${label} - Buoy ${selectedBuoyId}`,
        font: {
          size: 14
        }
      },
    },
    scales: {
      y: {
        beginAtZero: false,
      },
    },
  };

  const data = {
    labels: timestamps,
    datasets: [
      {
        label: label,
        data: processedData.map(data => data.value),
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        tension: 0.1,
      },
    ],
  };

  return <Line options={chartOptions} data={data} />;
}

// Update CombinedSensorGraph to use the selectedBuoyId
function CombinedSensorGraph({ messages, selectedBuoyId }) {
  // Process data for graphs
  const processedData = messages
    .filter(data => selectedBuoyId === null || data.buoyId === selectedBuoyId)
    .map(data => ({
      timestamp: new Date(data.timestamp),
      buoyId: data.buoyId,
      ph: data.ph,
      temperature: data.temperature,
      tds: data.tds
    }))
    .reverse();

  const timestamps = processedData.map(data => data.timestamp.toLocaleTimeString());

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: selectedBuoyId === null ? 'Combined Sensor Data - All Buoys' : `Combined Sensor Data - Buoy ${selectedBuoyId}`,
      },
    },
    scales: {
      y: {
        beginAtZero: false,
      },
    },
  };

  const combinedData = {
    labels: timestamps,
    datasets: [
      {
        label: 'pH Level',
        data: processedData.map(data => data.ph),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'Temperature (u00b0C)',
        data: processedData.map(data => data.temperature),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'TDS (ppm)',
        data: processedData.map(data => data.tds),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.2)',
        tension: 0.1,
        yAxisID: 'y',
      },
    ],
  };

  return (
    <div className="card shadow-sm mt-4">
      <div className="card-header bg-primary text-white">
        <h3 className="h5 mb-0">Combined Sensor Data Over Time</h3>
      </div>
      <div className="card-body d-flex align-items-center justify-content-center">
        <div className="chart-container w-100" style={{ minWidth: '220px', height: '350px' }}>
          <Line options={chartOptions} data={combinedData} />
        </div>
      </div>
    </div>
  );
}

function SensorGraphs({ messages }) {
  // Process data for graphs
  const processedData = messages
    .map(data => ({
      timestamp: new Date(data.timestamp),
      ph: data.ph,
      temperature: data.temperature,
      tds: data.tds,
      buoyId: data.buoyId
    }))
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
        data: processedData.map(data => data.temperature),
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
    <>
      <div className="row g-4 justify-content-center">
        <div className="col-12 col-md-6 col-lg-4 d-flex">
          <div className="card shadow-sm flex-fill">
            <div className="card-header bg-primary text-white">
              <h3 className="h5 mb-0">pH Level Over Time</h3>
            </div>
            <div className="card-body d-flex align-items-center justify-content-center">
              <div className="chart-container w-100" style={{ minWidth: '220px', height: '300px' }}>
                <SensorGraph 
                  messages={messages} 
                  dataKey="ph" 
                  label="pH Level" 
                  color="rgb(75, 192, 192)" 
                  selectedBuoyId={selectedBuoyId}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-lg-4 d-flex">
          <div className="card shadow-sm flex-fill">
            <div className="card-header bg-primary text-white">
              <h3 className="h5 mb-0">Temperature Over Time</h3>
            </div>
            <div className="card-body d-flex align-items-center justify-content-center">
              <div className="chart-container w-100" style={{ minWidth: '220px', height: '300px' }}>
                <SensorGraph 
                  messages={messages} 
                  dataKey="temperature" 
                  label="Temperature (°C)" 
                  color="rgb(255, 99, 132)" 
                  selectedBuoyId={selectedBuoyId}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6 col-lg-4 d-flex">
          <div className="card shadow-sm flex-fill">
            <div className="card-header bg-primary text-white">
              <h3 className="h5 mb-0">TDS Over Time</h3>
            </div>
            <div className="card-body d-flex align-items-center justify-content-center">
              <div className="chart-container w-100" style={{ minWidth: '220px', height: '300px' }}>
                <SensorGraph 
                  messages={messages} 
                  dataKey="tds" 
                  label="TDS (ppm)" 
                  color="rgb(53, 162, 235)" 
                  selectedBuoyId={selectedBuoyId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Combined graph below the three individual graphs */}
      <CombinedSensorGraph messages={messages} selectedBuoyId={selectedBuoyId} />
    </>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [locations, setLocations] = useState([]);
  const messagesEndRef = useRef(null);
  const [selectedBuoyId, setSelectedBuoyId] = useState(null);

  useEffect(() => {
    // Initial fetch
    fetchMessages();
    
    // Set up polling interval (every 5 seconds)
    const interval = setInterval(fetchMessages, 5000);
    
    // Clean up on unmount
    return () => clearInterval(interval);
  }, []);
  
    const fetchMessages = async () => {
      try {
        const response = await fetch(`${API_URL}/messages`);
        const data = await response.json();
        setMessages(data.messages);
        setNotifications(data.notifications);
        setLocations(data.locations);
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

  // Scroll to bottom of messages when new ones arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Filter data by selected buoy ID
  const filteredLocations = selectedBuoyId === null
    ? locations
    : locations.filter(location => location.buoyId === selectedBuoyId);
    
  // Group locations by buoy ID for different path colors
  const locationsByBuoy = filteredLocations.reduce((acc, location) => {
    const buoyId = location.buoyId || 0;
    if (!acc[buoyId]) {
      acc[buoyId] = [];
    }
    acc[buoyId].push([location.location.lat, location.location.lng]);
    return acc;
  }, {});
  
  // Define colors for different buoys
  const buoyColors = {
    1: '#ff0000', // Red for buoy 1
    2: '#0000ff', // Blue for buoy 2
    0: '#00ff00'  // Green for unidentified buoys
  };
  
  // Get the most recent location from each buoy
  const latestLocationsByBuoy = {};
  filteredLocations.forEach(location => {
    const buoyId = location.buoyId || 0;
    if (!latestLocationsByBuoy[buoyId] || new Date(location.timestamp) > new Date(latestLocationsByBuoy[buoyId].timestamp)) {
      latestLocationsByBuoy[buoyId] = {
        location: location.location,
        timestamp: location.timestamp
      };
    }
  });

  // Get most recent location
  const latestLocation = filteredLocations.length > 0 ? filteredLocations[filteredLocations.length - 1].location : null;
  
  // Initialize map center to latest location or default
  const initialCenter = latestLocation ? [latestLocation.lat, latestLocation.lng] : [7.3146, 126.5156];

  // Get unique buoy IDs for filtering
  const uniqueBuoyIds = [...new Set(
    messages.map(message => message.buoyId).filter(id => id !== undefined)
  )];

  return (
    <div className="app-container">
      <header className="bg-primary text-white py-4">
        <div className="container">
          <h1 className="display-5 fw-bold mb-0">AquaNet</h1>
          <p className="lead mb-0">Biophysical Ocean Buoy Monitoring System</p>
        </div>
      </header>

      <main className="container my-4">
      <div className="row g-4 mb-4">
        <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                <h2 className="h4 mb-0">Buoy Selection</h2>
                <div className="form-group mb-0">
                  <select 
                    className="form-select form-select-sm"
                    value={selectedBuoyId || ''}
                    onChange={(e) => setSelectedBuoyId(e.target.value === '' ? null : parseInt(e.target.value))}
                  >
                    <option value="">All Buoys</option>
                    {uniqueBuoyIds.map(id => (
                      <option key={id} value={id}>Buoy {id}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Individual Sensor Graphs */}
        <div className="row g-4 justify-content-center">
          <div className="col-12 col-md-6 col-lg-4 d-flex">
            <div className="card shadow-sm flex-fill">
            <div className="card-header bg-primary text-white">
                <h3 className="h5 mb-0">pH Level Over Time</h3>
              </div>
              <div className="card-body d-flex align-items-center justify-content-center">
                <div className="chart-container w-100" style={{ minWidth: '220px', height: '300px' }}>
                  <SensorGraph 
                    messages={messages} 
                    dataKey="ph" 
                    label="pH Level" 
                    color="rgb(75, 192, 192)" 
                    selectedBuoyId={selectedBuoyId}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-6 col-lg-4 d-flex">
            <div className="card shadow-sm flex-fill">
              <div className="card-header bg-primary text-white">
                <h3 className="h5 mb-0">Temperature Over Time</h3>
              </div>
              <div className="card-body d-flex align-items-center justify-content-center">
                <div className="chart-container w-100" style={{ minWidth: '220px', height: '300px' }}>
                  <SensorGraph 
                    messages={messages} 
                    dataKey="temperature" 
                    label="Temperature (°C)" 
                    color="rgb(255, 99, 132)" 
                    selectedBuoyId={selectedBuoyId}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-6 col-lg-4 d-flex">
            <div className="card shadow-sm flex-fill">
              <div className="card-header bg-primary text-white">
                <h3 className="h5 mb-0">TDS Over Time</h3>
              </div>
              <div className="card-body d-flex align-items-center justify-content-center">
                <div className="chart-container w-100" style={{ minWidth: '220px', height: '300px' }}>
                  <SensorGraph 
                    messages={messages} 
                    dataKey="tds" 
                    label="TDS (ppm)" 
                    color="rgb(53, 162, 235)" 
                    selectedBuoyId={selectedBuoyId}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Combined Graph */}
        <div className="row mt-4">
          <div className="col-12">
            <CombinedSensorGraph messages={messages} selectedBuoyId={selectedBuoyId} />
        </div>
      </div>

        {/* Map Section */}
        <div className="row g-4 mt-4">
          <div className="col-lg-12">
            <div className="card shadow-sm mb-4">
            <div className="card-header bg-primary text-white">
                <h2 className="h4 mb-0">GPS Tracking</h2>
              </div>
              <div className="card-body p-0">
                <div className="map-container">
                  <MapContainer center={initialCenter} zoom={13} style={{ height: '500px', width: '100%' }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {/* Draw paths for each buoy with different colors */}
                    {Object.entries(locationsByBuoy).map(([buoyId, points]) => (
                      <Polyline 
                        key={`path-${buoyId}`}
                        positions={points} 
                        color={buoyColors[buoyId] || '#3388ff'} 
                        weight={3} 
                        opacity={0.7} 
                      />
                    ))}
                    
                    {/* Place markers for the latest position of each buoy */}
                    {Object.entries(latestLocationsByBuoy).map(([buoyId, data]) => (
                      <Marker 
                        key={`marker-${buoyId}`}
                        position={[data.location.lat, data.location.lng]}
                      >
                        <Popup>
                          <strong>Buoy {buoyId}</strong><br />
                          Lat: {data.location.lat}<br />
                          Lng: {data.location.lng}<br />
                          Last updated: {new Date(data.timestamp).toLocaleString()}
                        </Popup>
                      </Marker>
                    ))}
                    
                    <MapAutoFollow latLng={latestLocation} />
                  </MapContainer>
            </div>
            </div>
          </div>
        </div>
      </div>

        {/* Data Table Section - Now at the bottom */}
        <div className="row mt-4">
        <div className="col-12">
            <SensorDataTable messages={selectedBuoyId === null ? messages : messages.filter(m => m.buoyId === selectedBuoyId)} />
          </div>
        </div>
      </main>
      
      <footer className="bg-dark text-white py-4 mt-5">
        <div className="container text-center">
          <p className="mb-0">AquaNet - Biophysical Ocean Buoy Monitoring System © {new Date().getFullYear()}</p>
      </div>
      </footer>
    </div>
  );
}

export default App
