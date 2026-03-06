'use strict';

const path = require('path');

// WS message handlers for lyrics quiz
const handlers = {};

// API routes
const routes = {};

const publicDir = path.join(__dirname, '../public');

module.exports = { handlers, routes, publicDir };
