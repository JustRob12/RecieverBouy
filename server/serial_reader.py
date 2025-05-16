import serial
import requests
import json
import time
import re

# Configure the serial port (change 'COM3' to your Arduino's port)
ser = serial.Serial('COM11', 9600, timeout=1)
server_url = 'http://localhost:3000/message'

def process_message(message):
    try:
        # Clean up the message
        message = message.strip()
        
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
                
                # Try to extract buoyId from the message content
                buoyId = extract_buoy_id(content)
                
                data = {
                    "content": content,
                    "type": "message"
                }
                
                # Add buoyId to data if available
                if buoyId is not None:
                    data["buoyId"] = buoyId
            else:
                # If no content marker found, use the whole message
                data = {
                    "content": message,
                    "type": "message"
                }
        else:
            # It's a regular message or response
            # Try to extract buoyId from the message content
            buoyId = extract_buoy_id(message)
                
            data = {
                "content": message,
                "type": "message"
            }
        
            # Add buoyId to data if available
            if buoyId is not None:
                data["buoyId"] = buoyId
        
        # Send to server - no changes needed here as the server will handle parsing
        response = requests.post(server_url, json=data)
        if response.status_code == 200:
            print(f"Message sent successfully: {data['content']}")
            if 'buoyId' in data:
                print(f"Buoy ID: {data['buoyId']}")
        else:
            print(f"Failed to send message. Status code: {response.status_code}")
    except json.JSONDecodeError:
        print(f"Invalid JSON message: {message}")
    except requests.exceptions.RequestException as e:
        print(f"Error sending message to server: {e}")

def extract_buoy_id(message):
    """Extract buoy ID from message content."""
    try:
        # Split message by comma and check first part
        parts = message.split(',')
        if parts and len(parts) >= 1:
            first_part = parts[0].strip()
            # If the first part is a number and it's 1 or 2 (valid buoy IDs)
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