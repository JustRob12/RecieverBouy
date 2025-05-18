import serial
import requests
import json
import time
import re
import os
from dotenv import load_dotenv
import math

# Load environment variables
load_dotenv()

# Configure the serial port (change 'COM8' to your Arduino's port)
ser = serial.Serial('COM4', 9600, timeout=1)

# Get server URL from environment variable or use default
server_url = os.getenv('SERVER_URL', 'https://recieverbouy.onrender.com/message')

def process_message(message):
    try:
        # Clean up the message
        message = message.strip()
        
        # Debug log
        print(f"\nProcessing new message: {message}")
        
        # Check if it's a notification message
        if "+CMTI:" in message:
            # Extract the message index
            match = re.search(r'\+CMTI: "SM",(\d+)', message)
            if match:
                index = match.group(1)
                data = {
                    "content": f"New SMS received at index {index}",
                    "type": "notification"
                }
            else:
                data = {
                    "content": message,
                    "type": "notification"
                }
        elif "+CMT:" in message:
            # Extract everything after '✉️ Message content:' (including newlines)
            content_marker = '✉️ Message content:'
            if content_marker in message:
                content = message.split(content_marker, 1)[1].strip()
                
                # Parse the structured message
                parsed_data = parse_structured_message(content)
                if parsed_data:
                    data = {
                        "content": content,
                        "type": "message",
                        **parsed_data  # Include all parsed fields
                    }
                else:
                    data = {
                        "content": content,
                        "type": "message"
                    }
            else:
                # If no content marker found, use the whole message
                data = {
                    "content": message,
                    "type": "message"
                }
        else:
            # It's a regular message or response
            # Try to parse structured message
            parsed_data = parse_structured_message(message)
            if parsed_data:
                data = {
                    "content": message,
                    "type": "message",
                    **parsed_data  # Include all parsed fields
                }
            else:
                data = {
                    "content": message,
                    "type": "message"
                }

        # Send to server with retry mechanism
        max_retries = 3
        retry_delay = 5  # seconds
        
        for attempt in range(max_retries):
            try:
                response = requests.post(server_url, json=data, timeout=10)
                if response.status_code == 200:
                    print(f"Message sent successfully: {data['content']}")
                    if 'buoyId' in data:
                        print(f"Buoy ID: {data['buoyId']}")
                    break
                else:
                    print(f"Failed to send message. Status code: {response.status_code}")
                    if attempt < max_retries - 1:
                        print(f"Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
            except requests.exceptions.RequestException as e:
                print(f"Error sending message to server: {e}")
                if attempt < max_retries - 1:
                    print(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
    except json.JSONDecodeError:
        print(f"Invalid JSON message: {message}")
    except Exception as e:
        print(f"Unexpected error: {e}")

def parse_structured_message(message):
    """Parse the structured message format."""
    try:
        print(f"Attempting to parse message: {message}")  # Debug log
        # Expected format: buoyId,date,time,coordinates,ph,tds,temp
        parts = message.strip().split(',')
        if len(parts) == 7:
            # Extract coordinates
            coords_part = parts[3].strip()
            try:
                lat = float(coords_part.split('Lat:')[1].split('Lng:')[0].strip())
                lng = float(coords_part.split('Lng:')[1].strip())
                
                # Debug log coordinates
                print(f"Parsed coordinates - Lat: {lat}, Lng: {lng}")
                
                if math.isnan(lat) or math.isnan(lng):
                    print("Warning: Invalid coordinates detected")
                    return None
            except Exception as e:
                print(f"Error parsing coordinates: {e}")
                return None
            
            # Parse and validate numeric values with extensive checks
            try:
                # Strip whitespace and handle empty values
                ph_str = parts[4].strip()
                tds_str = parts[5].strip()
                temp_str = parts[6].strip()
                
                # Debug log raw values
                print(f"Raw values - pH: '{ph_str}', TDS: '{tds_str}', Temp: '{temp_str}'")
                
                # Check for empty or invalid strings
                if not ph_str or not tds_str or not temp_str:
                    print("Warning: Empty values detected")
                    return None
                
                # Convert to float with validation
                ph = float(ph_str)
                tds = float(tds_str)
                temp = float(temp_str)
                
                # Debug log parsed values
                print(f"Parsed values - pH: {ph}, TDS: {tds}, Temp: {temp}")
                
                # Validate for NaN and infinity
                if (math.isnan(ph) or math.isnan(tds) or math.isnan(temp) or
                    math.isinf(ph) or math.isinf(tds) or math.isinf(temp)):
                    print("Warning: NaN or Infinity values detected")
                    return None
                
                # Validate ranges
                if not (0 <= ph <= 14):
                    print(f"Warning: pH value {ph} out of valid range (0-14)")
                    return None
                    
                if tds < 0 or tds > 5000:  # Added upper limit for TDS
                    print(f"Warning: Invalid TDS value {tds}")
                    return None
                    
                if not (-10 <= temp <= 50):
                    print(f"Warning: Temperature value {temp} out of reasonable range")
                    return None
                
                # If we get here, all values are valid
                return {
                    "buoyId": int(parts[0]),
                    "date": parts[1].strip(),
                    "time": parts[2].strip(),
                    "latitude": lat,
                    "longitude": lng,
                    "ph": ph,
                    "tds": tds,
                    "temperature": temp
                }
                    
            except ValueError as e:
                print(f"Error parsing numeric values: {e}")
                return None
                
    except Exception as e:
        print(f"Error parsing structured message: {e}")
        print(f"Message parts: {parts if 'parts' in locals() else 'Not split yet'}")
    return None

def extract_buoy_id(message):
    """Extract buoy ID from message content."""
    try:
        # Split message by comma and check first part
        parts = message.split(',')
        if parts and len(parts) >= 1:
            first_part = parts[0].strip()
            # If the first part is a number and it's between 1 and 10 (valid buoy IDs)
            if first_part.isdigit() and 1 <= int(first_part) <= 10:
                return int(first_part)
    except Exception as e:
        print(f"Error extracting buoy ID: {e}")
    
    return None

print("Serial reader started. Waiting for messages...")

# Buffer to store incoming message parts
message_buffer = []
message_timeout = 0.5  # seconds to wait for more message parts
last_message_time = time.time()

while True:
    try:
        if ser.in_waiting:
            # Read the message
            message = ser.readline().decode('utf-8').strip()
            
            if message:
                # Add the line to the buffer
                message_buffer.append(message)
                # Reset the timeout
                last_message_time = time.time()
                
                # If this looks like the end of a message (empty line or specific pattern)
                if not message or message.endswith(':'):
                    # Wait a bit to see if more data is coming
                    time.sleep(message_timeout)
                    if ser.in_waiting:
                        continue
                    
                    # Combine all parts into a single message
                    full_message = '\n'.join(message_buffer)
                    process_message(full_message)
                    message_buffer = []
        else:
            # If we have buffered messages and enough time has passed
            if message_buffer and (time.time() - last_message_time) > message_timeout:
                full_message = '\n'.join(message_buffer)
                process_message(full_message)
                message_buffer = []
            
        time.sleep(0.1)  # Small delay to prevent CPU overuse
    except KeyboardInterrupt:
        print("\nStopping serial reader...")
        break
    except Exception as e:
        print(f"Error: {e}")
        time.sleep(1)  # Wait a bit before retrying

ser.close() 