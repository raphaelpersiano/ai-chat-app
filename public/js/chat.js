// chat.js - Functionality for the chat interface
document.addEventListener('DOMContentLoaded', function() {
    console.log('Chat page loaded');
    
    // DOM Elements
    const chatBody = document.getElementById('chat-body');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    
    // Socket.io connection
    const socket = io();
    
    // Get user info
    fetch('/api/user')
        .then(response => response.json())
        .then(user => {
            console.log('User info:', user);
            userName.textContent = user.displayName;
            userAvatar.src = user.photo;
        })
        .catch(error => {
            console.error('Error fetching user info:', error);
        });
    
    // Enable/disable send button based on input
    messageInput.addEventListener('input', function() {
        sendButton.disabled = messageInput.value.trim() === '';
    });
    
    // Send message on button click
    sendButton.addEventListener('click', sendMessage);
    
    // Send message on Enter key
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && messageInput.value.trim() !== '') {
            sendMessage();
        }
    });
    
    // Function to send message
    function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText === '') return;
        
        // Add message to UI
        addMessageToUI('user', messageText);
        
        // Send message to server
        socket.emit('sendMessage', {
            text: messageText,
            timestamp: new Date()
        });
        
        // Clear input
        messageInput.value = '';
        sendButton.disabled = true;
        
        // Focus input for next message
        messageInput.focus();
    }
    
    // Function to add message to UI
    function addMessageToUI(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender === 'user' ? 'user-message' : 'admin-message'}`;
        
        const now = new Date();
        const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                          now.getMinutes().toString().padStart(2, '0');
        
        messageDiv.innerHTML = `
            <div class="message-content">
                <p>${text}</p>
                <div class="message-time">${timeString}</div>
            </div>
        `;
        
        chatBody.appendChild(messageDiv);
        
        // Scroll to bottom
        chatBody.scrollTop = chatBody.scrollHeight;
    }
    
    // Listen for messages from server (admin/AI responses)
    socket.on('receiveMessage', function(message) {
        console.log('Received message:', message);
        addMessageToUI('admin', message.text);
    });
    
    // Handle connection events
    socket.on('connect', function() {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
    });
});
