"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const FeatureStore_1 = __importDefault(require("../features/FeatureStore"));
const change_case_1 = require("change-case");
async function getTopPostFeed(api) {
    const core_servers = await FeatureStore_1.default.getCoreServer(api);
    let results = [];
    const isRecord = (x) => typeof x === "object" && x !== null && x.constructor.name === "Object";
    const _transformKeys = (data, transform) => {
        if (Array.isArray(data)) {
            return data.map((value) => _transformKeys(value, transform));
        }
        if (isRecord(data)) {
            return Object.fromEntries(Object.entries(data).map(([key, value]) => [
                transform(key),
                _transformKeys(value, transform),
            ]));
        }
        return data;
    };
    //Get Top Servers
    const servers = Object.keys(core_servers).sort((a, b) => {
        return core_servers[b] - core_servers[a];
    }).slice(0, 10);
    results = await Promise.all(servers.map(async (server) => {
        if (server === "undefined" || typeof server == "undefined" || server === "")
            return [];
        let res, json;
        try {
            res = await fetch("https://" + server + "/api/v1/trends/statuses");
            json = await res.json();
        }
        catch (e) {
            console.log(e);
            return [];
        }
        if (!res.ok) {
            return [];
        }
        const data = _transformKeys(json, change_case_1.camelCase);
        if (data === undefined) {
            return [];
        }
        return data.map((status) => {
            status.topPost = true;
            return status;
        }).slice(0, 10);
    }));
    console.log(results);
    return results.flat();
}
exports.default = getTopPostFeed;
