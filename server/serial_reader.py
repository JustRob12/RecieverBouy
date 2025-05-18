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
        print(f"\nProcessing new message: {message}")

        # Extract actual message content from GSM format
        actual_content = None
        
        # Split message into lines
        lines = message.split('\n')
        for i, line in enumerate(lines):
            # Skip empty lines
            if not line.strip():
                continue
            # If this is a data line (contains commas and numbers)
            if re.match(r'^\d+,\d{2}-\d{2}-\d{4}', line.strip()):
                actual_content = line.strip()
                break
            # If this is after "Message content:" line
            if "Message content:" in line and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line:
                    actual_content = next_line
                    break

        if actual_content:
            print(f"Found data content: {actual_content}")
            # Try to parse the structured message
            parsed_data = parse_structured_message(actual_content)
            if parsed_data:
                data = {
                    "content": actual_content,
                    "type": "message",
                    **parsed_data
                }
            else:
                data = {
                    "content": actual_content,
                    "type": "message"
                }
        else:
            # Fallback to original message
            data = {
                "content": message,
                "type": "message"
            }
        
        # Send to server with retry mechanism
        max_retries = 3
        retry_delay = 5  # seconds
        
        for attempt in range(max_retries):
            try:
                print(f"Sending data to server: {data}")  # Debug print
                response = requests.post(server_url, json=data, timeout=10)
                if response.status_code == 200:
                    print(f"Message sent successfully: {data}")
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
    except Exception as e:
        print(f"Unexpected error in process_message: {e}")
        print(f"Original message was: {message}")

def parse_structured_message(message):
    """Parse the structured message format."""
    try:
        print(f"Attempting to parse message: {message}")  # Debug log
        # Expected format: buoyId,date,time,coordinates,ph,tds,temp
        parts = message.strip().split(',')
        if len(parts) == 7:
            # Print all parts for debugging
            print("\nMessage parts:")
            for i, part in enumerate(parts):
                print(f"Part {i}: '{part.strip()}'")
            
            # Extract coordinates
            coords_part = parts[3].strip()
            try:
                lat = float(coords_part.split('Lat:')[1].split('Lng:')[0].strip())
                lng = float(coords_part.split('Lng:')[1].strip())
                
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
                
                # Extra debug for TDS
                print(f"\nDetailed TDS debug:")
                print(f"Raw TDS string: '{tds_str}'")
                print(f"TDS string length: {len(tds_str)}")
                print(f"TDS string characters (hex):", ' '.join(hex(ord(c)) for c in tds_str))
                
                # Check for empty or invalid strings
                if not ph_str or not temp_str:
                    print("Warning: Empty pH or temperature values detected")
                    return None
                
                # Special handling for TDS
                if not tds_str or tds_str.lower() == 'nan':
                    print("Warning: Invalid TDS value, using default")
                    tds = 0  # Default value when TDS is invalid
                else:
                    try:
                        tds = float(tds_str)
                        if math.isnan(tds) or math.isinf(tds):
                            print("Warning: TDS is NaN or Inf, using default")
                            tds = 0
                    except ValueError:
                        print("Warning: Could not parse TDS value, using default")
                        tds = 0
                
                # Convert other values to float with validation
                try:
                    ph = float(ph_str)
                    print(f"Successfully parsed pH: {ph}")
                except ValueError as e:
                    print(f"Error parsing pH: {e}")
                    return None
                    
                try:
                    temp = float(temp_str)
                    print(f"Successfully parsed temperature: {temp}")
                except ValueError as e:
                    print(f"Error parsing temperature: {e}")
                    return None
                
                # Validate ranges for pH and temperature
                if not (0 <= ph <= 14):
                    print(f"Warning: pH value {ph} out of valid range (0-14)")
                    return None
                    
                if not (-10 <= temp <= 50):
                    print(f"Warning: Temperature value {temp} out of reasonable range")
                    return None
                
                # If we get here, we have valid values (TDS might be 0 if invalid)
                return {
                    "buoyId": int(parts[0]),
                    "date": parts[1].strip(),
                    "time": parts[2].strip(),
                    "latitude": lat,
                    "longitude": lng,
                    "ph": ph,
                    "tds": tds,  # This will be 0 if invalid
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