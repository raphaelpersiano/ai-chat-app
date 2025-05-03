// chat.js - Functionality for the chat interface
document.addEventListener("DOMContentLoaded", function() {
    console.log("Chat page loaded");
    
    // DOM Elements
    const chatBody = document.getElementById("chat-body");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");
    const userAvatar = document.getElementById("user-avatar");
    const userName = document.getElementById("user-name");
    
    // Socket.io connection
    const socket = io();
    
    // Get user info
    fetch("/api/user")
        .then(response => response.json())
        .then(user => {
            console.log("User info:", user);
            if (user && user.displayName) userName.textContent = user.displayName;
            if (user && user.photo) userAvatar.src = user.photo;
            else userAvatar.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Placeholder
        })
        .catch(error => {
            console.error("Error fetching user info:", error);
            userName.textContent = "Error";
            userAvatar.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Placeholder
        });
    
    // Enable/disable send button based on input
    messageInput.addEventListener("input", function() {
        sendButton.disabled = messageInput.value.trim() === "";
    });
    
    // Send message on button click
    sendButton.addEventListener("click", sendMessage);
    
    // Send message on Enter key
    messageInput.addEventListener("keypress", function(e) {
        if (e.key === "Enter" && messageInput.value.trim() !== "") {
            sendMessage();
        }
    });
    
    // Function to send message
    function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText === "") return;
        
        // Add message to UI using the updated function
        addMessageToUI("user", messageText);
        
        // Send message to server
        socket.emit("sendMessage", {
            text: messageText,
            timestamp: new Date()
        });
        
        // Clear input
        messageInput.value = "";
        sendButton.disabled = true;
        
        // Focus input for next message
        messageInput.focus();
    }
    
    // Updated function to add message to UI using Tailwind classes
    function addMessageToUI(sender, text) {
        const chatBody = document.getElementById("chat-body");
        const messageDiv = document.createElement("div");
        const contentDiv = document.createElement("div");
        const textP = document.createElement("p");
        const timeDiv = document.createElement("div");

        const now = new Date();
        const timeString = now.getHours().toString().padStart(2, "0") + ":" + 
                          now.getMinutes().toString().padStart(2, "0");

        // Apply Tailwind classes
        messageDiv.classList.add("flex", "mb-4");
        contentDiv.classList.add("rounded-lg", "p-3", "max-w-xs", "lg:max-w-md", "shadow");
        textP.classList.add("text-sm", "text-gray-800");
        timeDiv.classList.add("text-xs", "text-right", "mt-1");

        textP.textContent = text;
        timeDiv.textContent = timeString;

        if (sender === "user") {
            messageDiv.classList.add("justify-end");
            contentDiv.classList.add("bg-green-100");
            timeDiv.classList.add("text-gray-500");
        } else { // Assuming sender === 'admin' or any other
            messageDiv.classList.add("justify-start");
            contentDiv.classList.add("bg-white");
            timeDiv.classList.add("text-gray-400");
        }

        contentDiv.appendChild(textP);
        contentDiv.appendChild(timeDiv);
        messageDiv.appendChild(contentDiv);
        chatBody.appendChild(messageDiv);

        // Scroll to bottom
        chatBody.scrollTop = chatBody.scrollHeight;
    }
    
    // Make the function globally accessible if needed, or ensure event listeners use this scope
    // window.addMessageToUI = addMessageToUI; // Optional: if other scripts need it

    // Listen for messages from server (admin/AI responses)
    socket.on("receiveMessage", function(message) {
        console.log("Received message:", message);
        addMessageToUI("admin", message.text); // Use the updated function
    });
    
    // Handle connection events
    socket.on("connect", function() {
        console.log("Connected to server");
    });
    
    socket.on("disconnect", function() {
        console.log("Disconnected from server");
    });
});

