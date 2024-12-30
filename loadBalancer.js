const http = require('http');
const https = require('https');
const cluster = require('cluster');
const fs = require('fs');
const numCPUs = require('os').cpus().length;
const config = require('./config.json');
const EventEmitter = require('events');

module.exports = class LoadBalancer extends EventEmitter {
    constructor(db) {
        super();
        this.workers = new Map();
        this.currentWorker = 0;
        this.db = db;
        this.sslOptions = {
            key: fs.readFileSync('/etc/letsencrypt/live/0nev3.shop/privkey.pem'),
            cert: fs.readFileSync('/etc/letsencrypt/live/0nev3.shop/fullchain.pem')
        };
        this.healthCheckInterval = 5000;
    }

    init() {
        if (cluster.isMaster) {
            console.log(`Master ${process.pid} is running`);

            for (let i = 0; i < numCPUs; i++) {
                this.createWorker();
            }

            setTimeout(() => {
                this.startHealthChecks();
            }, 5000);

            this.createLoadBalancer();
        } else {
            const webServer = require('./webServer')(this.db);
            const server = webServer(3000 + cluster.worker.id);
            server.listen(3000 + cluster.worker.id, () => {
                console.log(`Worker ${process.pid} started on port ${3000 + cluster.worker.id}`);
            });

            process.on('uncaughtException', (err) => {
                console.error(`Worker ${process.pid} uncaught exception:`, err);
                process.exit(1);
            });
        }
    }

    createWorker() {
        const worker = cluster.fork();
        this.workers.set(worker.id, {
            worker,
            healthy: true,
            lastCheck: Date.now()
        });

        worker.on('exit', (code, signal) => {
            console.log(`Worker ${worker.process.pid} died`);
            this.workers.delete(worker.id);
            this.createWorker();
        });

        return worker;
    }

    startHealthChecks() {
        setInterval(() => {
            this.workers.forEach((info, id) => {
                const options = {
                    hostname: 'localhost',
                    port: 3000 + id,
                    path: '/health',
                    timeout: 2000
                };

                const req = http.request(options);

                req.on('response', (res) => {
                    info.healthy = res.statusCode === 200;
                    info.lastCheck = Date.now();
                    res.resume();
                    req.destroy();
                });

                req.on('error', () => {
                    const gracePeriod = 10000;
                    if (Date.now() - info.lastCheck > gracePeriod) {
                        info.healthy = false;
                    }
                    info.lastCheck = Date.now();
                });

                req.on('timeout', () => {
                    req.destroy();
                });

                req.end();
            });
        }, this.healthCheckInterval);
    }

    getHealthyWorker() {
        const healthyWorkers = Array.from(this.workers.entries())
            .filter(([_, info]) => info.healthy);

        if (healthyWorkers.length === 0) {
            return null;
        }

        this.currentWorker = (this.currentWorker + 1) % healthyWorkers.length;
        return healthyWorkers[this.currentWorker][1].worker;
    }

    createLoadBalancer() {
        const server = https.createServer(this.sslOptions, async (req, res) => {
            if (req.url.startsWith('/submit')) {
                // Handle form submissions - route to form processor
                const options = {
                    hostname: 'localhost',
                    port: config.formProcessorPort,
                    path: req.url,
                    method: req.method,
                    headers: {
                        ...req.headers,
                        'x-forwarded-host': req.headers.host,
                        'x-forwarded-proto': 'https'
                    }
                };

                const proxyReq = http.request(options);

                proxyReq.on('response', (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res);
                });

                proxyReq.on('error', (error) => {
                    console.error('Form processor proxy error:', error);
                    res.statusCode = 502;
                    res.end('Bad Gateway');
                });

                req.pipe(proxyReq);
                return;
            }

            // Handle regular web requests
            const worker = this.getHealthyWorker();
            
            if (!worker) {
                res.statusCode = 503;
                res.end('Service Unavailable');
                return;
            }

            const options = {
                hostname: 'localhost',
                port: 3000 + worker.id,
                path: req.url,
                method: req.method,
                headers: {
                    ...req.headers,
                    'x-forwarded-host': req.headers.host,
                    'x-forwarded-proto': 'https'
                },
                timeout: 30000
            };

            const proxyReq = http.request(options);

            proxyReq.on('response', (proxyRes) => {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (error) => {
                console.error('Proxy error:', error);
                
                const workerInfo = this.workers.get(worker.id);
                if (workerInfo) {
                    workerInfo.healthy = false;
                }

                const newWorker = this.getHealthyWorker();
                if (newWorker && newWorker.id !== worker.id) {
                    console.log('Retrying with different worker...');
                    this.handleRequest(req, res, newWorker);
                    return;
                }

                res.statusCode = 502;
                res.end('Bad Gateway');
            });

            req.pipe(proxyReq);

            req.on('error', () => {
                proxyReq.destroy();
            });
        });

        server.timeout = 30000;
        
        server.listen(443, () => {
            console.log('Load balancer running on port 443');
        });
    }

    handleRequest(req, res, worker) {
        const options = {
            hostname: 'localhost',
            port: 3000 + worker.id,
            path: req.url,
            method: req.method,
            headers: {
                ...req.headers,
                'x-forwarded-host': req.headers.host,
                'x-forwarded-proto': 'https'
            },
            timeout: 30000
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (error) => {
            console.error('Retry proxy error:', error);
            res.statusCode = 502;
            res.end('Bad Gateway');
        });

        req.pipe(proxyReq);
    }
};