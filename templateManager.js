const fs = require('fs');
const path = require('path');

function loadTemplate(templateName) {
    const templatePath = path.join(__dirname, 'templates', templateName, 'index.html');
    try {
        return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
        console.error(`Error loading template ${templateName}:`, error);
        return null;
    }
}

function initializeTemplates(db) {
    const templatesDir = path.join(__dirname, 'templates');
    
    try {
        if (!fs.existsSync(templatesDir)) {
            console.warn('Templates directory not found');
            return;
        }

        const templates = fs.readdirSync(templatesDir)
            .filter(t => fs.existsSync(path.join(templatesDir, t, 'index.html')));

        templates.forEach(templateName => {
            const content = loadTemplate(templateName);
            if (content) {
                db.run(
                    'INSERT OR IGNORE INTO templates (name, content) VALUES (?, ?)',
                    [templateName, content],
                    (err) => {
                        if (err) {
                            console.error(`Error inserting template ${templateName}:`, err);
                        } else {
                            console.log(`Template ${templateName} initialized`);
                        }
                    }
                );
            }
        });
    } catch (error) {
        console.error('Error initializing templates:', error);
    }
}

module.exports = { initializeTemplates };