import * as nacl from 'tweetnacl'
import * as QRCode from 'qrcode'

import {parseRecord, formatDataRecord, formatRecord} from './format'
import {assert, hexToBytes, bytesToHex} from './client_utils'
import {
  HashHash,
  ArcjetStorageKeys,
  ArcjetStorage,
  IFind,
  RecordMetadata,
} from './types'

const hashAsByteArray = (data: string): Uint8Array =>
  nacl.hash(hexToBytes(data))

const hashAsString = (data: string): string => bytesToHex(hashAsByteArray(data))

export default class Arcjet {
  public host: string

  private users: HashHash = {}
  private shaLength = 128
  private emptyHash: string
  private siteHash: string

  constructor(host: string = 'http://127.0.0.1:3000', siteHash?: string) {
    this.emptyHash = '0'.repeat(this.shaLength)
    this.host = host
    this.siteHash = siteHash || hashAsString(window.location.hostname)
  }

  private download(data: string) {
    var link = document.createElement('a')
    link.download = 'filename.png'
    link.href = data
    link.click()
  }

  private async save(keys: any) {
    localStorage.setItem(ArcjetStorageKeys.ARCJET_PUBLIC_KEY, keys.publicKey)
    localStorage.setItem(ArcjetStorageKeys.ARCJET_PRIVATE_KEY, keys.privateKey)
  }

  private load(): ArcjetStorage {
    const ARCJET_PUBLIC_KEY = localStorage.getItem(
      ArcjetStorageKeys.ARCJET_PUBLIC_KEY
    )
    const ARCJET_PRIVATE_KEY = localStorage.getItem(
      ArcjetStorageKeys.ARCJET_PRIVATE_KEY
    )

    if (ARCJET_PUBLIC_KEY && ARCJET_PRIVATE_KEY) {
      return {
        ARCJET_PUBLIC_KEY,
        ARCJET_PRIVATE_KEY,
      }
    } else {
      throw 'No Auth Data'
    }
  }

  public user(): string {
    const user = localStorage.getItem(ArcjetStorageKeys.ARCJET_PUBLIC_KEY)
    if (user) {
      return user
    } else {
      throw new Error('No user')
    }
  }

  public async generate() {
    try {
      const keys = nacl.sign.keyPair()
      const privateKey = bytesToHex(keys.secretKey)
      const publicKey = bytesToHex(keys.publicKey)
      const qr = await QRCode.toDataURL(privateKey)
      if (document) this.download(qr)
      if (localStorage) await this.save({privateKey, publicKey})
    } catch (err) {
      console.error(err)
    }
  }

  public validate = async (record: string): Promise<string> => {
    const {recordHash, userHash, dataHash, signature, data} = parseRecord(
      record
    )
    let userPublicKey = this.users[userHash]

    if (!userPublicKey) {
      const req = await fetch(`${this.host}/store/${userHash}`)
      const data = await req.text()
      userPublicKey = parseRecord(data).data
    }

    const recDataHash = hashAsString(data)
    const recRecordHash = hashAsString(record.substr(this.shaLength + 1))

    const verified = nacl.sign.detached.verify(
      hexToBytes(recDataHash),
      hexToBytes(signature),
      hexToBytes(userPublicKey)
    )

    console.log(
      verified,
      recDataHash === dataHash,
      recRecordHash === recordHash,
      recRecordHash,
      recordHash
    )

    if (verified && recDataHash === dataHash && recRecordHash === recordHash) {
      return data
    } else {
      return '400'
    }
  }

  public async get(recordHash: string): Promise<string> {
    const res = await fetch(`${this.host}/store/${recordHash}`)
    if (res.status === 200) {
      const record = await res.text()
      return await this.validate(record)
    }
    return '404'
  }

  public async set(
    content: string,
    {
      site = this.siteHash,
      link = this.emptyHash,
      tag = '',
      time = Date.now(),
      type = 'json',
      version = '0.0.0',
      network = 'mainnet',
    }: RecordMetadata
  ) {
    const {ARCJET_USER_HASH: user, ARCJET_PRIVATE_KEY: privateKey} = this.load()

    const dataHashArray = hashAsByteArray(content)

    const recordString = formatDataRecord({
      user,
      site,
      link,
      data: bytesToHex(dataHashArray),
      tag,
      time,
      type,
      version,
      network,
      data,
    })

    const signature = nacl.sign.detached(dataHashArray, hexToBytes(privateKey))

    sig: bytesToHex(signature),

    const recordHash = hashAsString(recordString)

    const res = await fetch(`${this.host}/store`, {
      method: 'POST',
      body: formatRecord({recordHash, recordString}),
    })

    const recRecordHash = await res.text()
    assert(
      recordHash === recRecordHash,
      'Record hash from server must match computed record hash'
    )
    return recordHash
  }

  public async find({userHash, tag, limit, offset}: IFind): Promise<string[]> {
    const url = [this.host, 'find', userHash, tag]
    if (limit) url.push(limit.toString())
    if (limit && offset) url.push(offset.toString())
    const res = await fetch(url.join('/'))
    if (res.status === 200) {
      const response = await res.text()
      const records = response.split('\n')
      const results = await Promise.all(records.map(this.validate))
      return results as any
    }
    return ['404']
  }
}
