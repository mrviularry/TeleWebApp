const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const config = require('./config.json');

function createFormProcessor(db) {
    const app = express();
    
    // Configure body parsers before any routes
    app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
    app.use(bodyParser.json({ limit: '10mb' }));

    // CORS middleware
    app.use((req, res, next) => {
        const subdomain = req.params.subdomain;
        if (subdomain) {
            res.header('Access-Control-Allow-Origin', `https://${subdomain}.${config.domain}`);
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
        }
        next();
    });

    // Handle OPTIONS requests
    app.options('/submit/:subdomain', (req, res) => {
        const subdomain = req.params.subdomain;
        res.header('Access-Control-Allow-Origin', `https://${subdomain}.${config.domain}`);
        res.header('Access-Control-Allow-Methods', 'POST');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        res.sendStatus(200);
    });

    // Form submission endpoint
    app.post('/submit/:subdomain', async (req, res) => {
        const subdomain = req.params.subdomain;
        const formData = req.body;

        // Debug logging
        console.log('Headers:', req.headers);
        console.log('Raw body:', req.body);
        console.log('Content-Type:', req.headers['content-type']);
        console.log(`Received form submission for subdomain: ${subdomain}`);

        try {
            // Get deployment info
            const deployment = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT d.chat_id, t.name as template 
                     FROM deployments d 
                     JOIN templates t ON d.template_id = t.id 
                     WHERE d.subdomain = ? AND d.expires_at > datetime('now')`,
                    [subdomain],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!deployment) {
                console.error(`No valid deployment found for subdomain: ${subdomain}`);
                return res.status(404).json({ error: 'Deployment not found or expired' });
            }

            // Log the actual form data being forwarded
            console.log('Forwarding form data:', {
                chatId: deployment.chat_id,
                template: deployment.template,
                formData: formData
            });

            // Forward to Telegram
            await forwardToTelegram(deployment.chat_id, deployment.template, formData);
            
            // Send success response
            res.status(200).json({ message: 'Form submitted successfully' });

        } catch (error) {
            console.error('Form submission error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // Telegram forwarding function
    async function forwardToTelegram(chatId, template, formData) {
        const botToken = config.formBotToken;
        const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

        // Debug log
        console.log('Processing form data for Telegram:', formData);

        // Format the message with better handling of form fields
        let formattedData = '';
        for (const [key, value] of Object.entries(formData)) {
            if (value && value !== 'undefined' && value !== 'null') {
                formattedData += `<b>${key}</b>: ${value}
`;
            }
        }

        // Create a more detailed message
        const message = `📄 <b>Form Submission</b>
<b>Template</b>: ${template}

🔍 <b>Form Data</b>:
${formattedData}`;

        try {
            const response = await axios.post(apiUrl, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            });

            if (!response.data.ok) {
                console.error('Telegram API error:', response.data);
                throw new Error('Telegram API response not OK');
            }

            console.log(`Form data sent to Telegram chat: ${chatId}`);
            console.log('Message sent:', message);
            
        } catch (error) {
            console.error('Error sending to Telegram:', error);
            throw new Error('Failed to forward to Telegram');
        }
    }

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.status(200).send('OK');
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        res.status(500).json({ error: 'Internal server error' });
    });

    return app;
}

module.exports = createFormProcessor;