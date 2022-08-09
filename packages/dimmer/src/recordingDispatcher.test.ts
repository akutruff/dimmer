
import { createRecordingDispatcher, createContext, resetEnvironment, clearContext, DispatchContext, ObjectDelta } from '.';
import { isProxy } from './dimmer';
import { Next } from './middleware';

describe('RecordingDispatcher', () => {
    beforeEach(() => {
        resetEnvironment();
        createContext();
    });

    afterEach(() => {
        clearContext();
    });

    type State = {
        prop0: string;
        prop1: number;
    };

    describe('createRecordingDispatcher and mutate', () => {
        it('supports middleware', async () => {
            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const command = jest.fn(() => { });
            const recordingDispatcher = createRecordingDispatcher(middleware);
            recordingDispatcher.mutate(command, {});

            expect(middleware.mock.calls.length).toBe(1);
            expect(command.mock.calls.length).toBe(1);
        });

        it('does not call command when middleware does not call next()', async () => {
            const middleware = jest.fn((_context: DispatchContext, _next: Next) => { });

            const command = jest.fn(() => { });
            const recordingDispatcher = createRecordingDispatcher(middleware);
            recordingDispatcher.mutate(command, {});

            expect(middleware.mock.calls.length).toBe(1);
            expect(command.mock.calls.length).toBe(0);
        });

        it('informs middleware of reentrancy', async () => {
            const middlewareReentrancy: (number | undefined)[] = [];
            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                middlewareReentrancy.push(context.callstackDepth);
                next();
            });

            const reentrantCommand = jest.fn(() => { });

            const recordingDispatcher = createRecordingDispatcher(middleware);

            const command = jest.fn(() => {
                recordingDispatcher.mutate(reentrantCommand, {});
            });

            recordingDispatcher.mutate(command, {});

            expect(middlewareReentrancy).toEqual([0, 1]);

            expect(middleware.mock.calls.length).toBe(2);
            expect(command.mock.calls.length).toBe(1);
            expect(reentrantCommand.mock.calls.length).toBe(1);
        });

        it('records deltas', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const command = jest.fn((state: State) => {
                expect(isProxy(state)).toBe(true);
                state.prop0 = 'adfaf';
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            recordingDispatcher.mutate(command, state);

            expect(state.prop0).toBe('adfaf');
            expect(middleware.mock.calls.length).toBe(1);
            expect(command.mock.calls.length).toBe(1);

            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[0][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
        });
    });

    describe('mutateAsync', () => {
        it('yielding results in new delta recording', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            await recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                state = yield;
                state.prop0 = 'foobar';
            }, state);

            expect(state.prop0).toBe('foobar');
            expect(middleware.mock.calls.length).toBe(2);

            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(0);
            expect(middleware.mock.calls[1][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[1][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
        });

        it('can await inside', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            await recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                const value = await sleep(100, 'foobar');
                state = yield;
                state.prop0 = value;
            }, state);

            expect(state.prop0).toBe('foobar');
            expect(middleware.mock.calls.length).toBe(2);
            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(0);
            expect(middleware.mock.calls[1][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[1][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
        });

        it('can await inside then yield', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            await recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                const value = await sleep(100, 'foobar');
                state = yield;
                state.prop0 = value;
            }, state);

            expect(state.prop0).toBe('foobar');
            expect(middleware.mock.calls.length).toBe(2);

            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(0);
            expect(middleware.mock.calls[1][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[1][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
        });

        it('records deltas when there is no yield', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            await recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                state.prop0 = 'foobar';
            }, state);

            expect(state.prop0).toBe('foobar');
            expect(middleware.mock.calls.length).toBe(1);
            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[0][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
        });

        it('supports nested async generators', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            async function* nestedAsyncGenerator(state: State) {
                state.prop0 = 'nested';
            }

            const recordingDispatcher = createRecordingDispatcher(middleware);
            await recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                yield* nestedAsyncGenerator(state);

            }, state);

            expect(state.prop0).toBe('nested');
            expect(middleware.mock.calls.length).toBe(1);

            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[0][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
        });

        it('supports nested async generators with awaits', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            async function* nestedAsyncGenerator(state: State) {
                const value = await sleep(100, 'nested');
                state = yield;
                state.prop0 = value;
            }

            const recordingDispatcher = createRecordingDispatcher(middleware);
            await recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                const value = await sleep(100, 'top');
                state = yield;
                state.prop0 = value;
                yield* nestedAsyncGenerator(state);

            }, state);

            expect(state.prop0).toBe('nested');
            expect(middleware.mock.calls.length).toBe(3);

            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(0);
            expect(middleware.mock.calls[1][0].deltas?.length).toEqual(1);
            expect(middleware.mock.calls[2][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[1][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
        });
    });

    describe('cancelAllAsyncOperations', () => {
        it('outstanding operations are not continued', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            let wasCancelThrown = false;

            const asyncOperation = recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                state.prop0 = 'one';
                state = yield;
                state.prop0 = 'two';
            }, state);

            asyncOperation.catch(() => {
                wasCancelThrown = true;
            });

            expect(recordingDispatcher.executingAsyncOperations.size).toBe(1);

            await recordingDispatcher.cancelAllAsyncOperations();
            expect(wasCancelThrown).toBe(true);
            expect(state.prop0).toBe('one');

            expect(recordingDispatcher.executingAsyncOperations.size).toBe(0);

            expect(middleware.mock.calls.length).toBe(1);
            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[0][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');
            // expect(middleware.mock.calls[1][0].deltas).toEqual([]);
        });

        it('outstanding operations are not continued when there is no yield', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            let wasCancelThrown = false;

            const asyncOperation = recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                state.prop0 = 'one';
            }, state);

            asyncOperation.catch(() => {
                wasCancelThrown = true;
            });

            expect(recordingDispatcher.executingAsyncOperations.size).toBe(1);

            await recordingDispatcher.cancelAllAsyncOperations();
            expect(wasCancelThrown).toBe(true);
            expect(state.prop0).toBe('one');

            expect(recordingDispatcher.executingAsyncOperations.size).toBe(0);

            expect(middleware.mock.calls.length).toBe(1);
            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(1);
            expect((middleware.mock.calls[0][0].deltas![0] as ObjectDelta<State>).get('prop0')).toBe('hello');

        });

        it('cancel during await', async () => {
            const state: State = { prop0: 'hello', prop1: 2 };

            const middleware = jest.fn((context: DispatchContext, next: Next) => {
                next();
            });

            const recordingDispatcher = createRecordingDispatcher(middleware);
            let wasCancelThrown = false;

            let didSleepFinish = false;
            const asyncOperation = recordingDispatcher.mutateAsync(async function* asyncFunction(state) {
                await sleep(2000, 'dasfdadfaghmnjczv');
                didSleepFinish = true;
                state = yield;
                state.prop0 = 'one';
            }, state);

            asyncOperation.catch(() => {
                wasCancelThrown = true;
            });

            expect(recordingDispatcher.executingAsyncOperations.size).toBe(1);

            await recordingDispatcher.cancelAllAsyncOperations();
            expect(didSleepFinish).toBe(true);
            expect(wasCancelThrown).toBe(true);

            expect(recordingDispatcher.executingAsyncOperations.size).toBe(0);

            expect(middleware.mock.calls.length).toBe(1);
            expect(middleware.mock.calls[0][0].deltas?.length).toEqual(0);
        });
    });
});

function sleep<TReturn>(milliseconds: number, value: TReturn) {
    return new Promise<TReturn>(resolve => setTimeout(() => resolve(value), milliseconds));
}