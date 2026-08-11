// index.ts: the public face of the net module. Everything else in this
// directory is implementation detail; other modules should only ever import
// from here.

export type { ClaimResult, Connection, ConnectionStatus } from './connection'
export { claimHandle, connect, createGroup, resolveHandle } from './connection'
export { localActor, setLocalName } from './identity'
