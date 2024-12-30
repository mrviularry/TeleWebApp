const fs = require('fs');
const path = require('path');

function deployApp(subdomain, templateName) {
    const templatesDir = path.join(__dirname, 'templates');
    const deploymentDir = path.join(__dirname, 'deployments', subdomain);

    const templatePath = path.join(templatesDir, templateName);
    if (!fs.existsSync(templatePath)) {
        return console.error(`Template not found: ${templateName}`);
    }

    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }

    copyTemplateFiles(templatePath, deploymentDir);
    console.log(`Deployment complete for ${subdomain}`);
}

function copyTemplateFiles(templatePath, deploymentDir) {
    fs.readdirSync(templatePath).forEach(file => {
        const src = path.join(templatePath, file);
        const dest = path.join(deploymentDir, file);

        if (fs.lstatSync(src).isDirectory()) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
            copyTemplateFiles(src, dest);
        } else fs.copyFileSync(src, dest);
    });
    console.log(`Template copied to ${deploymentDir}`);
}

module.exports = { deployApp };