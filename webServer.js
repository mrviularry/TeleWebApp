const express = require('express');
const path = require('path');
const http = require('http');  // Add this import
const https = require('https');
const fs = require('fs');
const vhost = require('vhost');
const axios = require('axios');
const config = require('./config.json');
const utilities = require('./utilities');

function createWebServer(db) {
    const mainApp = express();
    const subdomainApp = express();
    
    // Serve static assets from public directory
    subdomainApp.use('/public', express.static(path.join(__dirname, 'public')));
    
    // Add body parser for Turnstile verification
    subdomainApp.use(express.json());

    // Add health check endpoint
    mainApp.get('/health', (req, res) => {
        res.status(200).send('OK');
    });

    // Middleware to check deployment
    const checkDeployment = (req, res, next) => {
        const subdomain = req.vhost[0];
        
        db.get(
            `SELECT d.*, t.content 
             FROM deployments d 
             JOIN templates t ON d.template_id = t.id 
             WHERE d.subdomain = ? AND d.expires_at > datetime('now')`,
            [subdomain],
            (err, deployment) => {
                if (err) return res.status(500).send('Database error');
                if (!deployment) return res.status(404).send('Deployment not found or expired');
                
                req.deployment = deployment;
                next();
            }
        );
    };

    // Apply middleware to all /app routes
    subdomainApp.get('/app/*', checkDeployment);

    // Handle root app path (captcha)
    subdomainApp.get('/app/', (req, res) => {
        const cfHtmlPath = path.join(__dirname, 'public', 'cf.html');
        
        fs.readFile(cfHtmlPath, 'utf8', (err, content) => {
            if (err) {
                console.error('Error reading cf.html:', err);
                return res.status(500).send('Error loading verification page');
            }
            
            content = content.replace('SITEKEY_PLACEHOLDER', config.sitekey);
            res.send(content);
        });
    });

    // Handle verified sessions
subdomainApp.get('/app/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const subdomain = req.vhost[0];
    
    if (!sessionId || sessionId === 'Turnstile-Captcha') {
        return res.redirect('/app/');
    }

    db.get(
        `SELECT d.*, t.content, t.name
         FROM deployments d 
         JOIN templates t ON d.template_id = t.id 
         WHERE d.subdomain = ?`,
        [subdomain],
        (err, deployment) => {
            if (err || !deployment) {
                return res.status(404).send('Deployment not found');
            }

            let content = deployment.content;
            // Add this line here
            content = content.replace(/SUBDOMAIN_PLACEHOLDER/g, subdomain);
            // Then continue with existing replacements
            content = content.replace(/src="(?!https?:\/\/)([^"]+)"/g, `src="/app/${sessionId}/$1"`);
            content = content.replace(/href="(?!https?:\/\/)([^"]+\.css)"/g, `href="/app/${sessionId}/$1"`);
            
            res.send(content);
        }
    );
});

    // Handle static files within session
    subdomainApp.get('/app/:sessionId/*', checkDeployment, (req, res, next) => {
        const sessionId = req.params.sessionId;
        const subdomain = req.vhost[0];
        const filePath = req.params[0];

        db.get(
            `SELECT t.name 
             FROM deployments d 
             JOIN templates t ON d.template_id = t.id 
             WHERE d.subdomain = ?`,
            [subdomain],
            (err, row) => {
                if (err || !row) return next();

                const fullPath = path.join(__dirname, 'templates', row.name, filePath);
                console.log('Serving static file:', fullPath);

                const ext = path.extname(filePath);
                if (ext === '.css') {
                    res.type('text/css');
                } else if (ext === '.js') {
                    res.type('application/javascript');
                }

                if (fs.existsSync(fullPath)) {
                    res.sendFile(fullPath);
                } else {
                    console.log('File not found:', fullPath);
                    next();
                }
            }
        );
    });

    // Turnstile verification endpoint
    subdomainApp.post('/verify-turnstile', async (req, res) => {
        const token = req.body.token;
        
        try {
            const response = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                secret: config.secret_key,
                response: token
            });

            if (response.data.success) {
                const sessionId = utilities.generateRandomString(5);
                res.json({ redirect: `/app/${sessionId}` });
            } else {
                res.status(400).json({ error: 'Verification failed' });
            }
        } catch (error) {
            console.error('Turnstile verification error:', error);
            res.status(500).json({ error: 'Verification error' });
        }
    });

    // Setup vhost middleware
    mainApp.use((req, res, next) => {
        if (req.hostname === 'localhost') {
            subdomainApp(req, res, next);
        } else {
            vhost(`*.${config.domain}`, subdomainApp)(req, res, next);
        }
    });

    // Error handling middleware
    mainApp.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).send('Something broke!');
    });

    return function(port) {
        // Create HTTP server for worker processes
        const server = http.createServer(mainApp);
        server.on('error', (error) => {
            console.error('Server error:', error);
        });
        return server;
    };
}

module.exports = createWebServer;