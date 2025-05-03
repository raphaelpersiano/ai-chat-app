// login.js - Minimal functionality for login page
document.addEventListener('DOMContentLoaded', function() {
    console.log('Login page loaded');
    
    // Add any login page specific functionality here
    // This is mostly a placeholder since the main login functionality
    // is handled by the server-side Google OAuth implementation
    
    const loginButton = document.querySelector('.google-login-btn');
    if (loginButton) {
        loginButton.addEventListener('click', function() {
            console.log('Login with Google button clicked');
            // The actual redirect is handled by the href attribute
        });
    }
});
