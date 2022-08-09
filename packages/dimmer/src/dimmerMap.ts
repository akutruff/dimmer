import { tryGetProxy, asOriginal, proxify, deltaToTarget, modified } from './dimmer';
import { ORIGINAL, PROXY, NO_ENTRY, MapDelta, DimmerProxyMetadata, DIMMER_ID, DimmerId } from './types';

export class DimmerMap<K, V> extends Map<K, V> implements DimmerProxyMetadata {

    constructor(private target: Map<K, V>) {
        super();
        Object.defineProperties(target, { [PROXY]: { value: this, enumerable: false, configurable: true, writable: true } });
    }

    get size(): number {
        return this.target.size;
    }

    has(key: K): boolean {
        const proxyOfKey = tryGetProxy(key);

        return proxyOfKey && this.target.has(proxyOfKey) || this.target.has(asOriginal(key));
    }

    get(key: K): any {
        const proxyOfKey = tryGetProxy(key);

        const value = proxyOfKey && this.target.get(proxyOfKey) || this.target.get(asOriginal(key));

        return proxify(value);
    }

    set(key: K, value: V) {
        const proxyOfKey = tryGetProxy(key);
        const originalKey = asOriginal(key);

        const currentKeyUsedByTarget = getKeyUsedByMap(this.target, key, proxyOfKey, originalKey);
        //console.log('currentKeyUsedByTarget :>> ', currentKeyUsedByTarget, ' -> ', currentKeyUsedByTarget &&this.target.get(currentKeyUsedByTarget));
        const hasChangeAlreadyBeenRecorded = super.has(originalKey) || (!!proxyOfKey && super.has(proxyOfKey));

        if (!hasChangeAlreadyBeenRecorded) {
            modified.add(this.target as any);

            if (currentKeyUsedByTarget) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion            
                super.set(currentKeyUsedByTarget, this.target.get(currentKeyUsedByTarget)!);
            } else {
                super.set(key, NO_ENTRY as any);
            }
        }

        //Should use the key that the map is already using and then the supplied key
        this.target.set(currentKeyUsedByTarget || key, value);

        return this;
    }

    delete(key: any): boolean {
        const proxyOfKey = tryGetProxy(key);
        const originalKey = asOriginal(key);

        const currentKeyUsedByTarget = getKeyUsedByMap(this.target, key, proxyOfKey, originalKey);

        if (currentKeyUsedByTarget) {
            const hasChangeAlreadyBeenRecorded = super.has(originalKey) || (proxyOfKey && super.has(proxyOfKey));

            if (!hasChangeAlreadyBeenRecorded) {
                modified.add(this.target as any);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                super.set(currentKeyUsedByTarget, this.target.get(currentKeyUsedByTarget)!);
            }

            return this.target.delete(currentKeyUsedByTarget);
        } else {
            return false;
        }
    }

    clear() {
        for (const [key, value] of this.target) {
            if (!super.has(key)) {
                modified.add(this.target as any);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                super.set(key, value!);
            }
        }

        return this.target.clear();
    }


    forEach(
        cb: (value: V, key: K, self: Map<K, V>) => void, thisArg?: any) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return this.target.forEach((value, key, self) => cb.call(thisArg, proxify(value), proxify(key), this), this);
    }

    *keys(): IterableIterator<K> {
        for (const key of this.target.keys()) {
            yield proxify(key);
        }
    }

    *values(): IterableIterator<V> {
        for (const value of this.target.values()) {
            yield proxify(value);
        }
    }

    *entries(): IterableIterator<[K, V]> {
        for (const [key, value] of this.target.entries()) {
            yield [proxify(key), proxify(value)];
        }
    }

    commitDelta() {
        const commitedDelta = new Map(super.entries()) as MapDelta<K, V>;
        deltaToTarget.set(commitedDelta, this.target);

        super.clear();
        return commitedDelta;
    }

    get [DIMMER_ID](): DimmerId {
        return (this.target as any)[DIMMER_ID];
    }

    get [ORIGINAL]() {
        return this.target;
    }

    get [PROXY]() {
        return this;
    }

    [Symbol.iterator]() {
        return this.entries();
    }
}

export function createMapDelta<K, V>(target: Map<K, V>) {
    const delta = new Map<K, V>() as MapDelta<K, V>;
    deltaToTarget.set(delta, target);
    return delta;
}

export function getKeyUsedByMap<K>(map: Map<K, unknown>, key: K, proxyOfKey = tryGetProxy(key), originalKey = asOriginal(key)) {
    return proxyOfKey && map.has(proxyOfKey)
        ? proxyOfKey
        : map.has(originalKey)
            ? originalKey
            : undefined;
}