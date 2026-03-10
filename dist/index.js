"use strict";
/**
 * @fileoverview CrossRepo - Main entry point
 * @module crossrepo
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncManager = exports.ConfigManager = exports.AIResolver = exports.GitManager = void 0;
var GitManager_1 = require("./core/GitManager");
Object.defineProperty(exports, "GitManager", { enumerable: true, get: function () { return GitManager_1.GitManager; } });
var AIResolver_1 = require("./core/AIResolver");
Object.defineProperty(exports, "AIResolver", { enumerable: true, get: function () { return AIResolver_1.AIResolver; } });
var ConfigManager_1 = require("./core/ConfigManager");
Object.defineProperty(exports, "ConfigManager", { enumerable: true, get: function () { return ConfigManager_1.ConfigManager; } });
var SyncManager_1 = require("./core/SyncManager");
Object.defineProperty(exports, "SyncManager", { enumerable: true, get: function () { return SyncManager_1.SyncManager; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map