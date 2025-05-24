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
        hideTypingIndicator(); 
        const messageDiv = document.createElement("div");
        messageDiv.id = "typing-indicator-message";
        messageDiv.classList.add("flex", "justify-start", "mb-4");

        const contentDiv = document.createElement("div");
        contentDiv.classList.add("bg-white", "text-gray-700", "rounded-xl", "rounded-tl-none", "p-3", "max-w-lg", "shadow-sm");

        const indicatorDiv = document.createElement("div");
        indicatorDiv.classList.add("typing-indicator");
        indicatorDiv.innerHTML = '<span></span><span></span><span></span>';

        contentDiv.appendChild(indicatorDiv);
        messageDiv.appendChild(contentDiv);
        chatBody.appendChild(messageDiv);
        typingIndicatorElement = messageDiv;
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function hideTypingIndicator() {
        if (typingIndicatorElement) {
            typingIndicatorElement.remove();
            typingIndicatorElement = null;
        }
    }
    // --- End Typing Indicator Functions ---
    
    function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText === "") return;
        
        addMessageToUI("user", messageText);
        socket.emit("sendMessage", { text: messageText, timestamp: new Date() });
        showTypingIndicator();

        messageInput.value = "";
        sendButton.disabled = true;
        messageInput.focus();
    }

    function linkify(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = urlRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: "text", content: text.substring(lastIndex, match.index) });
            }

            let cleanUrl = match[0]
                .replace(/^[\(\[\{]+/, "")
                .replace(/[\)\]\}\.,;:]+$/, "");

            parts.push({ type: "link", content: cleanUrl });
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            parts.push({ type: "text", content: text.substring(lastIndex) });
        }

        return parts;
    }   

    function cleanMarkdownLinks(text) {
        return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$2');
    }

    function addMessageToUI(sender, text) {
        text = cleanMarkdownLinks(text);
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

        if (sender === "user") {
            messageDiv.classList.add("justify-end");
            contentDiv.classList.add("bg-green-100", "text-gray-800", "rounded-br-none");
            textP.classList.add("text-gray-800");
            timeDiv.classList.add("text-gray-500");
            textP.textContent = text;
            contentDiv.appendChild(textP);
        } else { // Admin
            messageDiv.classList.add("justify-start");
            contentDiv.classList.add("bg-white", "text-gray-700", "rounded-tl-none");
            textP.classList.add("text-gray-700");
            timeDiv.classList.add("text-gray-400");

            const parts = linkify(text);
            parts.forEach(part => {
                if (part.type === "text") {
                    textP.appendChild(document.createTextNode(part.content));
                } else if (part.type === "link") {
                    const linkEl = document.createElement("a");
                    linkEl.href = part.content;
                    linkEl.target = "_blank";
                    linkEl.rel = "noopener noreferrer";
                    linkEl.textContent = part.content;
                    linkEl.classList.add("text-blue-600", "hover:underline");
                    textP.appendChild(linkEl);
                }
            });

            contentDiv.appendChild(textP);
        }

        timeDiv.textContent = timeString;
        contentDiv.appendChild(timeDiv);
        messageDiv.appendChild(contentDiv);
        chatBody.appendChild(messageDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    // BIND FUNC
    window.addMessageToUI = addMessageToUI;

    // Add initial AI welcome message dynamically
    addMessageToUI("admin", "Halo! Selamat datang di Skorlife Insight. Ada yang bisa saya bantu?");

    // Listen for messages from server (admin/AI responses)
    socket.on("receiveMessage", function(message) {
        console.log("Received message:", message);
        hideTypingIndicator(); 
        addMessageToUI("admin", message.text);
    });
    
    socket.on("connect", function() {
        console.log("Connected to server");
    });
    
    socket.on("disconnect", function() {
        console.log("Disconnected from server");
        hideTypingIndicator(); 
        addMessageToUI("admin", "Koneksi terputus. Mencoba menyambungkan kembali...");
    });
});
