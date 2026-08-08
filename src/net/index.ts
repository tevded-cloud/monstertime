// index.ts: the public face of the net module. Everything else in this
// directory is implementation detail; other modules should only ever import
// from here.

export type { Connection, ConnectionStatus } from './connection'
export { connect, createGroup } from './connection'
export { localActor, setLocalName } from './identity'
