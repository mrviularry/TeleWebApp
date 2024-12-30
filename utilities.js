// utilities.js
const generateRandomString = (length = 8) => {
    return Math.random().toString(36).substring(2, 2 + length);
};

const setupSSL = (subdomain, callback) => {
    const domain = `${subdomain}.${config.domain}`;
    const certbotCommand = `certbot certonly --standalone -d ${domain} --non-interactive --agree-tos --email ${config.sslEmail}`;

    exec(certbotCommand, (error, stdout, stderr) => {
        if (error) return callback(error);
        callback(null, `SSL setup for ${domain}`);
    });
};

module.exports = { generateRandomString, setupSSL };