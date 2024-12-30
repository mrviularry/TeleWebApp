{
  "name": "web-app-deployment-bot",
  "version": "1.0.0",
  "description": "Web application deployment and form processing system",
  "main": "botManagement.js",
  "scripts": {
    "start": "node botManagement.js",
    "dev": "nodemon botManagement.js",
    "test": "jest"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "body-parser": "^1.20.2",
    "cluster": "^0.7.7",
    "express": "^4.18.2",
    "https": "^1.0.0",
    "path": "^0.12.7",
    "sqlite3": "^5.1.6",
    "telegraf": "^4.15.3",
    "vhost": "^3.0.2"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.0.2"
  },
  "engines": {
    "node": ">=16.0.0"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yourusername/web-app-deployment-bot.git"
  },
  "keywords": [
    "telegram",
    "bot",
    "web",
    "deployment",
    "forms"
  ],
  "author": "Your Name",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/yourusername/web-app-deployment-bot/issues"
  },
  "homepage": "https://github.com/yourusername/web-app-deployment-bot#readme"
}