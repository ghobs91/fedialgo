import AsyncStorage from '@react-native-async-storage/async-storage';
import { serverFeatureType, accFeatureType, weightsType } from "./types";
import { mastodon } from "masto";

export enum Key {
    TOP_FAVS = 'favs',
    TOP_REBLOGS = 'reblogs',
    TOP_INTERACTS = 'interacts',
    CORE_SERVER = 'coreServer',
    USER = 'algouser',
    WEIGHTS = 'weights',
}

type StorageValue = serverFeatureType | accFeatureType | mastodon.v1.Account | weightsType


export default class Storage {
    protected static async get(key: Key, groupedByUser = true, suffix = ""): Promise<StorageValue> {
        const suffixKey = this.suffix(key, suffix);
        const storageKey = groupedByUser ? await this.prefix(suffixKey) : suffixKey;
        const jsonValue = await AsyncStorage.getItem(storageKey);
        const value = jsonValue != null ? JSON.parse(jsonValue) : null;
        return value != null ? value[storageKey] : null;
    }

    protected static async set(key: Key, value: StorageValue, groupedByUser = true, suffix = "") {
        const suffixKey = this.suffix(key, suffix);
        const storageKey = groupedByUser ? await this.prefix(suffixKey) : suffixKey;
        const jsonValue = JSON.stringify({ [storageKey]: value })
        await AsyncStorage.setItem(storageKey, jsonValue);
    }

    static suffix(key: Key, suffix: any) {
        if (suffix === "") return key;
        return `${key}_${suffix}`;
    }

    protected static async remove(key: Key, groupedByUser = true, suffix = "") {
        const suffixKey = this.suffix(key, suffix);
        const storageKey = groupedByUser ? await Storage.prefix(suffixKey) : suffixKey;
        await AsyncStorage.removeItem(storageKey);
    }

    protected static async prefix(key: string) {
        const user = await this.getIdentity();
        return `${user.id}_${key}`;
    }

    static async getIdentity(): Promise<mastodon.v1.Account> {
        const userJson = await AsyncStorage.getItem(Key.USER);
        const user: mastodon.v1.Account = userJson != null ? JSON.parse(userJson) : null;
        return user;
    }

    static async setIdentity(user: mastodon.v1.Account) {
        const userJson = JSON.stringify(user);
        await AsyncStorage.setItem(Key.USER, userJson);
    }
}