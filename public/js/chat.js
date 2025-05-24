// chat.js - Functionality for the chat interface
document.addEventListener("DOMContentLoaded", function() {
    console.log("Chat page loaded");
    
    // DOM Elements
    const chatBody = document.getElementById("chat-body");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");
    const refreshButton = document.getElementById("refresh-button");
    const logoutButton = document.getElementById("logout-button");
    
    // Socket.io connection
    const socket = io();
    
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

    // --- Add event listeners for header buttons ---
    if (refreshButton) {
        refreshButton.addEventListener("click", function() {
            window.location.reload();
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", function() {
            window.location.href = "/logout";
        });
    }
    // --- End header button listeners ---

    // --- Typing Indicator Functions ---
    let typingIndicatorElement = null;

    function showTypingIndicator() {
        // Remove existing indicator if any
        hideTypingIndicator(); 

        const messageDiv = document.createElement("div");
        messageDiv.id = "typing-indicator-message"; // Assign an ID for easy removal
        messageDiv.classList.add("flex", "justify-start", "mb-4");

        const contentDiv = document.createElement("div");
        contentDiv.classList.add("bg-white", "text-gray-700", "rounded-xl", "rounded-tl-none", "p-3", "max-w-lg", "shadow-sm");

        const indicatorDiv = document.createElement("div");
        indicatorDiv.classList.add("typing-indicator");
        indicatorDiv.innerHTML = '<span></span><span></span><span></span>'; // Add the three dots

        contentDiv.appendChild(indicatorDiv);
        messageDiv.appendChild(contentDiv);
        chatBody.appendChild(messageDiv);
        typingIndicatorElement = messageDiv; // Store reference

        // Scroll to bottom to make indicator visible
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function hideTypingIndicator() {
        if (typingIndicatorElement) {
            typingIndicatorElement.remove();
            typingIndicatorElement = null;
        }
    }
    // --- End Typing Indicator Functions ---
    
    // Function to send message
    function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText === "") return;
        
        addMessageToUI("user", messageText);
        
        socket.emit("sendMessage", {
            text: messageText,
            timestamp: new Date()
        });
        
        // Show typing indicator immediately after sending
        showTypingIndicator();

        messageInput.value = "";
        sendButton.disabled = true;
        messageInput.focus();
    }
    
    // --- Function to detect and replace URLs with buttons ---
    function linkify(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = urlRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: "text", content: text.substring(lastIndex, match.index) });
            }
            parts.push({ type: "link", content: match[0] });
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            parts.push({ type: "text", content: text.substring(lastIndex) });
        }
        return parts;
    }
    // --- End linkify function ---

    // Updated function to add message to UI
    function addMessageToUI(sender, text) {
        const chatBody = document.getElementById("chat-body");
        const messageDiv = document.createElement("div");
        const contentDiv = document.createElement("div");
        const textP = document.createElement("p");
        const timeDiv = document.createElement("div");

        const now = new Date();
        const timeString = now.getHours().toString().padStart(2, "0") + ":" + 
                          now.getMinutes().toString().padStart(2, "0");

        messageDiv.classList.add("flex", "mb-4");
        contentDiv.classList.add("rounded-xl", "p-3", "max-w-lg", "shadow-sm");
        textP.classList.add("text-sm", "whitespace-pre-wrap");
        timeDiv.classList.add("text-xs", "text-right", "mt-1", "opacity-75");

        if (sender === "admin") {
            const parts = linkify(text);
            parts.forEach(part => {
                if (part.type === "text") {
                    textP.appendChild(document.createTextNode(part.content));
                } else if (part.type === "link") {
                    const linkButton = document.createElement("a");
                    linkButton.href = part.content;
                    linkButton.target = "_blank";
                    linkButton.rel = "noopener noreferrer";
                    linkButton.textContent = "Click Here";
                    linkButton.classList.add(
                        "inline-block", "bg-teal-500", "text-white", "text-xs", "font-semibold", 
                        "py-1", "px-2", "rounded", "hover:bg-teal-600", "transition", 
                        "duration-150", "mx-1", "my-1"
                    );
                    textP.appendChild(linkButton);
                }
            });
        } else {
            textP.textContent = text;
        }

        timeDiv.textContent = timeString;

        if (sender === "user") {
            messageDiv.classList.add("justify-end");
            contentDiv.classList.add("bg-green-100", "text-gray-800", "rounded-br-none");
            textP.classList.add("text-gray-800");
            timeDiv.classList.add("text-gray-500");
        } else { // Admin
            messageDiv.classList.add("justify-start");
            contentDiv.classList.add("bg-white", "text-gray-700", "rounded-tl-none");
            textP.classList.add("text-gray-700");
            timeDiv.classList.add("text-gray-400");
        }

        contentDiv.appendChild(textP);
        contentDiv.appendChild(timeDiv);
        messageDiv.appendChild(contentDiv);
        chatBody.appendChild(messageDiv);

        chatBody.scrollTop = chatBody.scrollHeight;
    }
    
    window.addMessageToUI = addMessageToUI;

    // Add initial AI welcome message dynamically
    addMessageToUI("admin", "Halo! Selamat datang di Skorlife Insight. Ada yang bisa saya bantu?");

    // Listen for messages from server (admin/AI responses)
    socket.on("receiveMessage", function(message) {
        console.log("Received message:", message);
        // Hide typing indicator before showing the message
        hideTypingIndicator(); 
        addMessageToUI("admin", message.text);
    });
    
    // Handle connection events
    socket.on("connect", function() {
        console.log("Connected to server");
    });
    
    socket.on("disconnect", function() {
        console.log("Disconnected from server");
        hideTypingIndicator(); // Hide indicator on disconnect too
        addMessageToUI("admin", "Koneksi terputus. Mencoba menyambungkan kembali...");
    });
});

