// chat.js - Enhanced functionality for the chat interface
// Added intelligent double texting support and AI typing animation

document.addEventListener("DOMContentLoaded", function() {
    console.log("Enhanced Chat page loaded");
    
    // DOM Elements
    const chatBody = document.getElementById("chat-body");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");
    const refreshButton = document.getElementById("refresh-button");
    const logoutButton = document.getElementById("logout-button");
    
    // Socket.io connection
    const socket = io();
    
    // AI Status & Typing tracking
    let aiStatus = "idle"; // idle, thinking, re-evalcuating
    let statusIndicatorElement = null;
    let typingIndicatorElement = null;

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

    // Header button listeners
    refreshButton?.addEventListener("click", () => window.location.reload());
    logoutButton?.addEventListener("click", () => window.location.href = "/logout");

    // --- Typing Indicator Functions ---
    function showTypingIndicator() {
        hideTypingIndicator();
        typingIndicatorElement = document.createElement("div");
        typingIndicatorElement.id = "ai-typing-indicator";
        typingIndicatorElement.classList.add("flex", "justify-start", "mb-4");
        const bubble = document.createElement("div");
        bubble.classList.add("bg-white", "rounded-xl", "rounded-tl-none", "p-3", "max-w-lg", "shadow-sm", "flex", "items-center");
        bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
        typingIndicatorElement.appendChild(bubble);
        chatBody.appendChild(typingIndicatorElement);
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function hideTypingIndicator() {
        typingIndicatorElement?.remove();
        typingIndicatorElement = null;
    }

    // --- AI Status Indicator Functions (unchanged) ---
    function showStatusIndicator(status, message) {
        hideStatusIndicator(); 
        const messageDiv = document.createElement("div");
        messageDiv.id = "ai-status-indicator";
        messageDiv.classList.add("flex", "justify-start", "mb-4");
        const contentDiv = document.createElement("div");
        contentDiv.classList.add("bg-blue-50", "text-blue-700", "rounded-xl", "rounded-tl-none", "p-3", "max-w-lg", "shadow-sm", "border", "border-blue-200");
        const statusDiv = document.createElement("div");
        statusDiv.classList.add("flex", "items-center", "space-x-2");
        const iconDiv = document.createElement("div");
        iconDiv.classList.add("flex-shrink-0");
        if (status === "thinking") {
            iconDiv.innerHTML = `<div class="thinking-indicator"><span></span><span></span><span></span></div>`;
        } else if (status === "re-evaluating") {
            iconDiv.innerHTML = `<div class="re-evaluating-indicator"><svg class="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>`;
        }
        const textDiv = document.createElement("div");
        textDiv.classList.add("text-sm", "font-medium");
        textDiv.textContent = message;
        statusDiv.append(iconDiv, textDiv);
        contentDiv.appendChild(statusDiv);
        messageDiv.appendChild(contentDiv);
        chatBody.appendChild(messageDiv);
        statusIndicatorElement = messageDiv;
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function hideStatusIndicator() {
        statusIndicatorElement?.remove();
        statusIndicatorElement = null;
    }

    function updateInputPlaceholder() {
        if (aiStatus === "thinking") {
            messageInput.placeholder = "AI sedang berpikir... Anda masih bisa mengetik untuk menambah konteks";
        } else if (aiStatus === "re-evaluating") {
            messageInput.placeholder = "AI sedang mempertimbangkan pesan baru Anda...";
        } else {
            messageInput.placeholder = "Ketik pesan Anda...";
        }
    }
    
    function sendMessage() {
        const messageText = messageInput.value.trim();
        if (!messageText) return;
        addMessageToUI("user", messageText);
        socket.emit("sendMessage", { text: messageText, timestamp: new Date() });
        messageInput.value = "";
        sendButton.disabled = true;
        messageInput.focus();
        // show AI typing animation
        showTypingIndicator();
    }

    function linkify(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = [];
        let lastIndex = 0, match;
        while ((match = urlRegex.exec(text)) !== null) {
            if (match.index > lastIndex) parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
            let cleanUrl = match[0].replace(/^[\(\[{]+/, "").replace(/[\)\]};:,]+$/, "");
            parts.push({ type: "link", content: cleanUrl });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) parts.push({ type: "text", content: text.slice(lastIndex) });
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
        const timeString = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");

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
                if (part.type === "text") textP.appendChild(document.createTextNode(part.content));
                else if (part.type === "link") {
                    const a = document.createElement("a");
                    a.href = part.content;
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    a.textContent = part.content;
                    a.classList.add("text-blue-600", "hover:underline");
                    textP.appendChild(a);
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

    window.addMessageToUI = addMessageToUI;

    // Initial AI welcome message
    addMessageToUI("admin", "Hai, ada yang bisa saya bantu?");

    // Socket event listeners
    socket.on("aiStatus", function(statusData) {
        console.log("AI Status update:", statusData);
        aiStatus = statusData.status;
        hideTypingIndicator();
        if (aiStatus === "thinking") showStatusIndicator("thinking", statusData.message || "Sedang memproses...");
        else if (aiStatus === "re-evaluating") showStatusIndicator("re-evaluating", statusData.message || "Mempertimbangkan pesan baru...");
        else hideStatusIndicator();
        updateInputPlaceholder();
    });

    socket.on("receiveMessage", function(message) {
        // Remove typing animation and status
        hideTypingIndicator();
        hideStatusIndicator();
        aiStatus = "idle";
        updateInputPlaceholder();
        // Skip empty messages
        if (!message.text || !message.text.trim()) return;
        console.log("Received message:", message);
        addMessageToUI("admin", message.text);
    });

    socket.on("connect", function() {
        console.log("Connected to server with enhanced double texting support");
        aiStatus = "idle";
        updateInputPlaceholder();
    });

    socket.on("disconnect", function() {
        console.log("Disconnected from server");
        hideTypingIndicator();
        hideStatusIndicator();
        aiStatus = "idle";
        updateInputPlaceholder();
        addMessageToUI("admin", "Koneksi terputus. Mencoba menyambungkan kembali...");
    });
});
