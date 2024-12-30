const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('./config.json');
const cluster = require('cluster');
const createFormProcessor = require('./formProcessor');
const LoadBalancer = require('./loadBalancer');

// Initialize database connection
const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database.');
});

// Database initialization and master process tasks
if (cluster.isMaster) {
    // Database initialization
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            chat_id TEXT UNIQUE NOT NULL, 
            username TEXT, 
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS deployments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            chat_id TEXT NOT NULL, 
            subdomain TEXT NOT NULL, 
            template_id INTEGER NOT NULL,
            deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
            expires_at DATETIME NOT NULL,
            FOREIGN KEY(template_id) REFERENCES templates(id)
        )`);
    });

    // Initialize templates
    const templatesDir = path.join(__dirname, 'templates');
    fs.readdirSync(templatesDir).forEach(templateName => {
        const templatePath = path.join(templatesDir, templateName, 'index.html');
        if (fs.existsSync(templatePath)) {
            const content = fs.readFileSync(templatePath, 'utf8');
            db.run(
                'INSERT OR REPLACE INTO templates (name, content) VALUES (?, ?)',
                [templateName, content],
                (err) => {
                    if (err) console.error(`Error initializing template ${templateName}:`, err);
                    else console.log(`Template ${templateName} initialized`);
                }
            );
        }
    });

    // Initialize bot
    const bot = new Telegraf(config.botToken);

    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const username = ctx.chat.username || 'Unknown User';

        db.run(`INSERT OR IGNORE INTO users (chat_id, username) VALUES (?, ?)`, 
            [chatId, username], 
            async (err) => {
                if (err) {
                    console.error(err.message);
                    return ctx.reply('Error registering user.');
                }
                
                db.all('SELECT name FROM templates', (err, templates) => {
                    if (err) {
                        console.error(err);
                        return ctx.reply('Error loading templates.');
                    }

                    const templateList = templates.length ? 
                        templates.map((t, i) => `${i + 1}. ${t.name}`).join('\n') : 
                        'No templates available.';

                    ctx.reply(`Welcome to the Web App Deployment Bot!

Available Templates:
${templateList}

Use /deploy <template_name> to deploy a web app.`);
                });
            }
        );
    });

    bot.command('deploy', (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);
        const templateName = args.join(' ').trim();
        const chatId = ctx.chat.id;

        if (!templateName) {
            return ctx.reply('Please provide a template name. Example: /deploy usps');
        }

        db.get('SELECT id FROM templates WHERE name = ?', [templateName], (err, template) => {
            if (err) {
                console.error(err);
                return ctx.reply('Database error');
            }
            if (!template) {
                db.all('SELECT name FROM templates', (err, templates) => {
                    if (err) {
                        console.error(err);
                        return ctx.reply('Error listing templates');
                    }
                    ctx.reply(`Template not found. Choose from:
${templates.map(t => `- ${t.name}`).join('')}`);
                });
                return;
            }

            const subdomain = Math.random().toString(36).substring(2, 10);
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            db.run(
                `INSERT INTO deployments (chat_id, subdomain, template_id, expires_at) 
                 VALUES (?, ?, ?, ?)`,
                [chatId, subdomain, template.id, expiresAt.toISOString()],
                (err) => {
                    if (err) {
                        console.error(err.message);
                        return ctx.reply('Error deploying app.');
                    }
                    ctx.reply(`Your app has been deployed!
URL: https://${subdomain}.${config.domain}/app/`);
                }
            );
        });
    });

    // Launch bot
    bot.launch().then(() => console.log('Bot running...'));

    // Initialize form processor (master only)
    setTimeout(() => {
        const formProcessor = createFormProcessor(db);
        formProcessor.listen(3006, () => console.log(`Form Processor running on port 3006`));
    }, 1000);
}

// Initialize load balancer (handles both master and worker processes)
const loadBalancer = new LoadBalancer(db);
loadBalancer.init();

// Graceful shutdown
const shutdown = () => {
    if (cluster.isMaster) {
        bot.stop('SIGTERM');
    }
    db.close(() => {
        console.log('Database connection closed.');
        process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);