import * as nacl from 'tweetnacl'

import {FieldPositions, ByteLengths, MetadataLength} from './constants'
import {RecordMetadata} from './types'
import {
  assert,
  hexToBytes,
  strToBytes,
  numToBytes,
  bytesToHex,
  bytesToStr,
  bytesToInt,
  bytesEquals,
  trimZeroes,
} from './client_utils'

export class Record {
  private zeroes16 = new Uint8Array(16)
  private zeroes64 = new Uint8Array(64)

  public data: Uint8Array

  private newMetadata({
    user,
    site,
    link,
    tag,
    time,
    type,
    version,
    network,
  }: RecordMetadata): Uint8Array {
    console.log('bepa', time, time && numToBytes(time, 16))
    return new Uint8Array([
      ...(user ? hexToBytes(user, 64) : this.zeroes64),
      ...(site ? hexToBytes(site, 64) : this.zeroes64),
      ...(link ? hexToBytes(link, 64) : this.zeroes64),
      ...(tag ? strToBytes(tag, 64) : this.zeroes64),
      ...(time ? numToBytes(time, 16) : this.zeroes16),
      ...(type ? strToBytes(type, 16) : this.zeroes16),
      ...(version ? strToBytes(version, 16) : this.zeroes16),
      ...(network ? strToBytes(network, 16) : this.zeroes16),
    ])
  }

  constructor(
    data: Uint8Array,
    metadata?: RecordMetadata,
    secretKey?: Uint8Array
  ) {
    if (metadata && secretKey) {
      const dataHash = nacl.hash(data)
      const metadataBytes = this.newMetadata(metadata)
      const signature = nacl.sign.detached(
        new Uint8Array([...dataHash, ...metadataBytes]),
        secretKey
      )
      const record = new Uint8Array([
        ...signature,
        ...dataHash,
        ...metadataBytes,
        ...data,
      ])
      const id = nacl.hash(record)
      this.data = new Uint8Array([...id, ...record])
    } else {
      this.data = data
    }
  }

  public getRawMetadataByField(field: string): Uint8Array {
    console.log(field, FieldPositions[field], ByteLengths[field])
    return this.data.slice(
      FieldPositions[field],
      FieldPositions[field] + ByteLengths[field]
    )
  }

  public get index(): Uint8Array {
    return this.data.slice(0, FieldPositions['content'])
  }

  public get metadata(): Uint8Array {
    return this.data.slice(FieldPositions['sig'], MetadataLength)
  }

  public get id(): string {
    return bytesToHex(this.getRawMetadataByField('hash'))
  }

  public get sig(): string {
    return bytesToHex(this.getRawMetadataByField('sig'))
  }

  public get hash(): string {
    return bytesToHex(this.getRawMetadataByField('data'))
  }

  public get user(): string {
    return trimZeroes(bytesToHex(this.getRawMetadataByField('user')))
  }

  public get site(): string {
    return bytesToHex(this.getRawMetadataByField('site'))
  }

  public get link(): string {
    return bytesToHex(this.getRawMetadataByField('link'))
  }

  public get tag(): string {
    return bytesToStr(this.getRawMetadataByField('tag'))
  }

  public get time(): Date {
    return new Date(bytesToInt(this.getRawMetadataByField('time')))
  }

  public get type(): string {
    return bytesToStr(this.getRawMetadataByField('type'))
  }

  public get version(): string {
    return bytesToStr(this.getRawMetadataByField('version'))
  }

  public get network(): string {
    return bytesToStr(this.getRawMetadataByField('network'))
  }

  public get content(): Uint8Array {
    return this.data.slice(FieldPositions['content'])
  }

  public get hex(): string {
    return bytesToHex(this.content)
  }

  public get string(): string {
    console.log('content', this.content)
    return bytesToStr(this.content)
  }

  public get json() {
    console.log('string', this.string)
    return JSON.parse(this.string)
  }

  public getImage(type: string): HTMLImageElement {
    const blob = new Blob([this.content], {type})
    const img = new Image()
    img.src = URL.createObjectURL(blob)
    return img
  }

  public get image() {
    return this.getImage(this.type)
  }

  public get jpeg() {
    return this.getImage('image/jpeg')
  }

  public get png() {
    return this.getImage('image/png')
  }

  public get gif() {
    return this.getImage('image/gif')
  }

  public validate(): void {
    // Validate data
    const hash = this.getRawMetadataByField('data')
    assert(
      bytesEquals(nacl.hash(this.content), hash),
      'Record data hash matches content data'
    )

    // Validate ownership
    const metadata = this.metadata
    const signature = this.getRawMetadataByField('sig')
    const user = this.getRawMetadataByField('user')
    const verified = nacl.sign.detached.verify(
      new Uint8Array([...hash, ...metadata]),
      signature,
      user
    )
    assert(verified, 'Record is signed by user')

    // Validate record
    const record = this.data.slice(MetadataLength)
    assert(
      bytesEquals(nacl.hash(record), this.getRawMetadataByField('hash')),
      'Record id matches record data'
    )
  }

  public empty(): void {
    this.data = new Uint8Array()
  }
}
